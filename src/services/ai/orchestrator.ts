/**
 * LLMOrchestrator - Unified LLM Call Entry Point
 * 
 * This is the ONLY entry point for all LLM calls in the application.
 * It orchestrates: Scheduler -> Retry -> CircuitBreaker -> Fallback -> Telemetry
 * 
 * Call flow:
 * 1. Select provider:model from fallback router
 * 2. Check circuit breaker state
 * 3. Execute with retry (each attempt through scheduler)
 * 4. Record outcomes for circuit breaker
 * 5. On failure, try next fallback
 * 6. Record telemetry throughout
 * 
 * Telemetry captures:
 * - queueWaitMs: Time waiting for rate limit
 * - slotWaitMs: Time waiting for concurrency slot
 * - apiDurationMs: Actual API call time
 * - totalDurationMs: End-to-end time
 * - attempts: Real API call count
 */

import { 
    AIProvider, 
    AIProviderType, 
    StandardSchema, 
    GenerationOptions, 
    GenerationResult 
} from './types';
import { LLMError, wrapError, isFallbackAllowed, makeProviderKey, WrapErrorContext } from './errors';
import { UnifiedScheduler, getScheduler } from './scheduler';
import { RetryManager, getRetryManager, RetryContext, RetryResult } from './retryManager';
import { CircuitBreaker, getCircuitBreaker, makeCircuitKey } from './circuitBreaker';
import { 
    FallbackRouter, 
    getFallbackRouter, 
    GenerationStage, 
    ProviderModel,
    FallbackSession,
    GenerationParams
} from './fallbackRouter';
import { getProvider } from './providers';

// ==========================================
// TYPES
// ==========================================

/**
 * Telemetry data for a single attempt
 */
export interface AttemptTelemetry {
    providerKey: string;
    attemptNumber: number;
    success: boolean;
    errorCategory?: string;
    queueWaitMs: number;
    slotWaitMs: number;
    apiDurationMs: number;
    timestamp: number;
}

/**
 * Full telemetry for an orchestrated call
 */
export interface CallTelemetry {
    stage: GenerationStage;
    /** Total end-to-end duration */
    totalDurationMs: number;
    /** Number of real API attempts */
    totalAttempts: number;
    /** Number of distinct provider:models tried */
    providersTriedCount: number;
    /** Provider:models tried in order */
    providersTried: string[];
    /** Final outcome */
    success: boolean;
    /** Final error if failed */
    finalError?: string;
    /** Per-attempt telemetry */
    attempts: AttemptTelemetry[];
    /** Whether any fallback was used */
    usedFallback: boolean;
    /** Whether cancelled by user */
    cancelled: boolean;
    /** Whether final failure was timeout */
    timedOut: boolean;
}

/**
 * Options for orchestrated calls
 */
export interface OrchestratorCallOptions {
    /** Generation stage */
    stage: GenerationStage;
    /** Timeout per attempt in ms */
    timeoutMs?: number;
    /** External abort signal */
    signal?: AbortSignal;
    /** Task ID for debugging */
    taskId?: string;
    /** Callback for telemetry updates */
    onTelemetry?: (telemetry: CallTelemetry) => void;
    /** Override provider list for this call */
    providers?: ProviderModel[];
}

/**
 * Result of an orchestrated call
 */
export interface OrchestratorResult<T> {
    success: boolean;
    data?: T;
    error?: LLMError;
    telemetry: CallTelemetry;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
    /** Default timeout per attempt (ms) */
    defaultTimeoutMs: number;
    /** Whether to collect detailed telemetry */
    collectTelemetry: boolean;
}

// ==========================================
// DEFAULT CONFIG
// ==========================================

const DEFAULT_CONFIG: OrchestratorConfig = {
    defaultTimeoutMs: 60000,
    collectTelemetry: true
};

// ==========================================
// ORCHESTRATOR CLASS
// ==========================================

export class LLMOrchestrator {
    private scheduler: UnifiedScheduler;
    private retryManager: RetryManager;
    private circuitBreaker: CircuitBreaker;
    private fallbackRouter: FallbackRouter;
    private config: OrchestratorConfig;
    
    // Provider cache
    private providerCache: Map<string, AIProvider> = new Map();

