/**
 * Build Pipeline Utilities
 * 
 * Provides:
 * - ThrottledPersister: Coalesced state persistence with force flush
 * - BuildState: Immutable build state tracking with idempotency
 * - SeedPersister: Idempotent seed persistence with DB backing
 * 
 * Key design principles:
 * - Seeds are persisted IMMEDIATELY (no coalescing)
 * - Build state uses throttled persistence (coalesced)
 * - Idempotency via buildId + poolName + seedIndex or content hash
 * - Crash recovery by loading already-persisted items from DB
 * - All idempotency keys are persisted to IndexedDB for durability
 */

import { db, PersistedBuildState } from '../db';

// ==========================================
// TYPES
// ==========================================

/**
 * Pool build status
 */
export type PoolBuildStatus = 'pending' | 'infrastructure' | 'generating' | 'persisting' | 'completed' | 'failed';

/**
 * Per-pool build state
 */
export interface PoolBuildState {
    poolName: string;
    status: PoolBuildStatus;
    /** Whether infrastructure (schema, pool) has been persisted */
    infrastructurePersisted: boolean;
    /** Whether seeds have been persisted */
    seedsPersisted: boolean;
    /** Number of seeds successfully persisted */
    seedsPersistedCount: number;
    /** Total seeds expected */
    seedsTotalCount: number;
    /** Error message if failed */
    error?: string;
    /** Last update timestamp */
    lastUpdatedAt: number;
    /** Component ID created */
    componentId?: string;
    /** Tokens used for this pool */
    tokensUsed: number;
}

/**
 * Overall build state
 */
export interface BuildState {
    /** Unique build ID for idempotency */
    buildId: string;
    /** World ID being built */
    worldId: string;
    /** Build start time */
    startedAt: number;
    /** Build end time (if completed) */
    completedAt?: number;
    /** Overall status */
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    /** Per-pool states */
    pools: Record<string, PoolBuildState>;
    /** Total tokens used */
    totalTokens: number;
    /** Current stage description */
    currentStage: string;
    /** Progress percentage (0-100) */
    progress: number;
}

/**
 * Seed with idempotency key
 */
export interface IdempotentSeed {
    /** Hash or composite key for idempotency */
    idempotencyKey: string;
    /** The actual seed data */
    data: any;
    /** Index in the batch */
    index: number;
}

/**
 * Telemetry summary for build
 */
export interface BuildTelemetrySummary {
    buildId: string;
    worldId: string;
    durationMs: number;
    totalTokens: number;
    poolsCompleted: number;
    poolsFailed: number;
    seedsGenerated: number;
    seedsPersisted: number;
    retriesTotal: number;
    fallbacksUsed: number;
}

// ==========================================
// THROTTLED PERSISTER
// ==========================================

/**
 * Throttled persister that coalesces frequent writes.
 * Uses a timer to batch writes within a window.
 */
export class ThrottledPersister<T> {
    private pendingData: T | null = null;
    private timerId: NodeJS.Timeout | null = null;
    private readonly coalesceMs: number;
    private readonly persistFn: (data: T) => Promise<void>;
    private isPersisting = false;
    private pendingFlush: Promise<void> | null = null;

    constructor(
        persistFn: (data: T) => Promise<void>,
        coalesceMs: number = 500
    ) {
        this.persistFn = persistFn;
        this.coalesceMs = coalesceMs;
    }

    /**
     * Schedule data for persistence.
     * Will be coalesced with other writes within the window.
     */
    schedule(data: T): void {
        this.pendingData = data;
        
        if (!this.timerId && !this.isPersisting) {
            this.timerId = setTimeout(() => this.executePersist(), this.coalesceMs);
        }
    }

    /**
     * Force immediate flush of pending data.
     * Returns a promise that resolves when persist completes.
     */
    async flush(): Promise<void> {
        // Clear any pending timer
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }

        // Wait for any in-flight persist
        if (this.pendingFlush) {
            await this.pendingFlush;
        }

