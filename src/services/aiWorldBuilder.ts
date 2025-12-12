/**
 * AI World Builder Service
 * 
 * Handles AI-powered world creation through multiple phases:
 * 1. Ideation - Generate title/genre options
 * 2. Analysis - Analyze story structure
 * 3. Architecture - Create world blueprint
 * 4. Build - Generate pools, schemas, and seed content
 */

import { worldManager } from "../contexts/ServiceContext";
import { ComponentDefinition, PoolCategory } from "../types";
import { AIPrompts } from "./aiPrompts";
import { buildSchemaForPool } from "./schemaBuilder";
import { AIProvider, StandardSchema } from "./ai/types";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface WorldGenRequest {
  genre: string;
  tone: string;
  scope: string;
}

export interface WorldGenResponse {
  name: string;
  description: string;
  rules: string[];
}

export interface TitleGenreOption {
    titles: string[];
    genres: string[];
}

export interface GenreSummary {
    summary: string;
    detectedGenres: string[];
}

export interface CategorySchema {
    categoryName: string;
    description: string;
}

export interface StoryAnalysisResponse {
  worldPools: string[];
  characterPools: string[];
  assetPools: string[];
  suggestedTags: string[];
  suggestedRelationshipTypes: string[];
}

export interface StoryAnalysis extends StoryAnalysisResponse {
    genreSummary: GenreSummary;
    dynamicSchema: CategorySchema[];
}

export interface WorldArchitecture {
    worldName: string;
    genre: string;
    description: string;
    pools: {
        name: string;
        type: "World" | "Character" | "Asset";
        description: string;
    }[];
}

export interface BuildProgress {
    stage: string;
    message: string;
    progress: number;
}

export interface PoolField {
  name: string;
  type: "string" | "number" | "boolean" | "array";
  description?: string;
}

export interface PoolStructure {
  poolName: string;
  category: "world" | "character" | "assets";
  fields: PoolField[];
}

export interface PoolItem {
  [key: string]: any;
}

export interface PoolData {
  poolName: string;
  items: PoolItem[];
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const TYPE_COLORS: Record<string, string> = {
    'World': '#8b5cf6',      // Purple
    'Character': '#f43f5e',  // Rose
    'Asset': '#10b981',      // Emerald
};

const prependPrefix = (system: string, prefix?: string) => {
    if (!prefix) return system;
    return `[GLOBAL PRE-INSTRUCTION]: ${prefix}\n\n${system}`;
};

// ==========================================
// SCHEMAS (Standard JSON Schema format)
// ==========================================

const IDEATION_SCHEMA: StandardSchema = {
    type: 'object',
    properties: {
        titles: { type: 'array', items: { type: 'string' } },
        genres: { type: 'array', items: { type: 'string' } }
    },
    required: ["titles", "genres"]
};

const ANALYSIS_SCHEMA: StandardSchema = {
    type: 'object',
    properties: {
        genreSummary: {
            type: 'object',
            properties: {
                summary: { type: 'string' },
                detectedGenres: { type: 'array', items: { type: 'string' } }
            },
            required: ["summary", "detectedGenres"]
        },
        dynamicSchema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    categoryName: { type: 'string' },
                    description: { type: 'string' }
                },
                required: ["categoryName", "description"]
            }
        },
        worldPools: { type: 'array', items: { type: 'string' } },
        characterPools: { type: 'array', items: { type: 'string' } },
        assetPools: { type: 'array', items: { type: 'string' } },
        suggestedTags: { type: 'array', items: { type: 'string' } },
        suggestedRelationshipTypes: { type: 'array', items: { type: 'string' } },
    },
    required: ["genreSummary", "dynamicSchema", "worldPools", "characterPools", "assetPools", "suggestedTags", "suggestedRelationshipTypes"]
};

const BLUEPRINT_SCHEMA: StandardSchema = {
    type: 'object',
    properties: {
        worldName: { type: 'string' },
        genre: { type: 'string' },
        description: { type: 'string', description: "A comprehensive World Introduction synthesized from the user's story." },
        pools: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    type: { type: 'string', enum: ["World", "Character", "Asset"] },
                    description: { type: 'string' }
                },
                required: ["name", "type", "description"]
            }
        }
    },
    required: ["worldName", "genre", "description", "pools"]
};

