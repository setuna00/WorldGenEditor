// nexus-generator/src/services/worldManager.ts
import { db } from './db';
import { 
    World, 
    UniversalEntity, 
    Rule, 
    WorldConfig, 
    PoolCategory, 
    ComponentDefinition,
    TagDefinition
} from '../types';

// --- CORE SYSTEM COMPONENTS ---
export const STANDARD_COMPONENTS: ComponentDefinition[] = [
    {
        id: 'metadata',
        label: 'Metadata',
        category: 'System', 
        isCore: true,       
        fields: [
            { key: 'id', type: 'text', defaultValue: 'UUID' },
            { key: 'created_at', type: 'date', defaultValue: '' }
        ]
    },
    {
        id: 'rarity',
        label: 'Rarity',
        category: 'System',
        isCore: true,
        fields: [
            { key: 'value', type: 'select', defaultValue: 'Common', options: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] }
        ]
    }
];

export interface TagAnalytics {
    [tagId: string]: {
        count: number;
        sources: string[];
        label: string;
        color: string;
    }
}

export const normalizeTagId = (text: string): string => {
    if (!text) return '';
    return text.trim().toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\p{L}\p{N}_-]+/gu, ''); 
};

export class WorldManager {
  // TODO: analyticsCache is currently unused - getTagAnalytics() always returns empty object.
  // Either implement real analytics population or remove this feature in a future refactor.
  private analyticsCache = new Map<string, TagAnalytics>();
  
  async listWorlds() {
    return await db.listWorlds();
  }

  async createWorld(name: string, genre: string): Promise<World> {
    const id = crypto.randomUUID();
    
    // 1. Initialize Registry with ONLY System Core
    const initialRegistry: Record<string, ComponentDefinition> = {};
    STANDARD_COMPONENTS.forEach(def => { initialRegistry[def.id] = def; });

    const newWorld: World = {
      id,
      type: 'Rulebook',
      name,
      config: {
        genre,
        loreContext: `A default setting for ${name}.`,
        contextFields: [],
        raritySettings: {
            defaultLevel: 'Common',
            levels: [
                { id: 'common', label: 'Common', weight: 50, color: '#94a3b8' },
                { id: 'uncommon', label: 'Uncommon', weight: 30, color: '#10b981' },
                { id: 'rare', label: 'Rare', weight: 15, color: '#3b82f6' },
                { id: 'epic', label: 'Epic', weight: 4, color: '#a855f7' },
                { id: 'legendary', label: 'Legendary', weight: 1, color: '#f59e0b' }
            ]
        },
        useGlobalPromptPrefix: false // NEW: Default to false
      },
      componentRegistry: initialRegistry, 
      pools: {},
      rules: [],
      tags: {} 
    };
    
    await db.saveWorld(newWorld);
    return newWorld;
  }

  async loadWorld(id: string, shallow: boolean = true): Promise<World | null> {
    const world = await db.loadWorldMeta(id);
    if (!world) return null;
    
    Object.keys(world.pools).forEach(key => {
        if (!world.pools[key].entities) world.pools[key].entities = [];
    });
    if (!world.componentRegistry) { world.componentRegistry = {}; }
    
    return world;
  }

  async deleteWorld(id: string): Promise<void> {
    await db.deleteWorld(id);
    this.invalidateCache(id);
  }

  async saveWorld(world: World): Promise<void> {
    await db.saveWorld(world);
  }

  async exportWorldToJson(worldId: string): Promise<string | null> {
      const pkg = await db.getFullWorldPackage(worldId);
      if (!pkg) return null;
      return JSON.stringify(pkg, null, 2);
  }

  async importWorldFromJson(jsonStr: string): Promise<World | null> {
      try {
          const pkg = JSON.parse(jsonStr);
          const worldData = pkg.world || pkg; 
          if (!worldData.name) throw new Error("Invalid World Data");

          const newId = crypto.randomUUID();
          const newWorld = { ...worldData, id: newId, name: `${worldData.name} (Imported)` };
          
          await db.saveWorld(newWorld);

          for (const poolName of Object.keys(newWorld.pools)) {
              const entities = newWorld.pools[poolName].entities || [];
              for (const entity of entities) {
                  await db.saveEntity(newId, poolName, entity);
              }
          }

          return newWorld;
      } catch (e) {
          console.error("Import Failed", e);
          return null;
      }
  }

