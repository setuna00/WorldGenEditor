/**
 * UnifiedScheduler - Task Queue with Rate Limiting, Concurrency Control, and Timeout
 * 
 * Key features:
 * - Per-provider rate limiting with mutex to prevent concurrent race conditions
 * - Global and per-provider concurrency slots
 * - True timeout using AbortController
 * - Abortable waiting (rate limit sleep, queue wait)
 * - Clear distinction between TIMEOUT and CANCELLED errors
 * 
 * IMPORTANT: Every API attempt (including retries) must go through the scheduler
 * to ensure rate limits and concurrency controls are properly enforced.
 */

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

/**
 * Internal task representation
 */
interface QueuedTask<T> {
    id: string;
    provider: AIProviderType;
    priority: TaskPriority;
    execute: (signal: AbortSignal) => Promise<T>;
    resolve: (result: TaskResult<T>) => void;
    enqueuedAt: number;
    timeoutMs: number;
    externalSignal?: AbortSignal;
    status: TaskStatus;
}

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
// MUTEX FOR RATE LIMITER
// ==========================================

/**
 * Simple mutex to serialize rate limiter access per provider.
 * Prevents multiple tasks from calculating wait time simultaneously
 * which could cause them all to fire at once.
 */
class Mutex {
    private locked = false;
    private queue: Array<() => void> = [];

    async acquire(): Promise<void> {
        if (!this.locked) {
            this.locked = true;
            return;
        }

        return new Promise<void>(resolve => {
            this.queue.push(resolve);
        });
    }

    release(): void {
        const next = this.queue.shift();
        if (next) {
            next();
        } else {
            this.locked = false;
        }
    }
}

// ==========================================
// RATE LIMITER STATE
// ==========================================

interface RateLimiterState {
    /** Request timestamps within the current window */
    history: number[];
    /** Mutex for serializing access */
    mutex: Mutex;
}

// ==========================================
// UNIFIED SCHEDULER
// ==========================================

export class UnifiedScheduler {
    private config: SchedulerConfig;
    
    // Rate limiter state per provider
    private rateLimiters: Map<AIProviderType, RateLimiterState> = new Map();
    
    // Concurrency tracking
    private globalActiveCount = 0;
    private providerActiveCount: Map<AIProviderType, number> = new Map();
    
    // Task queue (priority-sorted)
    private taskQueue: QueuedTask<any>[] = [];
    
    // Active tasks
    private activeTasks: Map<string, QueuedTask<any>> = new Map();
    
    // Slot waiters (tasks waiting for concurrency slot)
    private slotWaiters: Array<{ 
        provider: AIProviderType; 
        resolve: () => void; 
        signal?: AbortSignal;
    }> = [];

    // Task counter for unique IDs
    private taskCounter = 0;