const COMPONENT_DESIGN_SCHEMA: StandardSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        label: { type: 'string' },
        description: { type: 'string' },
        suggestedRelationshipVerbs: { 
            type: 'array', 
            items: { type: 'string' }, 
            description: "List of 3-5 specific relationship verbs (e.g. 'Wields', 'Allied With')" 
        },
        fields: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    key: { type: 'string' },
                    type: { type: 'string', enum: ["text", "number", "boolean", "select", "list"] },
                    defaultValue: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' }, nullable: true }
                },
                required: ["key", "type", "defaultValue"]
            }
        }
    },
    required: ["id", "label", "fields", "suggestedRelationshipVerbs"]
};

// ==========================================
// AI WORLD BUILDER FACTORY
// ==========================================

/**
 * Creates an AIWorldBuilder instance bound to a specific AI provider
 */
export function createAIWorldBuilder(provider: AIProvider) {
    return {
        // --- IDEATION PHASE ---
        async generateTitleGenreOptions(
            language: 'English' | 'Chinese', 
            storyText: string, 
            globalPrefix?: string, 
            toneInstruction?: string
        ): Promise<{ data: TitleGenreOption, tokens: number }> {
            const { system, user } = AIPrompts.ideation(language, storyText, toneInstruction);
            const finalSystem = prependPrefix(system, globalPrefix);

            try {
                const result = await provider.generateStructuredData(finalSystem, user, IDEATION_SCHEMA, 0.7);
                return { data: result.data, tokens: result.tokens };
            } catch (e) {
                return { data: { titles: [], genres: [] }, tokens: 0 };
            }
        },

        // --- ANALYSIS PHASE ---
        async analyzeStory(
            storyText: string, 
            language: 'English' | 'Chinese' = 'English', 
            globalPrefix?: string, 
            toneInstruction?: string
        ): Promise<{ data: StoryAnalysis, tokens: number }> {
            const { system, user } = AIPrompts.analysis(language, storyText, toneInstruction);
            const finalSystem = prependPrefix(system, globalPrefix);

            try {
                const result = await provider.generateStructuredData(finalSystem, user, ANALYSIS_SCHEMA, 0.1);
                return { data: result.data, tokens: result.tokens };
            } catch (error) {
                throw new Error("Failed to analyze story structure.");
            }
        },

        // --- ARCHITECTURE PHASE ---
        async createBlueprint(
            storyText: string, 
            analysis: StoryAnalysis, 
            selectedCategories: string[],
            title: string,
            genre: string,
            language: string,
            globalPrefix?: string,
            toneInstruction?: string
        ): Promise<{ data: WorldArchitecture, tokens: number }> {
            const activePools = analysis.dynamicSchema.filter(c => selectedCategories.includes(c.categoryName));
            const { system, user } = AIPrompts.blueprint(title, genre, language, activePools, storyText, toneInstruction);
            const finalSystem = prependPrefix(system, globalPrefix);

            try {
                const result = await provider.generateStructuredData(finalSystem, user, BLUEPRINT_SCHEMA, 0.2);
                return { data: result.data, tokens: result.tokens };
            } catch (e) {
                throw new Error("Failed to create blueprint");
            }
        },

        // --- BUILD PHASE ---

        // STEP 1: INFRASTRUCTURE (Schemas & Database Objects)
        async buildPoolInfrastructure(
            worldId: string,
            poolDef: { name: string; type: "World" | "Character" | "Asset"; description: string },
            language: string,
            globalPrefix?: string,
            toneInstruction?: string
        ): Promise<{ componentId: string, componentDef: ComponentDefinition, relationshipTypes: string[], tokens: number } | null> {
            
            // 1. Create Pool in DB
            const themeColor = TYPE_COLORS[poolDef.type] || '#64748b';
            await worldManager.createPool(worldId, poolDef.name, poolDef.type, poolDef.description, themeColor);

            // 2. Design Component Schema & Relationship Verbs
            try {
                const { system, user } = AIPrompts.componentDesign(poolDef.name, language, toneInstruction);
                const finalSystem = prependPrefix(system, globalPrefix);

                const result = await provider.generateStructuredData(finalSystem, user, COMPONENT_DESIGN_SCHEMA, 0.2);
                const compDef = result.data;
                
                const cleanId = compDef.id.toLowerCase().replace(/\s+/g, '_');
                const finalDef: ComponentDefinition = {
                    ...compDef,
                    id: cleanId,
                    category: poolDef.name
                };

                await worldManager.registerComponentDefinition(worldId, finalDef, poolDef.name);

                if (compDef.suggestedRelationshipVerbs && compDef.suggestedRelationshipVerbs.length > 0) {
                    const liveWorld = await worldManager.loadWorld(worldId, true);
                    if (liveWorld && liveWorld.pools[poolDef.name]) {
                        liveWorld.pools[poolDef.name].relationshipTypes = compDef.suggestedRelationshipVerbs;
                        await worldManager.saveWorld(liveWorld);
                    }
                }

                return { 
                    componentId: cleanId, 
                    componentDef: finalDef,
                    relationshipTypes: compDef.suggestedRelationshipVerbs || [],
                    tokens: result.tokens
                };

            } catch (e) {
                console.warn(`Failed to generate infrastructure for ${poolDef.name}`, e);
                return null;
            }
        },

        // STEP 2: GENERATION (Seeds via AI)
        async generatePoolSeeds(
            poolDef: { name: string; type: "World" | "Character" | "Asset" },
            componentData: { id: string, def: ComponentDefinition } | null,
            language: string,
            storyText: string,
            complexity: 'Standard' | 'Deep Lore',
            explicitRelationships: string[],
            globalPrefix?: string,
            toneInstruction?: string
        ): Promise<{ seeds: any[], tokens: number }> {
            
            let fieldSummary = "";
            if (componentData?.def) {
                fieldSummary = componentData.def.fields.map(f => {
                    const options = f.options ? `[Options: ${f.options.join(', ')}]` : '';
                    return `${f.key} (${f.type}): ${options}`;
                }).join('\n');
            }

            const { system, user } = AIPrompts.seedContent(
                poolDef.name, 
                poolDef.type, 
                language, 
                storyText, 
                complexity, 
                fieldSummary,
                explicitRelationships,
                toneInstruction
            );
            const finalSystem = prependPrefix(system, globalPrefix);

            const poolStubForSchema = {
                name: poolDef.name,
                type: poolDef.type as PoolCategory,
                defaultComponents: componentData ? { [componentData.id]: {} } : {}, 
                entities: [],
                relationshipTypes: explicitRelationships 
            };
            
            const registryStub = componentData ? { [componentData.id]: componentData.def } : {};
            const seedSchema = buildSchemaForPool(poolStubForSchema, registryStub);

            try {
                const result = await provider.generateStructuredData(finalSystem, user, seedSchema, 0.7);
                return { seeds: result.data, tokens: result.tokens };
            } catch (e) {
                console.warn(`Failed to generate seeds for ${poolDef.name}`, e);
                return { seeds: [], tokens: 0 };
            }
        },

        // STEP 3: PERSISTENCE (Writing to DB)
        async persistSeeds(
            worldId: string, 
            poolName: string, 
            seeds: any[], 
            componentId: string | null
        ): Promise<void> {
            const liveWorld = await worldManager.loadWorld(worldId, false);
            if (!liveWorld) throw new Error("World lost during generation");
            
            const currentPoolObj = liveWorld.pools[poolName];
            const discoveredRelations = new Set<string>();

            for (const seed of seeds) {
                // 1. Tags
                if (seed.tags && Array.isArray(seed.tags)) {
                    seed.tags.forEach((t: string) => {
                        if (t.includes('|')) {
                            const [label, desc] = t.split('|');
                            worldManager.ensureTag(liveWorld, label);
                            const id = worldManager.ensureTag(liveWorld, label);
                            if (liveWorld.tags[id]) {
                                liveWorld.tags[id].description = desc;
                            }
                        } else {
                            worldManager.ensureTag(liveWorld, t);
                        }
                    });
                }

                // 2. Relations (Enhanced Detection)
                const relationMap: Record<string, string[]> = {};
                
                let relationsSource = seed.components?.relations || seed.relations;

                if (relationsSource && typeof relationsSource === 'object' && !Array.isArray(relationsSource)) {
                    Object.entries(relationsSource).forEach(([relType, targets]: [string, any]) => {
                        if (Array.isArray(targets)) {
                            const validTargets = targets.filter(t => t && typeof t === 'string');
                            if (validTargets.length > 0) {
                                relationMap[relType] = validTargets;
                                discoveredRelations.add(relType);
                            }
                        }
                    });
                } else if (Array.isArray(relationsSource)) {
                    relationsSource.forEach((r: any) => {
                        if (r.type && r.targetName) {
                            if (!relationMap[r.type]) relationMap[r.type] = [];
                            relationMap[r.type].push(r.targetName);
                            discoveredRelations.add(r.type);
                        }
                    });
                }

                // 3. Components
                const finalComponents: any = {
                    metadata: { 
                        id: crypto.randomUUID(), 
                        created: Date.now(),
                        rarity: 'Common' 
                    },
                    relations: relationMap
                };

                if (currentPoolObj.defaultComponents['rarity']) {
                    finalComponents['rarity'] = { value: 'Common' };
                }

                if (componentId && seed.components && seed.components[componentId]) {
                    finalComponents[componentId] = seed.components[componentId];
                }

                // CLEAN TAGS (Remove description part if present in seed)
                const cleanTags = (seed.tags || []).map((t: string) => t.split('|')[0]);

                await worldManager.saveEntityToPool(worldId, poolName, {
                    id: crypto.randomUUID(),
                    name: seed.name,
                    tags: cleanTags,
                    components: finalComponents
                });
            }

            if (discoveredRelations.size > 0) {
                const existingRels = new Set(currentPoolObj.relationshipTypes || []);
                discoveredRelations.forEach(r => existingRels.add(r));
                currentPoolObj.relationshipTypes = Array.from(existingRels);
            }
            
            if (componentId && currentPoolObj.defaultComponents['description']) {
                delete currentPoolObj.defaultComponents['description'];
            }
            
            await worldManager.saveWorld(liveWorld);
        },

        // --- ORCHESTRATOR ---

        async executeBuild(
            arch: WorldArchitecture, 
            storyText: string, 
            language: string,
            onProgress: (p: BuildProgress) => void,
            complexity: 'Standard' | 'Deep Lore' = 'Standard',
            globalPrefix?: string,
            onTokenUpdate?: (tokens: number) => void,
            toneInstruction?: string
        ): Promise<string> {
            
            let totalTokens = 0;

            onProgress({ stage: 'Initialization', message: `Creating world: ${arch.worldName}...`, progress: 5 });
            const world = await worldManager.createWorld(arch.worldName, arch.genre);
            
            if (arch.description) {
                await worldManager.updateWorldConfig(world.id, arch.worldName, {
                    ...world.config,
                    loreContext: arch.description
                });
            }

            const totalSteps = arch.pools.length;
            let completed = 0;

            for (const pool of arch.pools) {
                const progressBase = 10 + Math.floor((completed / totalSteps) * 80);
                
                onProgress({ 
                    stage: 'Infrastructure', 
                    message: `Architecting schema for: ${pool.name}...`, 
                    progress: progressBase
                });
                
                const infra = await this.buildPoolInfrastructure(world.id, pool, language, globalPrefix, toneInstruction);
                if (infra) {
                    totalTokens += infra.tokens;
                    if (onTokenUpdate) onTokenUpdate(totalTokens);
                }

                const componentId = infra?.componentId || null;
                const componentDef = infra?.componentDef || null;
                const dynamicRels = infra?.relationshipTypes || [];

                onProgress({ 
                    stage: 'Content Generation', 
                    message: `Forging ${complexity} entities for ${pool.name}...`, 
                    progress: progressBase + 5
                });

                const { seeds, tokens } = await this.generatePoolSeeds(
                    pool, 
                    componentId && componentDef ? { id: componentId, def: componentDef } : null,
                    language,
                    storyText,
                    complexity,
                    dynamicRels,
                    globalPrefix,
                    toneInstruction
                );
                totalTokens += tokens;
                if (onTokenUpdate) onTokenUpdate(totalTokens);

                if (seeds.length > 0) {
                    await this.persistSeeds(world.id, pool.name, seeds, componentId);
                }

                completed++;
            }

            onProgress({ stage: 'Complete', message: `World Ready. Total Cost: ${totalTokens} tokens.`, progress: 100 });
            return world.id;
        }
    };
}

// Export type for the builder
export type AIWorldBuilderType = ReturnType<typeof createAIWorldBuilder>;
