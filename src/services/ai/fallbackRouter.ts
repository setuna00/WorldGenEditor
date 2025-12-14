/**
 * FallbackRouter - Per-stage Provider/Model Fallback with Degradation
 * 
 * Manages fallback logic for different generation stages:
 * - Per-stage provider/model priority lists
 * - Respects circuit breaker state
 * - QUOTA fallback only to providers without quota issues
 * - Degradation parameters on fallback (lower temperature, shorter output)
 * 
 * Key concepts:
 * - ProviderKey: "provider:model" (e.g., "openai:gpt-4o-mini")
 * - Stage: Type of generation (structured, batch, ideation, etc.)
 * - maxDistinctProviderModels: Max different provider:model combos to try
 */

import { AIProviderType } from './types';
import { LLMError, isFallbackAllowed, ErrorCategory, makeProviderKey } from './errors';
import { CircuitBreaker, getCircuitBreaker, makeCircuitKey } from './circuitBreaker';

// ==========================================
// TYPES
// ==========================================

/**
 * Generation stage types
 */
export type GenerationStage = 
    | 'structured'       // Schema-constrained generation
    | 'batch'           // Batch entity generation
    | 'ideation'        // Title/genre ideation
    | 'analysis'        // Story analysis
    | 'blueprint'       // World blueprint
    | 'component_design' // Component schema design
    | 'seed_content';   // Seed content generation

/**
 * Provider and model combination
 */
export interface ProviderModel {
    provider: AIProviderType;
    model: string;
}

/**
 * Generation parameters that can be degraded on fallback
 */
export interface GenerationParams {
    temperature: number;
    maxTokens?: number;
}

/**
 * Stage-specific configuration
 */
export interface StageConfig {
    /** Ordered list of provider:model to try */
    providers: ProviderModel[];
    /** Whether fallback is allowed for this stage */
    allowFallback: boolean;
    /** Whether to degrade params on fallback */
    degradeOnFallback: boolean;
    /** Base generation parameters */
    baseParams: GenerationParams;
    /** Degraded parameters (used on fallback) */
    degradedParams: GenerationParams;
    /** Max distinct provider:model combos to try */
    maxDistinctProviderModels: number;
}

/**
 * Result of fallback selection
 */
export interface FallbackResult {
    /** Selected provider:model */
    providerModel: ProviderModel;
    /** Generation parameters to use */
    params: GenerationParams;
    /** Whether this is a fallback (not primary) */
    isFallback: boolean;
    /** Reason for selection */
    reason: string;
    /** Number of skipped options */
    skippedCount: number;
}

/**
 * State tracking for a fallback session
 */
export interface FallbackSession {
    stage: GenerationStage;
    /** Provider:models that have been tried */
    triedProviderModels: Set<string>;
    /** Provider:models with quota issues */
    quotaExhausted: Set<string>;
    /** Current index in the provider list */
    currentIndex: number;
    /** Number of distinct provider:models tried */
    distinctCount: number;
}

/**
 * Router configuration
 */
export interface FallbackRouterConfig {
    /** Stage-specific configurations */
    stages: Partial<Record<GenerationStage, Partial<StageConfig>>>;
    /** Default provider list if stage not configured */
    defaultProviders: ProviderModel[];
    /** Global max distinct provider:models */
    globalMaxDistinct: number;
}

// ==========================================
// DEFAULT CONFIGURATION
// ==========================================

const DEFAULT_PROVIDERS: ProviderModel[] = [
    { provider: 'gemini', model: 'gemini-2.5-flash' },
    { provider: 'openai', model: 'gpt-4o-mini' },
    { provider: 'deepseek', model: 'deepseek-chat' }
];

const DEFAULT_STAGE_CONFIG: StageConfig = {
    providers: DEFAULT_PROVIDERS,
    allowFallback: true,
    degradeOnFallback: true,
    baseParams: { temperature: 0.7 },
    degradedParams: { temperature: 0.3, maxTokens: 4096 },
    maxDistinctProviderModels: 3
};

/**
 * Stage-specific defaults (merged with DEFAULT_STAGE_CONFIG)
 */