  // --- POOL MANAGEMENT ---
  
  async createPool(worldId: string, poolName: string, type: PoolCategory, description?: string, color?: string): Promise<void> {
    const world = await this.loadWorld(worldId, true);
    if (!world || world.pools[poolName]) return;

    const defaultBlueprint: Record<string, any> = {
        'metadata': { id: 'UUID', created_at: '' }
    };

    world.pools[poolName] = {
      name: poolName,
      type: type,
      description: description || '',
      color: color,
      entities: [],
      defaultComponents: defaultBlueprint, 
      suggestedTags: [],
      relationshipTypes: (type === 'World' || type === 'Character') ? ['Ally of', 'Enemy of'] : undefined
    };
    
    await db.saveWorld(world);
  }

  async deletePool(worldId: string, poolName: string): Promise<void> {
      const world = await this.loadWorld(worldId, true);
      if (!world || !world.pools[poolName]) return;

      // 1. Delete entities from DB
      const entities = await db.getEntitiesForPool(worldId, poolName);
      const deletePromises = entities.map(e => db.deleteEntity(e.id));
      await Promise.all(deletePromises);

      // 2. Remove from World Meta
      delete world.pools[poolName];
      await db.saveWorld(world);
  }

  async renamePool(worldId: string, oldName: string, newName: string): Promise<void> {
      const world = await this.loadWorld(worldId, true);
      if (!world || !world.pools[oldName]) return;
      if (world.pools[newName]) throw new Error(`Pool '${newName}' already exists.`);

      // 1. Move Meta
      world.pools[newName] = { ...world.pools[oldName], name: newName };
      delete world.pools[oldName];
      await db.saveWorld(world);

      // 2. Migrate Entities
      const entities = await db.getEntitiesForPool(worldId, oldName);
      if (entities.length > 0) {
          await db.saveEntitiesBatch(worldId, newName, entities);
      }
  }

  async updatePoolDetails(worldId: string, poolName: string, updates: { description?: string, color?: string }): Promise<void> {
      const world = await this.loadWorld(worldId, true);
      if (!world || !world.pools[poolName]) return;
      
      if (updates.description !== undefined) world.pools[poolName].description = updates.description;
      if (updates.color !== undefined) world.pools[poolName].color = updates.color;
      
      await db.saveWorld(world);
  }

  // --- ENTITY MANAGEMENT ---

  async saveEntityToPool(worldId: string, poolName: string, entity: UniversalEntity): Promise<void> {
    await db.saveEntity(worldId, poolName, entity);
  }

  async deleteEntityFromPool(worldId: string, poolName: string, entityId: string): Promise<void> {
      await db.deleteEntity(entityId);
  }
  
  // --- COMPONENT REGISTRY ---
  
  async updateComponentDefinition(worldId: string, def: ComponentDefinition): Promise<void> {
      const world = await db.loadWorldMeta(worldId);
      if (!world) return;
      if (!world.componentRegistry) world.componentRegistry = {};
      
      world.componentRegistry[def.id] = {
          ...world.componentRegistry[def.id],
          ...def
      };
      
      await db.saveWorld(world);
  }

  async registerComponentDefinition(worldId: string, def: ComponentDefinition, targetPool?: string): Promise<void> {
      const world = await db.loadWorldMeta(worldId);
      if (!world) return;

      let resolvedPoolId: string | undefined = undefined;
      
      if (targetPool) {
          const exactMatch = world.pools[targetPool];
          if (exactMatch) {
              resolvedPoolId = targetPool;
          } else {
              const lowerTarget = targetPool.toLowerCase();
              const found = Object.keys(world.pools).find(k => k.toLowerCase() === lowerTarget);
              if (found) resolvedPoolId = found;
          }
      }

      if (!def.category) {
          def.category = resolvedPoolId ? resolvedPoolId.charAt(0).toUpperCase() + resolvedPoolId.slice(1) : 'General'; 
      }

      world.componentRegistry[def.id] = def;
      await db.saveWorld(world); 

      if (resolvedPoolId && world.pools[resolvedPoolId]) {
          const pool = world.pools[resolvedPoolId];
          const defaults: any = {};
          def.fields.forEach(f => defaults[f.key] = f.defaultValue);
          
          pool.defaultComponents[def.id] = defaults;

          await this.updatePoolBlueprints(worldId, resolvedPoolId, pool.defaultComponents);
      }
  }