    constructor(
        config?: Partial<OrchestratorConfig>,
        deps?: {
            scheduler?: UnifiedScheduler;
            retryManager?: RetryManager;
            circuitBreaker?: CircuitBreaker;
            fallbackRouter?: FallbackRouter;
        }
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.scheduler = deps?.scheduler || getScheduler();
        this.retryManager = deps?.retryManager || getRetryManager(this.scheduler);
        this.circuitBreaker = deps?.circuitBreaker || getCircuitBreaker();
        this.fallbackRouter = deps?.fallbackRouter || getFallbackRouter(undefined, this.circuitBreaker);
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    /**
     * Execute a structured data generation with full orchestration.
     */
    async generateStructuredData(
        systemPrompt: string,
        userPrompt: string,
        schema: StandardSchema,
        options: OrchestratorCallOptions
    ): Promise<OrchestratorResult<GenerationResult>> {
        return this.executeWithFallback(
            options,
            async (provider, params, context, signal) => {
                // Apply repair hint if in repair mode
                let finalSystemPrompt = systemPrompt;
                if (context.repairMode && context.repairHint) {
                    finalSystemPrompt = `${systemPrompt}\n\n${context.repairHint}`;
                }

                return provider.generateStructuredData(
                    finalSystemPrompt,
                    userPrompt,
                    schema,
                    params.temperature,
                    signal
                );
            }
        );
    }

    /**
     * Execute a batch generation with full orchestration.
     */
    async generateBatch(
        poolName: string,
        userPrompt: string,
        count: number,
        worldContext: string,
        genOptions: GenerationOptions,
        schema: StandardSchema | undefined,
        allowedComponentIds: string[] | undefined,
        options: OrchestratorCallOptions
    ): Promise<OrchestratorResult<any[]>> {
        return this.executeWithFallback(
            options,
            async (provider, params, context, signal) => {
                // Apply repair hint if in repair mode
                let finalWorldContext = worldContext;
                if (context.repairMode && context.repairHint) {
                    finalWorldContext = `${worldContext}\n\n${context.repairHint}`;
                }

                return provider.generateBatch(
                    poolName,
                    userPrompt,
                    count,
                    finalWorldContext,
                    genOptions,
                    schema,
                    allowedComponentIds,
                    params.temperature,
                    signal
                );
            }
        );
    }

    /**
     * Low-level call method for custom operations.
     */
    async call<T>(
        options: OrchestratorCallOptions,
        execute: (
            provider: AIProvider,
            params: GenerationParams,
            context: RetryContext,
            signal: AbortSignal
        ) => Promise<T>
    ): Promise<OrchestratorResult<T>> {
        return this.executeWithFallback(options, execute);
    }

    /**
     * Get orchestrator statistics
     */
    getStats(): {
        scheduler: ReturnType<UnifiedScheduler['getStats']>;
        circuitBreaker: ReturnType<CircuitBreaker['getAllStats']>;
    } {
        return {
            scheduler: this.scheduler.getStats(),
            circuitBreaker: this.circuitBreaker.getAllStats()
        };
    }

    // ==========================================
    // PRIVATE: CORE ORCHESTRATION
    // ==========================================

    /**
     * Execute with full fallback orchestration
     */
    private async executeWithFallback<T>(
        options: OrchestratorCallOptions,
        execute: (
            provider: AIProvider,
            params: GenerationParams,
            context: RetryContext,
            signal: AbortSignal
        ) => Promise<T>
    ): Promise<OrchestratorResult<T>> {
        const startTime = Date.now();
        const telemetry: CallTelemetry = {
            stage: options.stage,
            totalDurationMs: 0,
            totalAttempts: 0,
            providersTriedCount: 0,
            providersTried: [],
            success: false,
            attempts: [],
            usedFallback: false,
            cancelled: false,
            timedOut: false
        };

        // Check for abort before starting
        if (options.signal?.aborted) {
            telemetry.cancelled = true;
            telemetry.totalDurationMs = Date.now() - startTime;
            return {
                success: false,
                error: wrapError(
                    new DOMException('Operation cancelled', 'AbortError'),
                    { provider: 'orchestrator', stage: options.stage }
                ),
                telemetry
            };
        }

        // Create fallback session
        const session = this.fallbackRouter.createSession(options.stage);
        
        // Override providers if specified
        if (options.providers) {
            this.fallbackRouter.setProviders(options.stage, options.providers);
        }

        let lastError: LLMError | undefined;

        // Fallback loop
        while (true) {
            // Get next provider:model
            const next = this.fallbackRouter.getNext(session, lastError);
            
            if (!next) {
                // No more options
                break;
            }

            const providerKey = makeProviderKey(next.providerModel.provider, next.providerModel.model);
            telemetry.providersTried.push(providerKey);
            telemetry.providersTriedCount++;

            if (next.isFallback) {
                telemetry.usedFallback = true;
                console.log(`[Orchestrator] Falling back to ${providerKey}: ${next.reason}`);
            }

            // Check circuit breaker
            const circuitKey = makeCircuitKey(
                next.providerModel.provider,
                next.providerModel.model
            );
            
            if (!this.circuitBreaker.canExecute(circuitKey)) {
                console.log(`[Orchestrator] Skipping ${providerKey}: circuit OPEN`);
                // Record in telemetry
                telemetry.attempts.push({
                    providerKey,
                    attemptNumber: 0,
                    success: false,
                    errorCategory: 'CIRCUIT_OPEN',
                    queueWaitMs: 0,
                    slotWaitMs: 0,
                    apiDurationMs: 0,
                    timestamp: Date.now()
                });
                continue;
            }

            // Get provider instance
            const provider = this.getProviderInstance(next.providerModel);

            // Execute with retry
            const retryResult = await this.retryManager.withRetry<T>(
                async (context, signal) => {
                    return execute(provider, next.params, context, signal);
                },
                {
                    provider: next.providerModel.provider,
                    model: next.providerModel.model,
                    timeoutMs: options.timeoutMs ?? this.config.defaultTimeoutMs,
                    signal: options.signal,
                    taskId: options.taskId,
                    onAttemptComplete: (error, attemptNumber) => {
                        // Record outcome for circuit breaker
                        this.circuitBreaker.recordOutcome(circuitKey, error);
                        
                        // Record telemetry
                        telemetry.totalAttempts++;
                        telemetry.attempts.push({
                            providerKey,
                            attemptNumber,
                            success: error === null,
                            errorCategory: error?.category,
                            queueWaitMs: 0,  // Will be updated if we have more detail
                            slotWaitMs: 0,
                            apiDurationMs: 0,
                            timestamp: Date.now()
                        });
                    }
                }
            );

            // Success!
            if (retryResult.success) {
                telemetry.success = true;
                telemetry.totalDurationMs = Date.now() - startTime;
                
                if (options.onTelemetry) {
                    options.onTelemetry(telemetry);
                }

                return {
                    success: true,
                    data: retryResult.data,
                    telemetry
                };
            }

            // Handle failure - ensure error has complete context (provider, model, stage)
            const errorContext: WrapErrorContext = {
                provider: next.providerModel.provider,
                model: next.providerModel.model,
                stage: options.stage
            };
            lastError = retryResult.error 
                ? wrapError(retryResult.error, errorContext)
                : undefined;

            // Check for cancellation
            if (retryResult.cancelled) {
                telemetry.cancelled = true;
                telemetry.totalDurationMs = Date.now() - startTime;
                telemetry.finalError = lastError?.message;
                
                if (options.onTelemetry) {
                    options.onTelemetry(telemetry);
                }

                return {
                    success: false,
                    error: lastError,
                    telemetry
                };
            }

            // Check if we should fallback
            if (!this.fallbackRouter.shouldFallback(options.stage, lastError!)) {
                break;
            }

            // Continue to next fallback
        }

        // All options exhausted
        telemetry.success = false;
        telemetry.totalDurationMs = Date.now() - startTime;
        telemetry.timedOut = lastError?.category === 'TIMEOUT';
        telemetry.finalError = lastError?.message || 'All providers failed';

        if (options.onTelemetry) {
            options.onTelemetry(telemetry);
        }

        return {
            success: false,
            error: lastError || new LLMError('All providers failed', 'RETRYABLE_TRANSIENT', {
                stage: options.stage
            }),
            telemetry
        };
    }

    // ==========================================
    // PRIVATE: PROVIDER MANAGEMENT
    // ==========================================

    /**
     * Get or create a provider instance
     */
    private getProviderInstance(pm: ProviderModel): AIProvider {
        const key = makeProviderKey(pm.provider, pm.model);
        
        if (!this.providerCache.has(key)) {
            const provider = getProvider(pm.provider, { model: pm.model });
            this.providerCache.set(key, provider);
        }
        
        return this.providerCache.get(key)!;
    }

    /**
     * Clear provider cache
     */
    clearProviderCache(): void {
        this.providerCache.clear();
    }
}

// ==========================================
// SINGLETON & FACTORY
// ==========================================

let orchestratorInstance: LLMOrchestrator | null = null;

/**
 * Get the global LLMOrchestrator instance
 */
export function getOrchestrator(config?: Partial<OrchestratorConfig>): LLMOrchestrator {
    if (!orchestratorInstance) {
        orchestratorInstance = new LLMOrchestrator(config);
    }
    return orchestratorInstance;
}

/**
 * Reset the global LLMOrchestrator instance
 */
export function resetOrchestrator(): void {
    if (orchestratorInstance) {
        orchestratorInstance.clearProviderCache();
    }
    orchestratorInstance = null;
}

/**
 * Create a new LLMOrchestrator instance
 */
export function createOrchestrator(
    config?: Partial<OrchestratorConfig>,
    deps?: {
        scheduler?: UnifiedScheduler;
        retryManager?: RetryManager;
        circuitBreaker?: CircuitBreaker;
        fallbackRouter?: FallbackRouter;
    }
): LLMOrchestrator {
    return new LLMOrchestrator(config, deps);
}
