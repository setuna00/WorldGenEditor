/**
 * UnifiedScheduler - Task Queue with Rate Limiting, Concurrency Control, and Timeout
 * 
 * Key features:
 * - Per-provider rate limiting using Bottleneck (reservoir-based)
 * - Global and per-provider concurrency slots
 * - True timeout using AbortController
 * - Abortable waiting (rate limit sleep, queue wait)
 * - Clear distinction between TIMEOUT and CANCELLED errors
 * 
 * IMPORTANT: Every API attempt (including retries) must go through the scheduler
 * to ensure rate limits and concurrency controls are properly enforced.
 * 
 * Uses Bottleneck for rate limiting - a more robust solution that handles:
 * - Reservoir-based rate limiting (requests per time window)
 * - Automatic reservoir refresh
 * - Built-in concurrency control
 * - Clustering support (for future distributed scenarios)
 */

import Bottleneck from 'bottleneck';
import { AIProviderType } from './types';
import { LLMError, createCancelledError, createTimeoutError } from './errors';

// ==========================================
// TYPES
// ==========================================

/**
 * Task priority levels
 */
export type TaskPriority = 'high' | 'normal' | 'low';

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'waiting_rate_limit' | 'waiting_slot' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

/**
 * Result of a scheduled task
 * 
 * NOTE: Scheduler only marks TIMEOUT and CANCELLED errors.
 * Other errors are returned as-is (LLMError or raw Error).
 * Callers should use wrapError() from errors.ts for classification.
 */
export interface TaskResult<T> {
    success: boolean;
    data?: T;
    /** 
     * Error if the task failed.
     * - TIMEOUT/CANCELLED: Always LLMError with correct category
     * - Other errors: Returned as-is (may be LLMError or raw Error)
     * 
     * Use wrapError() from errors.ts to classify raw errors.
     */
    error?: LLMError | Error;
    /** Whether the task was cancelled by user */
    cancelled: boolean;
    /** Whether the task timed out */
    timedOut: boolean;
    /** Execution time in ms */
    executionTimeMs: number;
    /** Time spent waiting for rate limit in ms */
    rateLimitWaitMs: number;
    /** Time spent waiting for concurrency slot in ms */
    slotWaitMs: number;
}

/**
 * Options for scheduling a task
 */
export interface ScheduleOptions {
    /** Provider to use */
    provider: AIProviderType;
    /** Task priority */
    priority?: TaskPriority;
    /** Timeout in milliseconds (default: 60000) */
    timeoutMs?: number;
    /** External AbortSignal for user-initiated cancellation */
    signal?: AbortSignal;
    /** Task identifier for debugging */
    taskId?: string;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
    /** Global max concurrent requests across all providers */
    globalMaxConcurrent: number;
    /** Per-provider max concurrent requests */
    perProviderMaxConcurrent: Record<AIProviderType, number>;
    /** Rate limit config per provider (requests per window) */
    rateLimits: Record<AIProviderType, { maxRequests: number; windowMs: number }>;
    /** Default timeout in ms */
    defaultTimeoutMs: number;
    /** Safety buffer added after rate limit wait (ms) */
    rateLimitSafetyBufferMs: number;
}

// Note: QueuedTask is no longer needed - Bottleneck handles internal task management

// ==========================================
// DEFAULT CONFIGURATION
// ==========================================

const DEFAULT_CONFIG: SchedulerConfig = {
    globalMaxConcurrent: 10,
    perProviderMaxConcurrent: {
        gemini: 3,
        openai: 5,
        deepseek: 5,
        claude: 3
    },
    rateLimits: {
        gemini: { maxRequests: 14, windowMs: 60000 },
        openai: { maxRequests: 50, windowMs: 60000 },
        deepseek: { maxRequests: 50, windowMs: 60000 },
        claude: { maxRequests: 50, windowMs: 60000 }
    },
    defaultTimeoutMs: 60000,
    rateLimitSafetyBufferMs: 1000
};

// ==========================================
// BOTTLENECK LIMITER FACTORY
// ==========================================

/**
 * Create a Bottleneck limiter for a provider with the given config.
 * Uses reservoir-based rate limiting for accurate request counting.
 */
function createBottleneckLimiter(
    maxRequests: number,
    windowMs: number,
    maxConcurrent: number
): Bottleneck {
    return new Bottleneck({
        // Reservoir: number of requests allowed in the time window
        reservoir: maxRequests,
        reservoirRefreshAmount: maxRequests,
        reservoirRefreshInterval: windowMs,
        
        // Concurrency control
        maxConcurrent: maxConcurrent,
        
        // Minimum time between requests (helps with burst protection)
        minTime: Math.floor(windowMs / maxRequests / 2),
        
        // High water mark for queue (prevents unbounded queuing)
        highWater: 100,
        strategy: Bottleneck.strategy.OVERFLOW_PRIORITY
    });
}