        // Persist if we have pending data
        if (this.pendingData !== null) {
            await this.executePersist();
        }
    }

    /**
     * Execute the actual persist operation
     */
    private async executePersist(): Promise<void> {
        if (this.pendingData === null) return;

        this.isPersisting = true;
        this.timerId = null;
        
        const dataToSave = this.pendingData;
        this.pendingData = null;

        this.pendingFlush = (async () => {
            try {
                await this.persistFn(dataToSave);
            } catch (error) {
                console.error('[ThrottledPersister] Persist failed:', error);
                // Re-queue the data for retry
                if (this.pendingData === null) {
                    this.pendingData = dataToSave;
                }
            } finally {
                this.isPersisting = false;
                this.pendingFlush = null;
                
                // If new data arrived while persisting, schedule another write
                if (this.pendingData !== null && !this.timerId) {
                    this.timerId = setTimeout(() => this.executePersist(), this.coalesceMs);
                }
            }
        })();

        await this.pendingFlush;
    }

    /**
     * Check if there's pending data
     */
    hasPending(): boolean {
        return this.pendingData !== null || this.isPersisting;
    }
}

// ==========================================
// BUILD STATE MANAGER
// ==========================================

/**
 * Options for creating a BuildStateManager
 */
export interface BuildStateManagerOptions {
    buildId: string;
    worldId: string;
    poolNames: string[];
    /** Custom state persist function (in addition to DB) */
    onStatePersist?: (state: BuildState) => Promise<void>;
    /** Coalesce interval in ms */
    coalesceMs?: number;
    /** Whether to persist to DB (default: true) */
    persistToDb?: boolean;
}

/**
 * Manages build state with throttled persistence and DB backing
 */
export class BuildStateManager {
    private state: BuildState;
    private persister: ThrottledPersister<BuildState>;
    private persistedSeedKeys: Set<string> = new Set();
    private persistToDb: boolean;
    private customPersistFn?: (state: BuildState) => Promise<void>;

    constructor(
        buildId: string,
        worldId: string,
        poolNames: string[],
        persistFn: (state: BuildState) => Promise<void>,
        coalesceMs: number = 500
    ) {
        this.persistToDb = true;
        this.customPersistFn = persistFn;

        // Initialize state
        this.state = {
            buildId,
            worldId,
            startedAt: Date.now(),
            status: 'running',
            pools: {},
            totalTokens: 0,
            currentStage: 'Initializing',
            progress: 0
        };

        // Initialize pool states
        for (const poolName of poolNames) {
            this.state.pools[poolName] = {
                poolName,
                status: 'pending',
                infrastructurePersisted: false,
                seedsPersisted: false,
                seedsPersistedCount: 0,
                seedsTotalCount: 0,
                lastUpdatedAt: Date.now(),
                tokensUsed: 0
            };
        }

        // Create combined persist function
        const combinedPersist = async (data: BuildState) => {
            const promises: Promise<void>[] = [];
            
            // Always persist to DB if enabled
            if (this.persistToDb) {
                promises.push(db.saveBuildState(data as PersistedBuildState));
            }
            
            // Also call custom persist function if provided
            if (this.customPersistFn) {
                promises.push(this.customPersistFn(data));
            }
            
            await Promise.all(promises);
        };

        this.persister = new ThrottledPersister(combinedPersist, coalesceMs);
    }

    /**
     * Create a BuildStateManager from options
     */
    static create(options: BuildStateManagerOptions): BuildStateManager {
        const manager = new BuildStateManager(
            options.buildId,
            options.worldId,
            options.poolNames,
            options.onStatePersist || (async () => {}),
            options.coalesceMs || 500
        );
        manager.persistToDb = options.persistToDb !== false;
        return manager;
    }

    /**
     * Restore a BuildStateManager from a previous build state.
     * Loads already-persisted seed keys from DB.
     */
    static async restore(
        previousState: BuildState,
        options: Omit<BuildStateManagerOptions, 'buildId' | 'worldId' | 'poolNames'>
    ): Promise<BuildStateManager> {
        const poolNames = Object.keys(previousState.pools);
        
        const manager = new BuildStateManager(
            previousState.buildId,
            previousState.worldId,
            poolNames,
            options.onStatePersist || (async () => {}),
            options.coalesceMs || 500
        );
        manager.persistToDb = options.persistToDb !== false;

        // Restore state from previous
        manager.state = { ...previousState };

        // Load persisted seed keys from DB
        const seedKeysMap = await db.getAllPersistedSeedKeysForBuild(previousState.buildId);
        for (const [poolName, keys] of seedKeysMap) {
            for (const key of keys) {
                manager.persistedSeedKeys.add(`${poolName}:${key}`);
            }
        }

        console.log(
            `[BuildStateManager] Restored build ${previousState.buildId}, ` +
            `loaded ${manager.persistedSeedKeys.size} persisted seed keys`
        );

        return manager;
    }

