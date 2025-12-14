// nexus-generator/src/services/db.ts
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { World, UniversalEntity, RulebookPackage } from '../types';
import { RollCandidate } from './rollerEngine';

// ==========================================
// BUILD STATE TYPES (for persistence)
// ==========================================

export type PoolBuildStatus = 'pending' | 'infrastructure' | 'generating' | 'persisting' | 'completed' | 'failed';

export interface PersistedPoolState {
    poolName: string;
    status: PoolBuildStatus;
    infrastructurePersisted: boolean;
    seedsPersisted: boolean;
    seedsPersistedCount: number;
    seedsTotalCount: number;
    error?: string;
    lastUpdatedAt: number;
    componentId?: string;
    tokensUsed: number;
}

export interface PersistedBuildState {
    buildId: string;
    worldId: string;
    startedAt: number;
    completedAt?: number;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    pools: Record<string, PersistedPoolState>;
    totalTokens: number;
    currentStage: string;
    progress: number;
}

export interface PersistedSeedKey {
    /** Composite key: buildId:poolName:idempotencyKey */
    id: string;
    buildId: string;
    poolName: string;
    idempotencyKey: string;
    persistedAt: number;
}

interface NexusDB extends DBSchema {
  worlds: {
    key: string;
    value: World; 
  };
  entities: {
    key: string;
    // EXTENDED TYPE: We inject 'activeComponents' for indexing purposes
    value: UniversalEntity & { 
        worldId: string; 
        poolName: string; 
        activeComponents: string[] 
    };
    indexes: { 
        'by-world-pool': [string, string]; 
        'by-world': string;
        'by-tag': string; 
        'by-component': string; 
    };
  };
  // NEW: Build state persistence for crash recovery
  buildStates: {
    key: string;
    value: PersistedBuildState;
    indexes: {
        'by-world': string;
        'by-status': string;
    };
  };
  // NEW: Persisted seed keys for idempotency
  persistedSeeds: {
    key: string;
    value: PersistedSeedKey;
    indexes: {
        'by-build': string;
        'by-build-pool': [string, string];
    };
  };
}

const DB_NAME = 'nexus-core-db';
const DB_VERSION = 5; 

class DatabaseService {
  private dbPromise: Promise<IDBPDatabase<NexusDB>>;