  async deleteComponentDefinition(worldId: string, id: string): Promise<void> {
       const world = await db.loadWorldMeta(worldId);
       if (!world || !world.componentRegistry) return;
       
       if (world.componentRegistry[id]?.isCore) {
           throw new Error("Cannot delete Core components.");
       }

       delete world.componentRegistry[id];
       await db.saveWorld(world);
  }

  // --- REPORTING ---
  async getComponentUsageReport(worldId: string, compId: string): Promise<{ 
      pools: string[], 
      entityCount: number, 
      entityExamples: string[],
      usageByPool: Record<string, number> 
  }> {
      const world = await db.loadWorldMeta(worldId);
      if (!world) return { pools: [], entityCount: 0, entityExamples: [], usageByPool: {} };

      const blueprintPools = Object.values(world.pools)
          .filter(p => p.defaultComponents && p.defaultComponents[compId])
          .map(p => p.name);

      const usageStats = await db.getComponentUsageStats(worldId, compId);

      const allActivePools = Array.from(new Set([
          ...blueprintPools,
          ...Object.keys(usageStats.poolCounts)
      ]));

      return {
          pools: allActivePools,
          entityCount: usageStats.totalCount,
          entityExamples: usageStats.examples,
          usageByPool: usageStats.poolCounts
      };
  }
  
  // --- BLUEPRINT PROPAGATION ---
  async updatePoolBlueprints(worldId: string, poolName: string, blueprints: any): Promise<void> {
      const world = await db.loadWorldMeta(worldId);
      if (!world || !world.pools[poolName]) return;

      world.pools[poolName].defaultComponents = blueprints;
      await db.saveWorld(world);

      const { items } = await db.getEntitiesForPoolPaginated(worldId, poolName, 1, 10000); 

      const validComponentIds = new Set(Object.keys(blueprints));
      validComponentIds.add('metadata'); 

      const updatedEntities = items.map(entity => {
          let dirty = false;
          const currentComponents = entity.components || {};
          const newComponents: Record<string, any> = {};

          Object.keys(currentComponents).forEach(compId => {
              if (validComponentIds.has(compId)) {
                  newComponents[compId] = currentComponents[compId];
              } else {
                  dirty = true; 
              }
          });

          Object.keys(blueprints).forEach(compId => {
              if (!newComponents[compId]) {
                  newComponents[compId] = JSON.parse(JSON.stringify(blueprints[compId]));
                  dirty = true;
              } else {
                  const def = blueprints[compId];
                  Object.keys(def).forEach(fieldKey => {
                      if (newComponents[compId][fieldKey] === undefined) {
                          newComponents[compId][fieldKey] = def[fieldKey];
                          dirty = true;
                      }
                  });
              }
          });

          return dirty ? { ...entity, components: newComponents } : null;
      }).filter(Boolean) as UniversalEntity[];

      if (updatedEntities.length > 0) {
          await db.saveEntitiesBatch(worldId, poolName, updatedEntities);
      }
  }

  // --- TAG OPERATIONS ---
  ensureTag(world: World, labelOrId: string): string {
      if (!labelOrId) return '';
      const id = normalizeTagId(labelOrId);
      if (!id) return '';
      if (!world.tags[id]) {
          world.tags[id] = { id, label: labelOrId.trim() };
      }
      return id;
  }
  