    constructor(config?: Partial<SchedulerConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        // Initialize rate limiters
        for (const provider of Object.keys(this.config.rateLimits) as AIProviderType[]) {
            this.rateLimiters.set(provider, {
                history: [],
                mutex: new Mutex()
            });
            this.providerActiveCount.set(provider, 0);
        }
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    /**
     * Schedule a task for execution.
     * The task will be queued and executed when:
     * 1. Rate limit allows
     * 2. Concurrency slot is available
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
        
        // Create internal tracking
        let rateLimitWaitMs = 0;
        let slotWaitMs = 0;
        
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

        try {
            // === STEP 1: RATE LIMIT WAIT ===
            const rateLimitStart = Date.now();
            await this.waitForRateLimit(options.provider, options.signal);
            rateLimitWaitMs = Date.now() - rateLimitStart;

            // Check for abort after rate limit wait
            if (options.signal?.aborted) {
                return {
                    success: false,
                    error: createCancelledError('Task cancelled during rate limit wait', options.provider),
                    cancelled: true,
                    timedOut: false,
                    executionTimeMs: 0,
                    rateLimitWaitMs,
                    slotWaitMs: 0
                };
            }

            // === STEP 2: CONCURRENCY SLOT WAIT ===
            const slotStart = Date.now();
            await this.acquireSlot(options.provider, options.signal);
            slotWaitMs = Date.now() - slotStart;

            // Check for abort after slot acquisition
            if (options.signal?.aborted) {
                this.releaseSlot(options.provider);
                return {
                    success: false,
                    error: createCancelledError('Task cancelled while waiting for slot', options.provider),
                    cancelled: true,
                    timedOut: false,
                    executionTimeMs: 0,
                    rateLimitWaitMs,
                    slotWaitMs
                };
            }

            // === STEP 3: EXECUTE WITH TIMEOUT ===
            const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs;
            const result = await this.executeWithTimeout(
                execute,
                timeoutMs,
                options.provider,
                options.signal,
                taskId
            );

            return {
                ...result,
                rateLimitWaitMs,
                slotWaitMs
            };

        } catch (error) {
            // Handle unexpected errors during scheduling (rate limit wait, slot acquisition)
            // 
            // IMPORTANT: Scheduler only marks TIMEOUT and CANCELLED.
            // Other errors are returned as-is for the caller to classify.
            const executionTimeMs = Date.now() - startTime;
            
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
            // DO NOT default to RETRYABLE_TRANSIENT here!
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
        
        for (const [provider, state] of this.rateLimiters) {
            const now = Date.now();
            const windowMs = this.config.rateLimits[provider].windowMs;
            const validHistory = state.history.filter(t => now - t < windowMs);
            rateLimitStats[provider] = {
                current: validHistory.length,
                max: this.config.rateLimits[provider].maxRequests
            };
        }

        return {
            globalActive: this.globalActiveCount,
            perProviderActive: Object.fromEntries(this.providerActiveCount) as Record<AIProviderType, number>,
            queueLength: this.taskQueue.length,
            rateLimitStats: rateLimitStats as Record<AIProviderType, { current: number; max: number }>
        };
    }

    /**
     * Reset all rate limiters and clear state.
     * Useful for testing or after configuration changes.
     */
    reset(): void {
        for (const state of this.rateLimiters.values()) {
            state.history = [];
        }
        this.globalActiveCount = 0;
        for (const provider of this.providerActiveCount.keys()) {
            this.providerActiveCount.set(provider, 0);
        }
        this.taskQueue = [];
        this.activeTasks.clear();
    }

    // ==========================================
    // PRIVATE: RATE LIMITING
    // ==========================================

    /**
     * Wait for rate limit to allow a new request.
     * Uses mutex to prevent concurrent race conditions.
     */
    private async waitForRateLimit(
        provider: AIProviderType,
        signal?: AbortSignal
    ): Promise<void> {
        const state = this.rateLimiters.get(provider);
        if (!state) return;

        const rateConfig = this.config.rateLimits[provider];

        // Acquire mutex to serialize rate limit checks
        await state.mutex.acquire();

        try {
            const now = Date.now();
            
            // Prune old history
            state.history = state.history.filter(t => now - t < rateConfig.windowMs);

            // Check if we need to wait
            if (state.history.length >= rateConfig.maxRequests) {
                const oldestTime = state.history[0];
                const expiryTime = oldestTime + rateConfig.windowMs;
                const waitTime = Math.max(0, expiryTime - now + this.config.rateLimitSafetyBufferMs);

                if (waitTime > 0) {
                    console.log(
                        `[Scheduler/${provider}] Rate limit reached (${state.history.length}/${rateConfig.maxRequests}). ` +
                        `Waiting ${waitTime}ms...`
                    );

                    // Wait with abort support
                    await this.abortableSleep(waitTime, signal);
                }
            }

            // Record this request BEFORE releasing mutex
            // This prevents other tasks from also thinking they can proceed
            state.history.push(Date.now());

        } finally {
            state.mutex.release();
        }
    }

    // ==========================================
    // PRIVATE: CONCURRENCY CONTROL
    // ==========================================

    /**
     * Acquire a concurrency slot (global + per-provider)
     */
    private async acquireSlot(
        provider: AIProviderType,
        signal?: AbortSignal
    ): Promise<void> {
        // Check if slot is immediately available
        if (this.canAcquireSlot(provider)) {
            this.incrementSlot(provider);
            return;
        }

        // Need to wait for a slot
        return new Promise<void>((resolve, reject) => {
            const waiter = { 
                provider, 
                resolve, 
                signal 
            };
            
            // Handle abort while waiting
            if (signal) {
                const onAbort = () => {
                    const idx = this.slotWaiters.indexOf(waiter);
                    if (idx >= 0) {
                        this.slotWaiters.splice(idx, 1);
                    }
                    reject(createCancelledError('Cancelled while waiting for slot', provider));
                };
                
                if (signal.aborted) {
                    reject(createCancelledError('Cancelled while waiting for slot', provider));
                    return;
                }
                
                signal.addEventListener('abort', onAbort, { once: true });
                
                // Wrap resolve to clean up listener
                const originalResolve = resolve;
                waiter.resolve = () => {
                    signal.removeEventListener('abort', onAbort);
                    originalResolve();
                };
            }
            
            this.slotWaiters.push(waiter);
        });
    }

    /**
     * Check if a slot can be acquired
     */
    private canAcquireSlot(provider: AIProviderType): boolean {
        const globalMax = this.config.globalMaxConcurrent;
        const providerMax = this.config.perProviderMaxConcurrent[provider] || globalMax;
        const providerActive = this.providerActiveCount.get(provider) || 0;

        return this.globalActiveCount < globalMax && providerActive < providerMax;
    }

    /**
     * Increment slot counters
     */
    private incrementSlot(provider: AIProviderType): void {
        this.globalActiveCount++;
        this.providerActiveCount.set(
            provider,
            (this.providerActiveCount.get(provider) || 0) + 1
        );
    }

    /**
     * Release a concurrency slot and notify waiting tasks
     */
    private releaseSlot(provider: AIProviderType): void {
        this.globalActiveCount = Math.max(0, this.globalActiveCount - 1);
        this.providerActiveCount.set(
            provider,
            Math.max(0, (this.providerActiveCount.get(provider) || 0) - 1)
        );

        // Notify waiting tasks
        this.processSlotWaiters();
    }

    /**
     * Process waiting tasks when a slot becomes available
     */
    private processSlotWaiters(): void {
        // Find first waiter that can proceed
        for (let i = 0; i < this.slotWaiters.length; i++) {
            const waiter = this.slotWaiters[i];
            
            // Skip if signal is aborted
            if (waiter.signal?.aborted) {
                this.slotWaiters.splice(i, 1);
                i--;
                continue;
            }
            
            if (this.canAcquireSlot(waiter.provider)) {
                this.slotWaiters.splice(i, 1);
                this.incrementSlot(waiter.provider);
                waiter.resolve();
                return;
            }
        }
    }

    // ==========================================
    // PRIVATE: EXECUTION WITH TIMEOUT
    // ==========================================

    /**
     * Execute a task with timeout and abort support.
     * Creates a combined signal from timeout and external abort.
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
        let timeoutId: NodeJS.Timeout | undefined;

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
                this.releaseSlot(provider);
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
            this.releaseSlot(provider);

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
            this.releaseSlot(provider);

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

    // ==========================================
    // PRIVATE: UTILITIES
    // ==========================================

    /**
     * Sleep that can be aborted
     */
    private abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (signal?.aborted) {
                reject(createCancelledError('Sleep aborted'));
                return;
            }

            const timeoutId = setTimeout(resolve, ms);

            if (signal) {
                const onAbort = () => {
                    clearTimeout(timeoutId);
                    reject(createCancelledError('Sleep aborted'));
                };
                signal.addEventListener('abort', onAbort, { once: true });
                
                // Clean up listener when timeout completes
                const originalResolve = resolve;
                setTimeout(() => {
                    signal.removeEventListener('abort', onAbort);
                }, ms);
            }
        });
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