const STAGE_DEFAULTS: Partial<Record<GenerationStage, Partial<StageConfig>>> = {
    structured: {
        baseParams: { temperature: 0.3 },
        degradedParams: { temperature: 0.1, maxTokens: 2048 },
        degradeOnFallback: true
    },
    batch: {
        baseParams: { temperature: 0.9 },
        degradedParams: { temperature: 0.5, maxTokens: 8192 },
        degradeOnFallback: true
    },
    ideation: {
        baseParams: { temperature: 0.7 },
        degradedParams: { temperature: 0.5 },
        allowFallback: true
    },
    analysis: {
        baseParams: { temperature: 0.1 },
        degradedParams: { temperature: 0.1 },
        degradeOnFallback: false  // Analysis needs precision
    },
    blueprint: {
        baseParams: { temperature: 0.2 },
        degradedParams: { temperature: 0.1, maxTokens: 4096 },
        degradeOnFallback: true
    },
    component_design: {
        baseParams: { temperature: 0.2 },
        degradedParams: { temperature: 0.1, maxTokens: 2048 },
        degradeOnFallback: true
    },
    seed_content: {
        baseParams: { temperature: 0.7 },
        degradedParams: { temperature: 0.5, maxTokens: 8192 },
        degradeOnFallback: true
    }
};

// ==========================================
// FALLBACK ROUTER CLASS
// ==========================================

export class FallbackRouter {
    private config: FallbackRouterConfig;
    private circuitBreaker: CircuitBreaker;