    /**
     * Load the latest incomplete build for a world from DB
     */
    static async loadIncompleteForWorld(
        worldId: string,
        options: Omit<BuildStateManagerOptions, 'buildId' | 'worldId' | 'poolNames'>
    ): Promise<BuildStateManager | null> {
        const incompleteBuilds = await db.getIncompleteBuildsForWorld(worldId);
        
        if (incompleteBuilds.length === 0) {
            return null;
        }

        // Get most recent
        const mostRecent = incompleteBuilds.sort((a, b) => b.startedAt - a.startedAt)[0];
        return BuildStateManager.restore(mostRecent as BuildState, options);
    }

    /**
     * Get current state (read-only)
     */
    getState(): Readonly<BuildState> {
        return this.state;
    }

    /**
     * Update overall progress
     */
    updateProgress(stage: string, progress: number): void {
        this.state.currentStage = stage;
        this.state.progress = progress;
        this.persister.schedule({ ...this.state });
    }

    /**
     * Update pool status
     */
    updatePoolStatus(
        poolName: string,
        updates: Partial<PoolBuildState>
    ): void {
        if (!this.state.pools[poolName]) {
            console.warn(`[BuildStateManager] Unknown pool: ${poolName}`);
            return;
        }

        Object.assign(this.state.pools[poolName], updates, {
            lastUpdatedAt: Date.now()
        });
        this.persister.schedule({ ...this.state });
    }

    /**
     * Mark infrastructure as persisted for a pool
     */
    markInfrastructurePersisted(poolName: string, componentId?: string): void {
        this.updatePoolStatus(poolName, {
            status: 'infrastructure',
            infrastructurePersisted: true,
            componentId
        });
    }

    /**
     * Record a persisted seed (for idempotency tracking).
     * Persists to both memory and DB for durability.
     */
    async recordPersistedSeed(poolName: string, idempotencyKey: string): Promise<void> {
        // Add to in-memory set
        this.persistedSeedKeys.add(`${poolName}:${idempotencyKey}`);
        
        // Persist to DB for crash recovery
        if (this.persistToDb) {
            await db.recordPersistedSeed(this.state.buildId, poolName, idempotencyKey);
        }
        
        const pool = this.state.pools[poolName];
        if (pool) {
            pool.seedsPersistedCount++;
            pool.lastUpdatedAt = Date.now();
            this.persister.schedule({ ...this.state });
        }
    }

    /**
     * Check if a seed was already persisted (fast in-memory check)
     * For recovery scenarios, ensure restore() was called first to load from DB.
     */
    isSeedPersisted(poolName: string, idempotencyKey: string): boolean {
        return this.persistedSeedKeys.has(`${poolName}:${idempotencyKey}`);
    }