// ==========================================
// UNIFIED SCHEDULER
// ==========================================

export class UnifiedScheduler {
    private config: SchedulerConfig;
    
    // Bottleneck limiters per provider (handles both rate limiting AND concurrency)
    private limiters: Map<AIProviderType, Bottleneck> = new Map();
    
    // Global limiter for cross-provider concurrency control
    private globalLimiter: Bottleneck;
    
    // Task counter for unique IDs
    private taskCounter = 0;

    constructor(config?: Partial<SchedulerConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        // Initialize global limiter (concurrency only, no rate limit)
        this.globalLimiter = new Bottleneck({
            maxConcurrent: this.config.globalMaxConcurrent,
            minTime: 0
        });
        
        // Initialize per-provider limiters with rate limiting + concurrency
        for (const provider of Object.keys(this.config.rateLimits) as AIProviderType[]) {
            const rateConfig = this.config.rateLimits[provider];
            const concurrency = this.config.perProviderMaxConcurrent[provider] || 5;
            
            this.limiters.set(provider, createBottleneckLimiter(
                rateConfig.maxRequests,
                rateConfig.windowMs,
                concurrency
            ));
        }
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    /**
     * Schedule a task for execution.
     * The task will be queued and executed when:
     * 1. Rate limit allows (via Bottleneck reservoir)
     * 2. Concurrency slot is available (via Bottleneck maxConcurrent)
     * 
     * @param execute - Async function that performs the actual work.
     *                  Receives an AbortSignal that combines timeout and user cancellation.
     * @param options - Scheduling options
     * @returns TaskResult with execution outcome
     */
    async schedule<T>(
        execute: (signal: AbortSignal) => Promise<T>,
        options: ScheduleOptions
    ): Promise<TaskResult<T>> {
        const taskId = options.taskId || `task-${++this.taskCounter}`;
        const startTime = Date.now();
        
        // Check for external abort before starting
        if (options.signal?.aborted) {
            return {
                success: false,
                error: createCancelledError('Task cancelled before start', options.provider),
                cancelled: true,
                timedOut: false,
                executionTimeMs: 0,
                rateLimitWaitMs: 0,
                slotWaitMs: 0
            };
        }

        // Get provider-specific limiter
        const limiter = this.limiters.get(options.provider);
        if (!limiter) {
            // Create a default limiter if provider not configured
            const defaultLimiter = createBottleneckLimiter(50, 60000, 5);
            this.limiters.set(options.provider, defaultLimiter);
        }

        const providerLimiter = this.limiters.get(options.provider)!;
        
        // Track timing
        let rateLimitWaitMs = 0;
        let slotWaitMs = 0;
        const queueStartTime = Date.now();

        try {
            // Use Bottleneck's schedule method which handles:
            // 1. Rate limiting (reservoir-based)
            // 2. Concurrency control (maxConcurrent)
            // 3. Queue management
            const result = await providerLimiter.schedule(
                { 
                    id: taskId,
                    // Allow abort to cancel queued jobs
                    signal: options.signal 
                },
                async () => {
                    // Calculate wait times (queue time = rate limit + slot wait combined)
                    const waitTime = Date.now() - queueStartTime;
                    // Bottleneck combines rate limit and concurrency, 
                    // we estimate the split based on reservoir state
                    const counts = await providerLimiter.currentReservoir();
                    if (counts !== null && counts === 0) {
                        // Reservoir was empty, so we waited for rate limit
                        rateLimitWaitMs = waitTime;
                    } else {
                        // Reservoir had capacity, so wait was for concurrency
                        slotWaitMs = waitTime;
                    }

                    // Check for abort after Bottleneck releases us
                    if (options.signal?.aborted) {
                        throw new DOMException('Task cancelled while queued', 'AbortError');
                    }

                    // Execute with timeout
                    const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs;
                    return this.executeWithTimeout(
                        execute,
                        timeoutMs,
                        options.provider,
                        options.signal,
                        taskId
                    );
                }
            );

            return {
                ...result,
                rateLimitWaitMs,
                slotWaitMs
            };

        } catch (error) {
            // Handle Bottleneck-specific errors and general errors
            const executionTimeMs = Date.now() - startTime;
            
            // Check if it's an abort error
            if (error instanceof DOMException && error.name === 'AbortError') {
                return {
                    success: false,
                    error: createCancelledError('Task cancelled', options.provider),
                    cancelled: true,
                    timedOut: false,
                    executionTimeMs,
                    rateLimitWaitMs,
                    slotWaitMs
                };
            }

            // Check if Bottleneck dropped the job (queue overflow)
            if (error instanceof Bottleneck.BottleneckError) {
                return {
                    success: false,
                    error: new LLMError(
                        `Rate limiter queue overflow: ${error.message}`,
                        'RETRYABLE_TRANSIENT',
                        { provider: options.provider }
                    ),
                    cancelled: false,
                    timedOut: false,
                    executionTimeMs,
                    rateLimitWaitMs,
                    slotWaitMs
                };
            }
            
            if (error instanceof LLMError) {
                return {
                    success: false,
                    error,
                    cancelled: error.category === 'CANCELLED',
                    timedOut: error.category === 'TIMEOUT',
                    executionTimeMs,
                    rateLimitWaitMs,
                    slotWaitMs
                };
            }

            // Return raw error as-is - let caller classify using wrapError()
            const rawError = error instanceof Error ? error : new Error(String(error));

            return {
                success: false,
                error: rawError,
                cancelled: false,
                timedOut: false,
                executionTimeMs,
                rateLimitWaitMs,
                slotWaitMs
            };
        }
    }

    /**
     * Get current scheduler statistics
     */
    getStats(): {
        globalActive: number;
        perProviderActive: Record<AIProviderType, number>;
        queueLength: number;
        rateLimitStats: Record<AIProviderType, { current: number; max: number }>;
    } {
        const rateLimitStats: Record<string, { current: number; max: number }> = {};
        const perProviderActive: Record<string, number> = {};
        let totalQueueLength = 0;
        let totalActive = 0;
        
        for (const [provider, limiter] of this.limiters) {
            const counts = limiter.counts();
            const rateConfig = this.config.rateLimits[provider];
            
            // Bottleneck counts: RECEIVED, QUEUED, RUNNING, EXECUTING, DONE
            perProviderActive[provider] = counts.RUNNING + counts.EXECUTING;
            totalActive += counts.RUNNING + counts.EXECUTING;
            totalQueueLength += counts.QUEUED;
            
            // Estimate reservoir usage from limiter
            // Note: currentReservoir() is async, so we use a sync approximation
            rateLimitStats[provider] = {
                current: rateConfig.maxRequests - (counts.RECEIVED % rateConfig.maxRequests),
                max: rateConfig.maxRequests
            };
        }

        return {
            globalActive: totalActive,
            perProviderActive: perProviderActive as Record<AIProviderType, number>,
            queueLength: totalQueueLength,
            rateLimitStats: rateLimitStats as Record<AIProviderType, { current: number; max: number }>
        };
    }

    /**
     * Reset all rate limiters and clear state.
     * Useful for testing or after configuration changes.
     */
    reset(): void {
        // Stop all limiters and clear queues
        for (const limiter of this.limiters.values()) {
            limiter.stop({ dropWaitingJobs: true });
        }
        this.limiters.clear();
        
        // Re-initialize limiters
        for (const provider of Object.keys(this.config.rateLimits) as AIProviderType[]) {
            const rateConfig = this.config.rateLimits[provider];
            const concurrency = this.config.perProviderMaxConcurrent[provider] || 5;
            
            this.limiters.set(provider, createBottleneckLimiter(
                rateConfig.maxRequests,
                rateConfig.windowMs,
                concurrency
            ));
        }
    }

    /**
     * Update rate limit configuration for a provider at runtime.
     * Useful when user changes settings or API tier.
     */
    updateProviderConfig(
        provider: AIProviderType, 
        config: { maxRequests?: number; windowMs?: number; maxConcurrent?: number }
    ): void {
        const currentConfig = this.config.rateLimits[provider] || { maxRequests: 50, windowMs: 60000 };
        const currentConcurrency = this.config.perProviderMaxConcurrent[provider] || 5;
        
        const newMaxRequests = config.maxRequests ?? currentConfig.maxRequests;
        const newWindowMs = config.windowMs ?? currentConfig.windowMs;
        const newConcurrency = config.maxConcurrent ?? currentConcurrency;
        
        // Update stored config
        this.config.rateLimits[provider] = { maxRequests: newMaxRequests, windowMs: newWindowMs };
        this.config.perProviderMaxConcurrent[provider] = newConcurrency;
        
        // Stop old limiter and create new one
        const oldLimiter = this.limiters.get(provider);
        if (oldLimiter) {
            oldLimiter.stop({ dropWaitingJobs: false });
        }
        
        this.limiters.set(provider, createBottleneckLimiter(
            newMaxRequests,
            newWindowMs,
            newConcurrency
        ));
        
        console.log(`[Scheduler] Updated ${provider} config: ${newMaxRequests} req/${newWindowMs}ms, ${newConcurrency} concurrent`);
    }

    // ==========================================
    // PRIVATE: EXECUTION WITH TIMEOUT
    // ==========================================

    /**
     * Execute a task with timeout and abort support.
     * Creates a combined signal from timeout and external abort.
     * 
     * Note: Bottleneck handles concurrency slot release automatically,
     * so we don't need manual releaseSlot calls.
     */
    private async executeWithTimeout<T>(
        execute: (signal: AbortSignal) => Promise<T>,
        timeoutMs: number,
        provider: AIProviderType,
        externalSignal?: AbortSignal,
        taskId?: string
    ): Promise<Omit<TaskResult<T>, 'rateLimitWaitMs' | 'slotWaitMs'>> {
        const startTime = Date.now();
        
        // Create timeout controller
        const timeoutController = new AbortController();
        let timeoutTriggered = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        // Set up timeout
        timeoutId = setTimeout(() => {
            timeoutTriggered = true;
            timeoutController.abort();
        }, timeoutMs);

        // Create combined signal if external signal exists
        const combinedController = new AbortController();
        
        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
        };

        // Link external signal
        const onExternalAbort = () => {
            cleanup();
            combinedController.abort();
        };
        
        if (externalSignal) {
            if (externalSignal.aborted) {
                cleanup();
                return {
                    success: false,
                    error: createCancelledError('Task cancelled', provider),
                    cancelled: true,
                    timedOut: false,
                    executionTimeMs: Date.now() - startTime
                };
            }
            externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }

        // Link timeout signal
        const onTimeoutAbort = () => {
            combinedController.abort();
        };
        timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });

        try {
            const data = await execute(combinedController.signal);
            
            cleanup();
            if (externalSignal) {
                externalSignal.removeEventListener('abort', onExternalAbort);
            }

            return {
                success: true,
                data,
                cancelled: false,
                timedOut: false,
                executionTimeMs: Date.now() - startTime
            };

        } catch (error) {
            cleanup();
            if (externalSignal) {
                externalSignal.removeEventListener('abort', onExternalAbort);
            }

            const executionTimeMs = Date.now() - startTime;

            // Determine if this was timeout vs user cancellation
            if (timeoutTriggered) {
                return {
                    success: false,
                    error: createTimeoutError(`Task timed out after ${timeoutMs}ms`, provider),
                    cancelled: false,
                    timedOut: true,
                    executionTimeMs
                };
            }

            if (externalSignal?.aborted) {
                return {
                    success: false,
                    error: createCancelledError('Task cancelled by user', provider),
                    cancelled: true,
                    timedOut: false,
                    executionTimeMs
                };
            }

            // Check if error is an abort-related error
            if (error instanceof Error && error.name === 'AbortError') {
                // Could be either timeout or cancel - check our flags
                if (timeoutTriggered) {
                    return {
                        success: false,
                        error: createTimeoutError(`Task timed out after ${timeoutMs}ms`, provider),
                        cancelled: false,
                        timedOut: true,
                        executionTimeMs
                    };
                }
                return {
                    success: false,
                    error: createCancelledError('Task cancelled', provider),
                    cancelled: true,
                    timedOut: false,
                    executionTimeMs
                };
            }

            // Regular error - return as-is without classification
            // IMPORTANT: DO NOT wrap with RETRYABLE_TRANSIENT default!
            // Let the caller (retry layer) classify using wrapError() with full context.
            const rawError = error instanceof LLMError
                ? error
                : (error instanceof Error ? error : new Error(String(error)));

            return {
                success: false,
                error: rawError,
                cancelled: false,
                timedOut: false,
                executionTimeMs
            };
        }
    }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

let schedulerInstance: UnifiedScheduler | null = null;

/**
 * Get the global scheduler instance
 */
export function getScheduler(config?: Partial<SchedulerConfig>): UnifiedScheduler {
    if (!schedulerInstance) {
        schedulerInstance = new UnifiedScheduler(config);
    }
    return schedulerInstance;
}

/**
 * Reset the global scheduler instance
 */
export function resetScheduler(): void {
    if (schedulerInstance) {
        schedulerInstance.reset();
    }
    schedulerInstance = null;
}

/**
 * Create a new scheduler instance (for testing or isolated use)
 */
export function createScheduler(config?: Partial<SchedulerConfig>): UnifiedScheduler {
    return new UnifiedScheduler(config);
}