    constructor(
        config?: Partial<FallbackRouterConfig>,
        circuitBreaker?: CircuitBreaker
    ) {
        this.config = {
            stages: { ...STAGE_DEFAULTS, ...config?.stages },
            defaultProviders: config?.defaultProviders || DEFAULT_PROVIDERS,
            globalMaxDistinct: config?.globalMaxDistinct || 3
        };
        this.circuitBreaker = circuitBreaker || getCircuitBreaker();
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    /**
     * Create a new fallback session for a stage
     */
    createSession(stage: GenerationStage): FallbackSession {
        return {
            stage,
            triedProviderModels: new Set(),
            quotaExhausted: new Set(),
            currentIndex: 0,
            distinctCount: 0
        };
    }

    /**
     * Get the next provider:model to try.
     * Respects circuit breaker state and quota exhaustion.
     * 
     * @param session - Current fallback session
     * @param previousError - Error from previous attempt (if any)
     * @returns FallbackResult or null if no more options
     */
    getNext(
        session: FallbackSession,
        previousError?: LLMError
    ): FallbackResult | null {
        const stageConfig = this.getStageConfig(session.stage);

        // Handle previous error
        if (previousError) {
            // Check if fallback is allowed for this error
            if (!isFallbackAllowed(previousError)) {
                return null;
            }

            // Track quota exhaustion
            if (previousError.category === 'QUOTA') {
                const key = this.makeKey(stageConfig.providers[session.currentIndex]);
                session.quotaExhausted.add(key);
            }

            // Move to next index
            session.currentIndex++;
        }

        // Check if we've exhausted max distinct provider:models
        if (session.distinctCount >= stageConfig.maxDistinctProviderModels) {
            return null;
        }

        // Check global limit
        if (session.distinctCount >= this.config.globalMaxDistinct) {
            return null;
        }

        // Find next available provider:model
        let skippedCount = 0;
        const providers = stageConfig.providers;

        while (session.currentIndex < providers.length) {
            const candidate = providers[session.currentIndex];
            const key = this.makeKey(candidate);

            // Skip if already tried
            if (session.triedProviderModels.has(key)) {
                session.currentIndex++;
                skippedCount++;
                continue;
            }

            // Check circuit breaker
            const circuitKey = makeCircuitKey(candidate.provider, candidate.model);
            if (!this.circuitBreaker.canExecute(circuitKey)) {
                console.log(`[FallbackRouter] Skipping ${key}: circuit OPEN`);
                session.currentIndex++;
                skippedCount++;
                continue;
            }

            // For QUOTA errors, skip providers that have quota issues
            if (previousError?.category === 'QUOTA') {
                if (session.quotaExhausted.has(key)) {
                    session.currentIndex++;
                    skippedCount++;
                    continue;
                }

                // Also skip same provider with different model (likely same quota)
                const sameProviderQuota = Array.from(session.quotaExhausted)
                    .some(k => k.startsWith(candidate.provider + ':'));
                if (sameProviderQuota) {
                    console.log(`[FallbackRouter] Skipping ${key}: same provider has quota issues`);
                    session.currentIndex++;
                    skippedCount++;
                    continue;
                }
            }

            // Found a valid candidate
            session.triedProviderModels.add(key);
            session.distinctCount++;

            const isFallback = session.distinctCount > 1;
            const params = this.getParams(stageConfig, isFallback);

            return {
                providerModel: candidate,
                params,
                isFallback,
                reason: isFallback 
                    ? `Fallback #${session.distinctCount - 1}: ${previousError?.category || 'unknown'}`
                    : 'Primary provider',
                skippedCount
            };
        }

        // No more options
        return null;
    }

    /**
     * Get the primary (first) provider:model for a stage
     */
    getPrimary(stage: GenerationStage): FallbackResult {
        const session = this.createSession(stage);
        const result = this.getNext(session);
        
        if (!result) {
            // Fallback to first default if all circuits open
            const stageConfig = this.getStageConfig(stage);
            return {
                providerModel: stageConfig.providers[0],
                params: stageConfig.baseParams,
                isFallback: false,
                reason: 'Primary provider (forced)',
                skippedCount: 0
            };
        }
        
        return result;
    }

    /**
     * Check if fallback should be attempted for an error
     */
    shouldFallback(stage: GenerationStage, error: LLMError): boolean {
        const stageConfig = this.getStageConfig(stage);
        
        // Stage doesn't allow fallback
        if (!stageConfig.allowFallback) {
            return false;
        }

        // Error doesn't allow fallback
        if (!isFallbackAllowed(error)) {
            return false;
        }

        return true;
    }

    /**
     * Update stage configuration
     */
    updateStageConfig(stage: GenerationStage, config: Partial<StageConfig>): void {
        const current = this.config.stages[stage] || {};
        this.config.stages[stage] = { ...current, ...config };
    }

    /**
     * Set the provider list for a stage
     */
    setProviders(stage: GenerationStage, providers: ProviderModel[]): void {
        const current = this.config.stages[stage] || {};
        this.config.stages[stage] = { ...current, providers };
    }

    // ==========================================
    // PRIVATE METHODS
    // ==========================================

    /**
     * Get merged configuration for a stage
     */
    private getStageConfig(stage: GenerationStage): StageConfig {
        const stageOverrides = this.config.stages[stage] || {};
        return {
            ...DEFAULT_STAGE_CONFIG,
            ...STAGE_DEFAULTS[stage],
            ...stageOverrides,
            providers: stageOverrides.providers || 
                       STAGE_DEFAULTS[stage]?.providers || 
                       this.config.defaultProviders
        };
    }

    /**
     * Get generation parameters based on fallback status
     */
    private getParams(config: StageConfig, isFallback: boolean): GenerationParams {
        if (isFallback && config.degradeOnFallback) {
            return { ...config.baseParams, ...config.degradedParams };
        }
        return config.baseParams;
    }

    /**
     * Create a unique key for provider:model.
     * Uses the unified makeProviderKey format.
     */
    private makeKey(pm: ProviderModel): string {
        return makeProviderKey(pm.provider, pm.model);
    }
}

// ==========================================
// SINGLETON & FACTORY
// ==========================================

let fallbackRouterInstance: FallbackRouter | null = null;

/**
 * Get the global FallbackRouter instance
 */
export function getFallbackRouter(
    config?: Partial<FallbackRouterConfig>,
    circuitBreaker?: CircuitBreaker
): FallbackRouter {
    if (!fallbackRouterInstance) {
        fallbackRouterInstance = new FallbackRouter(config, circuitBreaker);
    }
    return fallbackRouterInstance;
}

/**
 * Reset the global FallbackRouter instance
 */
export function resetFallbackRouter(): void {
    fallbackRouterInstance = null;
}

/**
 * Create a new FallbackRouter instance
 */
export function createFallbackRouter(
    config?: Partial<FallbackRouterConfig>,
    circuitBreaker?: CircuitBreaker
): FallbackRouter {
    return new FallbackRouter(config, circuitBreaker);
}