  async updateTagDefinition(worldId: string, label: string, description: string): Promise<void> {
      const world = await db.loadWorldMeta(worldId);
      if (!world) return;
      
      const id = normalizeTagId(label);
      if (!id) throw new Error("Invalid Tag Label");

      if (!world.tags[id]) {
          world.tags[id] = { 
              id, 
              label, 
              description,
              color: '#64748b' 
          };
      } else {
          world.tags[id].label = label;
          world.tags[id].description = description;
      }
      
      await db.saveWorld(world);
  }

  async renameTag(worldId: string, oldId: string, newLabel: string): Promise<number> {
      const world = await db.loadWorldMeta(worldId);
      if (!world) return 0;

      const newId = normalizeTagId(newLabel);
      if (!newId) throw new Error("Invalid tag label");
      if (newId === oldId) return 0;

      const migratedCount = await db.migrateTag(worldId, oldId, newId);

      if (!world.tags[newId]) {
          world.tags[newId] = { 
              ...world.tags[oldId], 
              id: newId, 
              label: newLabel 
          };
      }
      delete world.tags[oldId];
      
      await db.saveWorld(world);
      this.invalidateCache(worldId);
      return migratedCount;
  }

  async updateWorldTags(worldId: string, tags: Record<string, TagDefinition>): Promise<void> {
      const world = await db.loadWorldMeta(worldId);
      if (!world) return;
      world.tags = tags;
      await db.saveWorld(world);
  }

  getTagAnalytics(worldId: string): TagAnalytics {
      if (this.analyticsCache.has(worldId)) return this.analyticsCache.get(worldId)!;
      return {}; 
  }

  getAllTags(worldId: string, poolName?: string): string[] {
      const analytics = this.getTagAnalytics(worldId);
      return Object.keys(analytics).map(id => analytics[id].label);
  }

  getTagMetadata(worldId: string, tagId: string) {
      const analytics = this.getTagAnalytics(worldId);
      const data = analytics[tagId];
      if (data) {
          return {
              id: tagId,
              label: data.label,
              color: data.color,
              isGlobal: data.sources.length > 1
          }
      }
      return { id: tagId, label: tagId, color: '#64748b', isGlobal: false };
  }

  resolveTagColor(worldId: string, tagId: string, contextPoolName?: string): string {
      const analytics = this.getTagAnalytics(worldId);
      const data = analytics[tagId];
      return data?.color || '#64748b'; 
  }
  
  resolveRarityColor(world: World, tagId: string): string | null {
      const levels = world.config.raritySettings?.levels || [];
      const match = levels.find(l => l.label.toLowerCase() === tagId.toLowerCase() || l.id === tagId);
      return match ? match.color : null;
  }
  
  async updateWorldConfig(worldId: string, name: string, config: WorldConfig): Promise<void> {
      const world = await db.loadWorldMeta(worldId);
      if (!world) return;
      world.name = name;
      world.config = config;
      await db.saveWorld(world);
  }

  async saveRule(worldId: string, rule: Rule): Promise<void> {
      const world = await db.loadWorldMeta(worldId);
      if (!world) return;
      if (!rule.id) rule.id = crypto.randomUUID();
      const idx = world.rules.findIndex(r => r.id === rule.id);
      if (idx >= 0) world.rules[idx] = rule;
      else world.rules.push(rule);
      await db.saveWorld(world);
  }

  async deleteRule(worldId: string, ruleId: string): Promise<void> {
      const world = await db.loadWorldMeta(worldId);
      if (!world) return;
      world.rules = world.rules.filter(r => r.id !== ruleId);
      await db.saveWorld(world);
  }

  generateContextString(world: World): string {
      let context = `WORLD: ${world.name} (Genre: ${world.config.genre})\n`;
      context += `LORE: ${world.config.loreContext || ''}\n\n`;
      if (world.config.contextFields) {
          world.config.contextFields.forEach(field => {
             if (field.key && field.value) {
                 context += `[${field.key.toUpperCase()}]: ${field.value}\n`;
             }
          });
      }
      return context;
  }

  private invalidateCache(worldId: string) {
      this.analyticsCache.delete(worldId);
  }

  async saveEntitiesToPool(worldId: string, poolName: string, entities: UniversalEntity[]): Promise<void> {
      await db.saveEntitiesBatch(worldId, poolName, entities);
  }
}