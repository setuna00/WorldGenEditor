/**
 * Enhanced AI World Builder Service
 * 
 * Integrates with LLMOrchestrator for robust error handling:
 * - Immediate seed persistence (no data loss on crash)
 * - Throttled build state persistence
 * - Idempotent operations (safe to retry)
 * - Full telemetry tracking
 * 
 * Usage:
 * - For new builds: use executeBuildEnhanced()
 * - For retry after failure: use retryFailedPools()
 */

import { worldManager } from "../contexts/ServiceContext";
import { ComponentDefinition, PoolCategory } from "../types";
import { AIPrompts } from "./aiPrompts";
import { buildSchemaForPool } from "./schemaBuilder";
import { StandardSchema } from "./ai/types";
import { 
    LLMOrchestrator, 
    getOrchestrator, 
    OrchestratorResult,
    CallTelemetry 
} from "./ai/orchestrator";
import { GenerationStage, ProviderModel } from "./ai/fallbackRouter";
import {
    BuildStateManager,
    BuildState,
    PoolBuildState,
    BuildTelemetrySummary,
    ImmediateSeedPersister,
    prepareIdempotentSeeds,
    analyzeBuildForRecoveryAsync,
    loadBuildState,
    getMostRecentIncompleteBuild,
    cleanupBuild
} from "./ai/buildPipeline";

// Import types from original builder
import { 
    WorldArchitecture, 
    BuildProgress, 
    StoryAnalysis 
} from "./aiWorldBuilder";

// ==========================================
// TYPES
// ==========================================

/**
 * Enhanced build options
 */
export interface EnhancedBuildOptions {
    /** World architecture from blueprint phase */
    architecture: WorldArchitecture;
    /** Original story text */
    storyText: string;
    /** Output language */
    language: 'English' | 'Chinese';
    /** Build complexity */
    complexity: 'Standard' | 'Deep Lore';
    /** Global prompt prefix */
    globalPrefix?: string;
    /** Tone instruction */
    toneInstruction?: string;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Provider list override */
    providers?: ProviderModel[];
    /** Build state persistence function */
    onStatePersist?: (state: BuildState) => Promise<void>;
    /** Progress callback */
    onProgress?: (progress: BuildProgress) => void;
    /** Token usage callback */
    onTokenUpdate?: (tokens: number) => void;
    /** Telemetry callback */
    onTelemetry?: (telemetry: CallTelemetry) => void;
}

/**
 * Enhanced build result
 */
export interface EnhancedBuildResult {
    success: boolean;
    worldId?: string;
    buildId: string;
    telemetry: BuildTelemetrySummary;
    failedPools: string[];
    error?: string;
}

// ==========================================
// CONSTANTS & SCHEMAS
// ==========================================

