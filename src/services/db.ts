// nexus-generator/src/services/db.ts
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { World, UniversalEntity, RulebookPackage } from '../types';
import { RollCandidate } from './rollerEngine';

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
}

const DB_NAME = 'nexus-core-db';
const DB_VERSION = 4; 

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
}

export const db = new DatabaseService();