  constructor() {
    this.dbPromise = openDB<NexusDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, newVersion, transaction) {
        if (oldVersion < 1) {
            db.createObjectStore('worlds', { keyPath: 'id' });
            const entityStore = db.createObjectStore('entities', { keyPath: 'id' });
            entityStore.createIndex('by-world-pool', ['worldId', 'poolName']);
        }
        if (oldVersion < 2) {
            const entityStore = transaction.objectStore('entities');
            if (!entityStore.indexNames.contains('by-world')) {
                entityStore.createIndex('by-world', 'worldId');
            }
        }
        if (oldVersion < 3) {
            const entityStore = transaction.objectStore('entities');
            if (!entityStore.indexNames.contains('by-tag')) {
                entityStore.createIndex('by-tag', 'tags', { multiEntry: true });
            }
        }
        if (oldVersion < 4) {
            const entityStore = transaction.objectStore('entities');
            if (!entityStore.indexNames.contains('by-component')) {
                entityStore.createIndex('by-component', 'activeComponents', { multiEntry: true });
            }
        }
        // NEW: Build state and seed idempotency stores (v5)
        if (oldVersion < 5) {
            // Build states store
            if (!db.objectStoreNames.contains('buildStates')) {
                const buildStore = db.createObjectStore('buildStates', { keyPath: 'buildId' });
                buildStore.createIndex('by-world', 'worldId');
                buildStore.createIndex('by-status', 'status');
            }
            // Persisted seeds store (for idempotency)
            if (!db.objectStoreNames.contains('persistedSeeds')) {
                const seedStore = db.createObjectStore('persistedSeeds', { keyPath: 'id' });
                seedStore.createIndex('by-build', 'buildId');
                seedStore.createIndex('by-build-pool', ['buildId', 'poolName']);
            }
        }
      },
    });
  }

  // --- WORLD OPERATIONS ---

  async saveWorld(world: World): Promise<void> {
    const db = await this.dbPromise;
    const { pools, ...metaData } = world;
    
    // Light save: Don't duplicate entity data in the 'worlds' store
    const lightPools: Record<string, any> = {};
    if (pools) {
        Object.keys(pools).forEach(key => {
            lightPools[key] = {
                ...pools[key],
                entities: [] // FORCE EMPTY
            };
        });
    }

    const worldPayload = { ...metaData, pools: lightPools } as World;
    await db.put('worlds', worldPayload);
  }

  async loadWorldMeta(id: string): Promise<World | undefined> {
    const db = await this.dbPromise;
    return db.get('worlds', id);
  }

  async listWorlds(): Promise<{ id: string; name: string; type: string }[]> {
    const db = await this.dbPromise;
    const worlds = await db.getAll('worlds');
    return worlds.map(w => ({ id: w.id, name: w.name, type: w.type }));
  }

  async deleteWorld(id: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(['worlds', 'entities'], 'readwrite');
    await tx.objectStore('worlds').delete(id);
    const entityStore = tx.objectStore('entities');
    const index = entityStore.index('by-world');
    let cursor = await index.openKeyCursor(IDBKeyRange.only(id));
    const deletePromises: Promise<void>[] = [];
    while (cursor) {
        deletePromises.push(entityStore.delete(cursor.primaryKey));
        cursor = await cursor.continue();
    }
    await Promise.all(deletePromises);
    await tx.done;
  }

  // --- ENTITY OPERATIONS ---
  private prepareEntity(worldId: string, poolName: string, entity: UniversalEntity) {
      return {
          ...entity,
          worldId,
          poolName,
          // Dynamically index which components this entity actually possesses
          activeComponents: entity.components ? Object.keys(entity.components) : []
      };
  }

  async saveEntity(worldId: string, poolName: string, entity: UniversalEntity): Promise<void> {
    const db = await this.dbPromise;
    await db.put('entities', this.prepareEntity(worldId, poolName, entity));
  }

  async saveEntitiesBatch(worldId: string, poolName: string, entities: UniversalEntity[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('entities', 'readwrite');
    const store = tx.objectStore('entities');
    await Promise.all([
        ...entities.map(ent => store.put(this.prepareEntity(worldId, poolName, ent))),
        tx.done
    ]);
  }

  async deleteEntity(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('entities', id);
  }

  async getEntitiesForPoolPaginated(
      worldId: string, 
      poolName: string, 
      page: number = 1, 
      pageSize: number = 50
  ): Promise<{ items: UniversalEntity[], total: number }> {
    const db = await this.dbPromise;
    const range = IDBKeyRange.only([worldId, poolName]);
    const total = await db.countFromIndex('entities', 'by-world-pool', range);
    let cursor = await db.transaction('entities').store.index('by-world-pool').openCursor(range);
    const items: UniversalEntity[] = [];
    if (!cursor) return { items: [], total };

    const offset = (page - 1) * pageSize;
    if (offset > 0) await cursor.advance(offset);
    
    while (cursor && items.length < pageSize) {
        items.push(cursor.value);
        cursor = await cursor.continue();
    }
    return { items, total };
  }

  /**
   * @deprecated Use paginated fetch for UI. This is for exports only.
   */
  async getEntitiesForPool(worldId: string, poolName: string): Promise<UniversalEntity[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('entities', 'by-world-pool', [worldId, poolName]);
  }

  // --- AGGREGATION ---
  
  /**
   * Fast count of all entities in a world, grouped by pool.
   * Scans the index without loading entity values.
   */
  async getPoolCounts(worldId: string): Promise<Record<string, number>> {
      const db = await this.dbPromise;
      const tx = db.transaction('entities', 'readonly');
      const index = tx.store.index('by-world');
      
      const counts: Record<string, number> = {};
      let cursor = await index.openCursor(IDBKeyRange.only(worldId));
      
      while (cursor) {
          const poolName = cursor.value.poolName;
          counts[poolName] = (counts[poolName] || 0) + 1;
          cursor = await cursor.continue();
      }
      
      return counts;
  }

  // --- COMPONENT USAGE ---

  async getComponentUsageStats(worldId: string, componentId: string): Promise<{ totalCount: number, poolCounts: Record<string, number>, examples: string[] }> {
    const db = await this.dbPromise;
    const tx = db.transaction('entities', 'readonly');
    // Using the new 'by-component' index for O(k) lookups
    const index = tx.store.index('by-component');
    
    let cursor = await index.openCursor(IDBKeyRange.only(componentId));
    
    let totalCount = 0;
    const poolCounts: Record<string, number> = {};
    const examples: string[] = [];

    while (cursor) {
        const ent = cursor.value;
        if (ent.worldId === worldId) {
            totalCount++;
            poolCounts[ent.poolName] = (poolCounts[ent.poolName] || 0) + 1;
            if (examples.length < 3) examples.push(ent.name);
        }
        cursor = await cursor.continue();
    }
    return { totalCount, poolCounts, examples };
  }

  // --- TAG OPERATIONS ---

  async getTagUsageCount(worldId: string, tagId: string): Promise<number> {
    const db = await this.dbPromise;
    let cursor = await db.transaction('entities').store.index('by-tag').openCursor(IDBKeyRange.only(tagId));
    let count = 0;
    while (cursor) {
        if (cursor.value.worldId === worldId) {
            count++;
        }
        cursor = await cursor.continue();
    }
    return count;
  }

  // NEW: Get Top Tags by counting actual usage in the index
  async getTopTags(worldId: string, limit: number = 20): Promise<string[]> {
      const db = await this.dbPromise;
      const tx = db.transaction('entities', 'readonly');
      const index = tx.store.index('by-tag');
      
      const tagCounts = new Map<string, number>();
      
      // Iterate entire index (Note: Optimization would require a separate analytics store)
      // For local IDB, scanning a few thousand keys is generally instantaneous.
      let cursor = await index.openCursor();
      
      while (cursor) {
          if (cursor.value.worldId === worldId) {
              const tag = cursor.key as string;
              tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          }
          cursor = await cursor.continue();
      }

      // Sort and slice
      return Array.from(tagCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(entry => entry[0]);
  }

  async migrateTag(worldId: string, oldTagId: string, newTagId: string): Promise<number> {
    const db = await this.dbPromise;
    const tx = db.transaction('entities', 'readwrite');
    const index = tx.store.index('by-tag');
    let cursor = await index.openCursor(IDBKeyRange.only(oldTagId));
    let count = 0;

    while (cursor) {
        const ent = cursor.value;
        if (ent.worldId === worldId) {
            const newTags = new Set(ent.tags);
            newTags.delete(oldTagId);
            newTags.add(newTagId);
            const updated = { ...ent, tags: Array.from(newTags) };
            cursor.update(updated);
            count++;
        }
        cursor = await cursor.continue();
    }
    await tx.done;
    return count;
  }

  // --- EXPORT / ROLLER ---

  async getFullWorldPackage(worldId: string): Promise<RulebookPackage | null> {
      const world = await this.loadWorldMeta(worldId);
      if (!world) return null;
      const poolNames = Object.keys(world.pools);
      const entityGroups = await Promise.all(
          poolNames.map(name => this.getEntitiesForPool(worldId, name))
      );
      poolNames.forEach((name, idx) => {
          world.pools[name].entities = entityGroups[idx];
      });
      return {
          version: '5.1-DynamicECS',
          exportDate: Date.now(),
          world
      };
  }

  async getRollCandidates(worldId: string, poolName: string): Promise<RollCandidate[]> {
    const db = await this.dbPromise;
    const tx = db.transaction('entities', 'readonly');
    const index = tx.store.index('by-world-pool');
    
    const candidates: RollCandidate[] = [];
    let cursor = await index.openCursor(IDBKeyRange.only([worldId, poolName]));
    
    while (cursor) {
        const val = cursor.value;
        // SAFE ACCESS: Rarity is now just a key-value in a component
        const rarity = val.components['rarity']?.['value'] || 'Common';
        
        candidates.push({
            id: val.id,
            name: val.name,
            tags: val.tags,
            rarity: String(rarity),
            original: val 
        });
        cursor = await cursor.continue();
    }
    return candidates;
  }

  async searchEntities(worldId: string, query: string, limit: number = 50, poolName?: string): Promise<UniversalEntity[]> {
    const db = await this.dbPromise;
    const tx = db.transaction('entities', 'readonly');
    
    let cursor;
    if (poolName && poolName !== 'All') {
        const index = tx.store.index('by-world-pool');
        cursor = await index.openCursor(IDBKeyRange.only([worldId, poolName]));
    } else {
        const index = tx.store.index('by-world');
        cursor = await index.openCursor(IDBKeyRange.only(worldId));
    }
    
    const results: UniversalEntity[] = [];
    const lowerQuery = query.toLowerCase().trim();
    const isQueryEmpty = !lowerQuery;

    while (cursor && results.length < limit) {
        const val = cursor.value;
        if (isQueryEmpty) {
            results.push(val);
        } else {
            if (val.name.toLowerCase().includes(lowerQuery)) {
                results.push(val);
            } else {
                const tags = val.tags;
                let match = false;
                for (let i = 0; i < tags.length; i++) {
                    if (tags[i].toLowerCase().includes(lowerQuery)) {
                        match = true;
                        break;
                    }
                }
                if (match) results.push(val);
            }
        }
        cursor = await cursor.continue();
    }
    return results;
  }

  // ==========================================
  // BUILD STATE OPERATIONS
  // ==========================================

  /**
   * Save or update a build state
   */
  async saveBuildState(state: PersistedBuildState): Promise<void> {
    const db = await this.dbPromise;
    await db.put('buildStates', state);
  }

  /**
   * Load a build state by ID
   */
  async loadBuildState(buildId: string): Promise<PersistedBuildState | undefined> {
    const db = await this.dbPromise;
    return db.get('buildStates', buildId);
  }

  /**
   * Get all incomplete (running) builds for a world
   */
  async getIncompleteBuildsForWorld(worldId: string): Promise<PersistedBuildState[]> {
    const db = await this.dbPromise;
    const tx = db.transaction('buildStates', 'readonly');
    const index = tx.store.index('by-world');
    
    const results: PersistedBuildState[] = [];
    let cursor = await index.openCursor(IDBKeyRange.only(worldId));
    
    while (cursor) {
        const state = cursor.value;
        if (state.status === 'running') {
            results.push(state);
        }
        cursor = await cursor.continue();
    }
    
    return results;
  }

  /**
   * Get the most recent incomplete build (any world)
   * Useful for recovery prompt on app start
   */
  async getMostRecentIncompleteBuild(): Promise<PersistedBuildState | undefined> {
    const db = await this.dbPromise;
    const tx = db.transaction('buildStates', 'readonly');
    const index = tx.store.index('by-status');
    
    let cursor = await index.openCursor(IDBKeyRange.only('running'));
    let mostRecent: PersistedBuildState | undefined;
    
    while (cursor) {
        const state = cursor.value;
        if (!mostRecent || state.startedAt > mostRecent.startedAt) {
            mostRecent = state;
        }
        cursor = await cursor.continue();
    }
    
    return mostRecent;
  }

  /**
   * Delete a build state and its associated seed keys
   */
  async deleteBuildState(buildId: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(['buildStates', 'persistedSeeds'], 'readwrite');
    
    // Delete build state
    await tx.objectStore('buildStates').delete(buildId);
    
    // Delete associated seed keys
    const seedStore = tx.objectStore('persistedSeeds');
    const index = seedStore.index('by-build');
    let cursor = await index.openKeyCursor(IDBKeyRange.only(buildId));
    
    while (cursor) {
        await seedStore.delete(cursor.primaryKey);
        cursor = await cursor.continue();
    }
    
    await tx.done;
  }

  /**
   * Clean up old completed builds (keep last N)
   */
  async cleanupOldBuilds(keepCount: number = 10): Promise<number> {
    const db = await this.dbPromise;
    const allStates = await db.getAll('buildStates');
    
    // Sort by startedAt descending
    const completed = allStates
        .filter(s => s.status === 'completed' || s.status === 'cancelled')
        .sort((a, b) => b.startedAt - a.startedAt);
    
    const toDelete = completed.slice(keepCount);
    
    for (const state of toDelete) {
        await this.deleteBuildState(state.buildId);
    }
    
    return toDelete.length;
  }

  // ==========================================
  // SEED IDEMPOTENCY OPERATIONS
  // ==========================================

  /**
   * Record a persisted seed for idempotency tracking
   */
  async recordPersistedSeed(
    buildId: string, 
    poolName: string, 
    idempotencyKey: string
  ): Promise<void> {
    const db = await this.dbPromise;
    const id = `${buildId}:${poolName}:${idempotencyKey}`;
    
    await db.put('persistedSeeds', {
        id,
        buildId,
        poolName,
        idempotencyKey,
        persistedAt: Date.now()
    });
  }

  /**
   * Check if a seed was already persisted (idempotency check)
   */
  async isSeedPersisted(
    buildId: string, 
    poolName: string, 
    idempotencyKey: string
  ): Promise<boolean> {
    const db = await this.dbPromise;
    const id = `${buildId}:${poolName}:${idempotencyKey}`;
    const existing = await db.get('persistedSeeds', id);
    return !!existing;
  }

  /**
   * Get all persisted seed keys for a build+pool
   * Used for recovery to populate in-memory set
   */
  async getPersistedSeedKeys(
    buildId: string, 
    poolName: string
  ): Promise<Set<string>> {
    const db = await this.dbPromise;
    const tx = db.transaction('persistedSeeds', 'readonly');
    const index = tx.store.index('by-build-pool');
    
    const keys = new Set<string>();
    let cursor = await index.openCursor(IDBKeyRange.only([buildId, poolName]));
    
    while (cursor) {
        keys.add(cursor.value.idempotencyKey);
        cursor = await cursor.continue();
    }
    
    return keys;
  }

  /**
   * Get all persisted seed keys for a build (all pools)
   */
  async getAllPersistedSeedKeysForBuild(
    buildId: string
  ): Promise<Map<string, Set<string>>> {
    const db = await this.dbPromise;
    const tx = db.transaction('persistedSeeds', 'readonly');
    const index = tx.store.index('by-build');
    
    const result = new Map<string, Set<string>>();
    let cursor = await index.openCursor(IDBKeyRange.only(buildId));
    
    while (cursor) {
        const { poolName, idempotencyKey } = cursor.value;
        if (!result.has(poolName)) {
            result.set(poolName, new Set());
        }
        result.get(poolName)!.add(idempotencyKey);
        cursor = await cursor.continue();
    }
    
    return result;
  }

  /**
   * Get count of persisted seeds for a build+pool
   */
  async getPersistedSeedCount(buildId: string, poolName: string): Promise<number> {
    const db = await this.dbPromise;
    return db.countFromIndex('persistedSeeds', 'by-build-pool', [buildId, poolName]);
  }
}

export const db = new DatabaseService();