const TYPE_COLORS: Record<string, string> = {
    'World': '#8b5cf6',
    'Character': '#f43f5e',
    'Asset': '#10b981',
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
            description: "List of 3-5 specific relationship verbs" 
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
// ENHANCED AI WORLD BUILDER
// ==========================================

export class EnhancedAIWorldBuilder {
    private orchestrator: LLMOrchestrator;

    constructor(orchestrator?: LLMOrchestrator) {
        this.orchestrator = orchestrator || getOrchestrator();
    }

    /**
     * Execute a full world build with enhanced reliability.
     * 
     * Key features:
     * - Seeds are persisted IMMEDIATELY after generation
     * - Build state is throttle-persisted for crash recovery (to IndexedDB)
     * - All idempotency keys are durably stored in DB
     * - Operations are idempotent (safe to retry after crash)
     * - start/end states are force-flushed
     */
    async executeBuildEnhanced(options: EnhancedBuildOptions): Promise<EnhancedBuildResult> {
        const buildId = `build-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const arch = options.architecture;
        
        // Initialize build state manager with DB persistence
        const poolNames = arch.pools.map(p => p.name);
        const stateManager = BuildStateManager.create({
            buildId,
            worldId: '', // Will be updated after world creation
            poolNames,
            onStatePersist: options.onStatePersist,
            coalesceMs: 500,
            persistToDb: true // Enable DB persistence for crash recovery
        });

        // FORCE FLUSH: Persist starting state immediately (critical for recovery)
        await stateManager.flush();
        console.log(`[EnhancedBuilder] Build ${buildId} started, initial state persisted`);

        let worldId: string | undefined;
        const failedPools: string[] = [];

        try {
            // Check for cancellation
            if (options.signal?.aborted) {
                stateManager.markCancelled();
                await stateManager.flush();
                return {
                    success: false,
                    buildId,
                    telemetry: stateManager.getTelemetrySummary(),
                    failedPools: poolNames,
                    error: 'Build cancelled'
                };
            }

            // === STEP 1: CREATE WORLD ===
            stateManager.updateProgress('Initialization', 5);
            options.onProgress?.({ 
                stage: 'Initialization', 
                message: `Creating world: ${arch.worldName}...`, 
                progress: 5 
            });

            const world = await worldManager.createWorld(
                arch.worldName, 
                arch.genre, 
                options.language
            );
            worldId = world.id;

            // Update world config with description
            if (arch.description) {
                await worldManager.updateWorldConfig(world.id, arch.worldName, {
                    ...world.config,
                    loreContext: arch.description
                });
            }

            // Create seed persister
            const seedPersister = new ImmediateSeedPersister(
                async (poolName, seed) => {
                    await this.persistSingleSeed(worldId!, poolName, seed);
                },
                stateManager
            );

            // === STEP 2: BUILD EACH POOL ===
            const totalSteps = arch.pools.length;
            let completed = 0;

            for (const pool of arch.pools) {
                // Check for cancellation
                if (options.signal?.aborted) {
                    stateManager.markCancelled();
                    break;
                }

                const progressBase = 10 + Math.floor((completed / totalSteps) * 80);

                try {
                    await this.buildPool(
                        worldId,
                        pool,
                        options,
                        stateManager,
                        seedPersister,
                        progressBase
                    );
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    console.error(`[EnhancedBuilder] Pool ${pool.name} failed:`, errorMsg);
                    stateManager.markPoolFailed(pool.name, errorMsg);
                    failedPools.push(pool.name);
                }

                completed++;
            }

            // === STEP 3: FINALIZE ===
            if (options.signal?.aborted) {
                stateManager.markCancelled();
            } else if (failedPools.length === 0) {
                stateManager.markCompleted();
            } else if (failedPools.length < arch.pools.length) {
                // Partial success
                stateManager.updateProgress(
                    'Partial Complete',
                    100
                );
            } else {
                stateManager.markFailed('All pools failed');
            }

            // FORCE FLUSH: Persist final state immediately (critical for recovery)
            await stateManager.flush();
            console.log(`[EnhancedBuilder] Build ${buildId} finalized, state persisted`);

            const telemetry = stateManager.getTelemetrySummary();
            options.onProgress?.({ 
                stage: 'Complete', 
                message: `World Ready. ${telemetry.seedsPersisted} seeds, ${telemetry.totalTokens} tokens.`, 
                progress: 100 
            });

            // Clean up completed build data after successful completion
            if (failedPools.length === 0) {
                // Keep build state for a while for debugging, but clean up seed keys
                // Actual cleanup can be done later via cleanupBuild()
                console.log(`[EnhancedBuilder] Build ${buildId} completed successfully`);
            }

            return {
                success: failedPools.length === 0,
                worldId,
                buildId,
                telemetry,
                failedPools,
                error: failedPools.length > 0 ? `${failedPools.length} pools failed` : undefined
            };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            stateManager.markFailed(errorMsg);
            
            // FORCE FLUSH: Persist error state immediately
            await stateManager.flush();
            console.error(`[EnhancedBuilder] Build ${buildId} failed:`, errorMsg);

            return {
                success: false,
                worldId,
                buildId,
                telemetry: stateManager.getTelemetrySummary(),
                failedPools: poolNames,
                error: errorMsg
            };
        }
    }

    /**
     * Retry failed pools from a previous build.
     * Skips already-completed pools and already-persisted seeds.
     * Loads persisted seed keys from DB for true idempotency.
     */
    async retryFailedPools(
        worldId: string,
        previousState: BuildState,
        options: Omit<EnhancedBuildOptions, 'architecture'> & {
            pools: Array<{ name: string; type: "World" | "Character" | "Asset"; description: string }>;
        }
    ): Promise<EnhancedBuildResult> {
        // Analyze with full DB lookup for persisted seeds
        const recovery = await analyzeBuildForRecoveryAsync(previousState);
        
        console.log(`[EnhancedBuilder] Retrying build ${previousState.buildId}`);
        console.log(`[EnhancedBuilder] Completed pools: ${recovery.completedPools.join(', ') || 'none'}`);
        console.log(`[EnhancedBuilder] Incomplete pools: ${recovery.incompletePools.join(', ') || 'none'}`);
        
        // Log persisted seed counts for debugging
        for (const [pool, count] of Object.entries(recovery.persistedSeedCounts)) {
            if (count > 0) {
                console.log(`[EnhancedBuilder] Pool ${pool}: ${count} seeds already persisted`);
            }
        }
        
        // Filter to only incomplete pools
        const poolsToRetry = options.pools.filter(
            p => recovery.incompletePools.includes(p.name)
        );

        if (poolsToRetry.length === 0) {
            console.log(`[EnhancedBuilder] No pools need retry, build already complete`);
            return {
                success: true,
                worldId,
                buildId: previousState.buildId,
                telemetry: {
                    buildId: previousState.buildId,
                    worldId,
                    durationMs: 0,
                    totalTokens: previousState.totalTokens,
                    poolsCompleted: recovery.completedPools.length,
                    poolsFailed: 0,
                    seedsGenerated: 0,
                    seedsPersisted: 0,
                    retriesTotal: 0,
                    fallbacksUsed: 0
                },
                failedPools: []
            };
        }

        // RESTORE state manager from previous state, loading persisted seed keys from DB
        const stateManager = await BuildStateManager.restore(previousState, {
            onStatePersist: options.onStatePersist,
            coalesceMs: 500,
            persistToDb: true
        });

        // FORCE FLUSH: Mark retry start
        stateManager.updateProgress('Retrying', 10);
        await stateManager.flush();

        // Create seed persister (will skip already-persisted seeds via stateManager)
        const seedPersister = new ImmediateSeedPersister(
            async (poolName, seed) => {
                await this.persistSingleSeed(worldId, poolName, seed);
            },
            stateManager
        );

        const failedPools: string[] = [];

        for (const pool of poolsToRetry) {
            if (options.signal?.aborted) break;

            const poolState = previousState.pools[pool.name];
            
            try {
                // Skip infrastructure if already done
                const skipInfra = poolState?.infrastructurePersisted === true;
                if (skipInfra) {
                    console.log(`[EnhancedBuilder] Skipping infrastructure for ${pool.name} (already persisted)`);
                    stateManager.markInfrastructurePersisted(
                        pool.name, 
                        poolState.componentId
                    );
                }

                await this.buildPool(
                    worldId,
                    pool,
                    { ...options, architecture: { worldName: '', genre: '', description: '', pools: poolsToRetry } },
                    stateManager,
                    seedPersister,
                    50, // Arbitrary progress base for retry
                    skipInfra,
                    poolState?.componentId
                );
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`[EnhancedBuilder] Pool ${pool.name} retry failed:`, errorMsg);
                stateManager.markPoolFailed(pool.name, errorMsg);
                failedPools.push(pool.name);
            }
        }

        // FORCE FLUSH: Persist final retry state
        if (failedPools.length === 0) {
            stateManager.markCompleted();
        }
        await stateManager.flush();
        console.log(`[EnhancedBuilder] Retry completed, ${failedPools.length} pools still failed`);

        return {
            success: failedPools.length === 0,
            worldId,
            buildId: previousState.buildId,
            telemetry: stateManager.getTelemetrySummary(),
            failedPools
        };
    }

    /**
     * Check if there's an incomplete build that can be resumed.
     * Returns the build state if found.
     */
    async getIncompleteBuild(): Promise<BuildState | null> {
        return getMostRecentIncompleteBuild();
    }

    /**
     * Load a specific build state by ID
     */
    async loadBuildState(buildId: string): Promise<BuildState | null> {
        return loadBuildState(buildId);
    }

    /**
     * Clean up a completed build's persisted data (seed keys, etc.)
     */
    async cleanupBuildData(buildId: string): Promise<void> {
        await cleanupBuild(buildId);
        console.log(`[EnhancedBuilder] Cleaned up build data for ${buildId}`);
    }

    // ==========================================
    // PRIVATE: POOL BUILDING
    // ==========================================

    private async buildPool(
        worldId: string,
        poolDef: { name: string; type: "World" | "Character" | "Asset"; description: string },
        options: EnhancedBuildOptions,
        stateManager: BuildStateManager,
        seedPersister: ImmediateSeedPersister,
        progressBase: number,
        skipInfrastructure: boolean = false,
        existingComponentId?: string
    ): Promise<void> {
        let componentId = existingComponentId;
        let componentDef: ComponentDefinition | null = null;
        let relationshipTypes: string[] = [];

        // === INFRASTRUCTURE ===
        if (!skipInfrastructure) {
            stateManager.updatePoolStatus(poolDef.name, { status: 'infrastructure' });
            options.onProgress?.({ 
                stage: 'Infrastructure', 
                message: `Architecting schema for: ${poolDef.name}...`, 
                progress: progressBase 
            });

            // Create pool in DB
            const themeColor = TYPE_COLORS[poolDef.type] || '#64748b';
            await worldManager.createPool(
                worldId, 
                poolDef.name, 
                poolDef.type, 
                poolDef.description, 
                themeColor
            );

            // Generate component schema via orchestrator
            const infraResult = await this.generateInfrastructure(
                poolDef,
                options
            );

            if (infraResult.success && infraResult.data) {
                const compDef = infraResult.data;
                componentId = compDef.id.toLowerCase().replace(/\s+/g, '_');
                
                const finalDef: ComponentDefinition = {
                    ...compDef,
                    id: componentId,
                    category: poolDef.name
                };

                // Persist component definition
                await worldManager.registerComponentDefinition(worldId, finalDef, poolDef.name);

                // Persist relationship types
                if (compDef.suggestedRelationshipVerbs?.length > 0) {
                    const liveWorld = await worldManager.loadWorld(worldId, true);
                    if (liveWorld?.pools[poolDef.name]) {
                        liveWorld.pools[poolDef.name].relationshipTypes = compDef.suggestedRelationshipVerbs;
                        await worldManager.saveWorld(liveWorld);
                    }
                    relationshipTypes = compDef.suggestedRelationshipVerbs;
                }

                componentDef = finalDef;
                stateManager.markInfrastructurePersisted(poolDef.name, componentId);
                stateManager.addTokens(poolDef.name, infraResult.telemetry.totalAttempts * 100); // Estimate
            } else {
                throw new Error(infraResult.error?.message || 'Infrastructure generation failed');
            }
        } else {
            // Load existing component
            const liveWorld = await worldManager.loadWorld(worldId, true);
            if (componentId && liveWorld?.componentRegistry[componentId]) {
                componentDef = liveWorld.componentRegistry[componentId];
            }
            if (liveWorld?.pools[poolDef.name]?.relationshipTypes) {
                relationshipTypes = liveWorld.pools[poolDef.name].relationshipTypes;
            }
        }

        // === SEED GENERATION ===
        stateManager.updatePoolStatus(poolDef.name, { status: 'generating' });
        options.onProgress?.({ 
            stage: 'Content Generation', 
            message: `Forging ${options.complexity} entities for ${poolDef.name}...`, 
            progress: progressBase + 5 
        });

        const seedResult = await this.generateSeeds(
            poolDef,
            componentId && componentDef ? { id: componentId, def: componentDef } : null,
            relationshipTypes,
            options
        );

        if (!seedResult.success || !seedResult.data) {
            throw new Error(seedResult.error?.message || 'Seed generation failed');
        }

        const seeds = seedResult.data;
        stateManager.updatePoolStatus(poolDef.name, { 
            seedsTotalCount: seeds.length 
        });

        // === IMMEDIATE SEED PERSISTENCE ===
        stateManager.updatePoolStatus(poolDef.name, { status: 'persisting' });
        
        const buildId = stateManager.getState().buildId;
        const idempotentSeeds = prepareIdempotentSeeds(buildId, poolDef.name, seeds);

        await seedPersister.persistSeeds(
            poolDef.name,
            idempotentSeeds,
            (persisted, total) => {
                options.onProgress?.({
                    stage: 'Persisting',
                    message: `Saving ${poolDef.name}: ${persisted}/${total}`,
                    progress: progressBase + 10 + Math.floor((persisted / total) * 10)
                });
            }
        );

        // Mark pool completed
        stateManager.markSeedsPersisted(poolDef.name);
        stateManager.addTokens(poolDef.name, seedResult.telemetry.totalAttempts * 200); // Estimate
    }

    // ==========================================
    // PRIVATE: ORCHESTRATED GENERATION
    // ==========================================

    private async generateInfrastructure(
        poolDef: { name: string; type: string },
        options: EnhancedBuildOptions
    ): Promise<OrchestratorResult<any>> {
        const { system, user } = AIPrompts.componentDesign(
            poolDef.name, 
            options.language, 
            options.toneInstruction
        );

        const finalSystem = options.globalPrefix 
            ? `[GLOBAL PRE-INSTRUCTION]: ${options.globalPrefix}\n\n${system}`
            : system;

        return this.orchestrator.generateStructuredData(
            finalSystem,
            user,
            COMPONENT_DESIGN_SCHEMA,
            {
                stage: 'component_design',
                signal: options.signal,
                providers: options.providers,
                onTelemetry: options.onTelemetry
            }
        );
    }

    private async generateSeeds(
        poolDef: { name: string; type: "World" | "Character" | "Asset" },
        componentData: { id: string; def: ComponentDefinition } | null,
        relationshipTypes: string[],
        options: EnhancedBuildOptions
    ): Promise<OrchestratorResult<any[]>> {
        let fieldSummary = "";
        if (componentData?.def) {
            fieldSummary = componentData.def.fields.map(f => {
                const fieldOptions = f.options ? `[Options: ${f.options.join(', ')}]` : '';
                return `${f.key} (${f.type}): ${fieldOptions}`;
            }).join('\n');
        }

        const { system, user } = AIPrompts.seedContent(
            poolDef.name,
            poolDef.type,
            options.language,
            options.storyText,
            options.complexity,
            fieldSummary,
            relationshipTypes,
            options.toneInstruction
        );

        const finalSystem = options.globalPrefix
            ? `[GLOBAL PRE-INSTRUCTION]: ${options.globalPrefix}\n\n${system}`
            : system;

        // Build schema
        const poolStub = {
            name: poolDef.name,
            type: poolDef.type as PoolCategory,
            defaultComponents: componentData ? { [componentData.id]: {} } : {},
            entities: [],
            relationshipTypes
        };
        const registryStub = componentData ? { [componentData.id]: componentData.def } : {};
        const seedSchema = buildSchemaForPool(poolStub, registryStub);

        return this.orchestrator.generateStructuredData(
            finalSystem,
            user,
            seedSchema,
            {
                stage: 'seed_content',
                signal: options.signal,
                providers: options.providers,
                onTelemetry: options.onTelemetry
            }
        );
    }

    // ==========================================
    // PRIVATE: SEED PERSISTENCE
    // ==========================================

    private async persistSingleSeed(
        worldId: string,
        poolName: string,
        seed: any
    ): Promise<void> {
        const liveWorld = await worldManager.loadWorld(worldId, false);
        if (!liveWorld) throw new Error("World lost during persistence");

        const currentPool = liveWorld.pools[poolName];
        if (!currentPool) throw new Error(`Pool ${poolName} not found`);

        // Process tags
        if (seed.tags && Array.isArray(seed.tags)) {
            for (const t of seed.tags) {
                if (t.includes('|')) {
                    const [label, desc] = t.split('|');
                    const id = worldManager.ensureTag(liveWorld, label);
                    if (liveWorld.tags[id]) {
                        liveWorld.tags[id].description = desc;
                    }
                } else {
                    worldManager.ensureTag(liveWorld, t);
                }
            }
        }

        // Process relations
        const relationMap: Record<string, string[]> = {};
        const relationsSource = seed.components?.relations || seed.relations;

        if (relationsSource && typeof relationsSource === 'object' && !Array.isArray(relationsSource)) {
            for (const [relType, targets] of Object.entries(relationsSource)) {
                if (Array.isArray(targets)) {
                    const validTargets = (targets as any[]).filter(t => t && typeof t === 'string');
                    if (validTargets.length > 0) {
                        relationMap[relType] = validTargets;
                    }
                }
            }
        } else if (Array.isArray(relationsSource)) {
            for (const r of relationsSource as any[]) {
                if (r.type && r.targetName) {
                    if (!relationMap[r.type]) relationMap[r.type] = [];
                    relationMap[r.type].push(r.targetName);
                }
            }
        }

        // Build final entity
        const finalComponents: any = {
            metadata: {
                id: crypto.randomUUID(),
                created: Date.now(),
                rarity: 'Common'
            },
            relations: relationMap
        };

        // Copy component data
        for (const compId of Object.keys(currentPool.defaultComponents)) {
            if (seed.components?.[compId]) {
                finalComponents[compId] = seed.components[compId];
            }
        }

        // Clean tags
        const cleanTags = (seed.tags || []).map((t: string) => t.split('|')[0]);

        // Save entity
        await worldManager.saveEntityToPool(worldId, poolName, {
            id: crypto.randomUUID(),
            name: seed.name,
            tags: cleanTags,
            components: finalComponents
        });

        // Save world (for tags)
        await worldManager.saveWorld(liveWorld);
    }
}

// ==========================================
// FACTORY
// ==========================================

let enhancedBuilderInstance: EnhancedAIWorldBuilder | null = null;

/**
 * Get the global EnhancedAIWorldBuilder instance
 */
export function getEnhancedWorldBuilder(
    orchestrator?: LLMOrchestrator
): EnhancedAIWorldBuilder {
    if (!enhancedBuilderInstance) {
        enhancedBuilderInstance = new EnhancedAIWorldBuilder(orchestrator);
    }
    return enhancedBuilderInstance;
}

/**
 * Create a new EnhancedAIWorldBuilder instance
 */
export function createEnhancedWorldBuilder(
    orchestrator?: LLMOrchestrator
): EnhancedAIWorldBuilder {
    return new EnhancedAIWorldBuilder(orchestrator);
}