    /**
     * Check if a seed was already persisted (with DB fallback)
     * Use this when uncertain if in-memory state is complete.
     */
    async isSeedPersistedWithDbCheck(poolName: string, idempotencyKey: string): Promise<boolean> {
        // First check in-memory
        if (this.persistedSeedKeys.has(`${poolName}:${idempotencyKey}`)) {
            return true;
        }
        
        // Fallback to DB check
        if (this.persistToDb) {
            const inDb = await db.isSeedPersisted(this.state.buildId, poolName, idempotencyKey);
            if (inDb) {
                // Add to in-memory for future checks
                this.persistedSeedKeys.add(`${poolName}:${idempotencyKey}`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Mark all seeds as persisted for a pool
     */
    markSeedsPersisted(poolName: string): void {
        this.updatePoolStatus(poolName, {
            status: 'completed',
            seedsPersisted: true
        });
    }

    /**
     * Mark pool as failed
     */
    markPoolFailed(poolName: string, error: string): void {
        this.updatePoolStatus(poolName, {
            status: 'failed',
            error
        });
    }

    /**
     * Add tokens to total and pool
     */
    addTokens(poolName: string, tokens: number): void {
        this.state.totalTokens += tokens;
        if (this.state.pools[poolName]) {
            this.state.pools[poolName].tokensUsed += tokens;
        }
        this.persister.schedule({ ...this.state });
    }

    /**
     * Mark build as completed
     */
    markCompleted(): void {
        this.state.status = 'completed';
        this.state.completedAt = Date.now();
        this.state.progress = 100;
    }

    /**
     * Mark build as failed
     */
    markFailed(error: string): void {
        this.state.status = 'failed';
        this.state.completedAt = Date.now();
        this.state.currentStage = `Failed: ${error}`;
    }

    /**
     * Mark build as cancelled
     */
    markCancelled(): void {
        this.state.status = 'cancelled';
        this.state.completedAt = Date.now();
        this.state.currentStage = 'Cancelled';
    }

    /**
     * Force flush state to persistence
     */
    async flush(): Promise<void> {
        await this.persister.flush();
    }

    /**
     * Get pools that need retry (failed or incomplete)
     */
    getPoolsNeedingRetry(): string[] {
        return Object.entries(this.state.pools)
            .filter(([_, pool]) => 
                pool.status === 'failed' || 
                (pool.status !== 'completed' && !pool.seedsPersisted)
            )
            .map(([name]) => name);
    }

    /**
     * Generate telemetry summary
     */
    getTelemetrySummary(): BuildTelemetrySummary {
        const pools = Object.values(this.state.pools);
        
        return {
            buildId: this.state.buildId,
            worldId: this.state.worldId,
            durationMs: (this.state.completedAt || Date.now()) - this.state.startedAt,
            totalTokens: this.state.totalTokens,
            poolsCompleted: pools.filter(p => p.status === 'completed').length,
            poolsFailed: pools.filter(p => p.status === 'failed').length,
            seedsGenerated: pools.reduce((sum, p) => sum + p.seedsTotalCount, 0),
            seedsPersisted: pools.reduce((sum, p) => sum + p.seedsPersistedCount, 0),
            retriesTotal: 0,  // Would need to track from orchestrator
            fallbacksUsed: 0  // Would need to track from orchestrator
        };
    }
}

// ==========================================
// IDEMPOTENCY HELPERS
// ==========================================

/**
 * Generate an idempotency key for a seed.
 * Uses buildId + poolName + index, or content hash if available.
 */
export function generateSeedIdempotencyKey(
    buildId: string,
    poolName: string,
    seedIndex: number,
    seedData?: any
): string {
    // Primary: composite key from build context
    const compositeKey = `${buildId}:${poolName}:${seedIndex}`;
    
    // If we have seed data, we could also use a content hash
    // This provides stronger idempotency but is more expensive
    if (seedData && seedData.name) {
        // Use name as additional discriminator
        return `${compositeKey}:${hashString(seedData.name)}`;
    }
    
    return compositeKey;
}

/**
 * Simple string hash function (djb2)
 */
function hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Prepare seeds with idempotency keys
 */
export function prepareIdempotentSeeds(
    buildId: string,
    poolName: string,
    seeds: any[]
): IdempotentSeed[] {
    return seeds.map((seed, index) => ({
        idempotencyKey: generateSeedIdempotencyKey(buildId, poolName, index, seed),
        data: seed,
        index
    }));
}

// ==========================================
// IMMEDIATE SEED PERSISTER
// ==========================================

/**
 * Persists seeds immediately with idempotency checks.
 * Does NOT use throttling - seeds are critical data.
 * Each seed's idempotency key is persisted to DB for crash recovery.
 */
export class ImmediateSeedPersister {
    private persistFn: (poolName: string, seed: any) => Promise<void>;
    private stateManager: BuildStateManager;

    constructor(
        persistFn: (poolName: string, seed: any) => Promise<void>,
        stateManager: BuildStateManager
    ) {
        this.persistFn = persistFn;
        this.stateManager = stateManager;
    }

    /**
     * Persist seeds with idempotency.
     * Already-persisted seeds are skipped (checked in-memory first, then DB if needed).
     * Each seed is persisted immediately (no batching).
     * Idempotency keys are durably stored in DB.
     */
    async persistSeeds(
        poolName: string,
        seeds: IdempotentSeed[],
        onProgress?: (persisted: number, total: number) => void
    ): Promise<{ persisted: number; skipped: number }> {
        let persisted = 0;
        let skipped = 0;

        for (const seed of seeds) {
            // Check idempotency (in-memory first, should be fast)
            if (this.stateManager.isSeedPersisted(poolName, seed.idempotencyKey)) {
                skipped++;
                if (onProgress) {
                    onProgress(persisted + skipped, seeds.length);
                }
                continue;
            }

            try {
                // Persist the seed data immediately
                await this.persistFn(poolName, seed.data);
                
                // Record for idempotency (persists to DB for durability)
                await this.stateManager.recordPersistedSeed(poolName, seed.idempotencyKey);
                persisted++;

                if (onProgress) {
                    onProgress(persisted + skipped, seeds.length);
                }
            } catch (error) {
                console.error(
                    `[ImmediateSeedPersister] Failed to persist seed ${seed.idempotencyKey}:`,
                    error
                );
                throw error;  // Propagate - caller decides retry strategy
            }
        }

        return { persisted, skipped };
    }
}

// ==========================================
// BUILD RECOVERY
// ==========================================

/**
 * Load existing build state for recovery
 */
export interface BuildRecoveryInfo {
    /** Whether a previous build exists */
    exists: boolean;
    /** Previous build state if exists */
    state?: BuildState;
    /** Pools that were completed */
    completedPools: string[];
    /** Pools that need retry */
    incompletePools: string[];
    /** Seeds that were already persisted (pool -> set of keys) */
    persistedSeeds: Record<string, Set<string>>;
    /** Count of persisted seeds per pool */
    persistedSeedCounts: Record<string, number>;
}

/**
 * Analyze a previous build state for recovery (sync version, without DB lookup)
 * Use analyzeBuildForRecoveryAsync for full recovery info including persisted seeds.
 */
export function analyzeBuildForRecovery(
    previousState: BuildState | null
): Omit<BuildRecoveryInfo, 'persistedSeeds' | 'persistedSeedCounts'> & { 
    persistedSeeds: Record<string, Set<string>>; 
    incompleteools: string[];  // Keep for backwards compat
} {
    if (!previousState) {
        return {
            exists: false,
            completedPools: [],
            incompletePools: [],
            incompleteools: [],  // backwards compat
            persistedSeeds: {}
        };
    }

    const completedPools: string[] = [];
    const incompletePools: string[] = [];
    const persistedSeeds: Record<string, Set<string>> = {};

    for (const [poolName, poolState] of Object.entries(previousState.pools)) {
        if (poolState.status === 'completed' && poolState.seedsPersisted) {
            completedPools.push(poolName);
        } else {
            incompletePools.push(poolName);
        }
        
        // Empty sets - use async version for actual DB lookup
        persistedSeeds[poolName] = new Set();
    }

    return {
        exists: true,
        state: previousState,
        completedPools,
        incompletePools,
        incompleteools: incompletePools,  // backwards compat
        persistedSeeds
    };
}

/**
 * Analyze a previous build state for recovery with full DB lookup.
 * Loads all persisted seed keys from DB.
 */
export async function analyzeBuildForRecoveryAsync(
    previousState: BuildState | null
): Promise<BuildRecoveryInfo> {
    if (!previousState) {
        return {
            exists: false,
            completedPools: [],
            incompletePools: [],
            persistedSeeds: {},
            persistedSeedCounts: {}
        };
    }

    const completedPools: string[] = [];
    const incompletePools: string[] = [];

    for (const [poolName, poolState] of Object.entries(previousState.pools)) {
        if (poolState.status === 'completed' && poolState.seedsPersisted) {
            completedPools.push(poolName);
        } else {
            incompletePools.push(poolName);
        }
    }

    // Load persisted seed keys from DB
    const seedKeysMap = await db.getAllPersistedSeedKeysForBuild(previousState.buildId);
    
    const persistedSeeds: Record<string, Set<string>> = {};
    const persistedSeedCounts: Record<string, number> = {};
    
    for (const poolName of Object.keys(previousState.pools)) {
        persistedSeeds[poolName] = seedKeysMap.get(poolName) || new Set();
        persistedSeedCounts[poolName] = persistedSeeds[poolName].size;
    }

    return {
        exists: true,
        state: previousState,
        completedPools,
        incompletePools,
        persistedSeeds,
        persistedSeedCounts
    };
}

/**
 * Load a build state from DB by ID
 */
export async function loadBuildState(buildId: string): Promise<BuildState | null> {
    const state = await db.loadBuildState(buildId);
    return state as BuildState | null;
}

/**
 * Get the most recent incomplete build from DB
 */
export async function getMostRecentIncompleteBuild(): Promise<BuildState | null> {
    const state = await db.getMostRecentIncompleteBuild();
    return state as BuildState | null;
}

/**
 * Clean up a completed build's persisted data
 */
export async function cleanupBuild(buildId: string): Promise<void> {
    await db.deleteBuildState(buildId);
}
