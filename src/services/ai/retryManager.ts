/**
 * RetryManager - Intelligent Retry Logic with Scheduler Integration
 * 
 * Key design principles:
 * - Every retry attempt MUST go through the scheduler (for rate limiting/concurrency)
 * - Different error categories have different retry behaviors
 * - RETRYABLE_PARSE errors can trigger repair mode on subsequent attempts
 * - Backoff happens at scheduler queue level, not by holding slots
 */

import { AIProviderType } from './types';
import { 
    LLMError, 
    ErrorCategory, 
    wrapError, 
    isRetryable,
    CATEGORY_FLAGS,
    WrapErrorContext
} from './errors';
import { UnifiedScheduler, TaskResult, getScheduler } from './scheduler';

// ==========================================
// TYPES
// ==========================================

/**
 * Retry configuration
 */
export interface RetryConfig {
    /** Max retry attempts for transient errors (429/5xx/network) */
    maxTransientRetries: number;
    /** Max retry attempts for parse errors */
    maxParseRetries: number;
    /** Base delay for exponential backoff (ms) */
    baseDelayMs: number;
    /** Max delay cap (ms) */
    maxDelayMs: number;
    /** Jitter factor (0-1) */
    jitterFactor: number;
    /** Whether to enable repair mode for parse failures */
    enableParseRepair: boolean;
}

/**
 * Context passed to the execute function
 */
export interface RetryContext {
    /** Current attempt number (1-based, incremented BEFORE API call) */
    attemptNumber: number;
    /** Total attempts so far (same as attemptNumber) */
    totalAttempts: number;
    /** Whether this is a parse retry with repair mode enabled */
    repairMode: boolean;
    /** Previous error if this is a retry */
    previousError?: LLMError;
    /** Repair hint to append to system prompt */
    repairHint?: string;
}

/**
 * Result of retry operation
 */
export interface RetryResult<T> {
    success: boolean;
    data?: T;
    error?: LLMError;
    /** Total number of API attempts made */
    totalAttempts: number;
    /** All errors encountered during retries */
    attemptErrors: LLMError[];
    /** Whether operation was cancelled */
    cancelled: boolean;
    /** Whether final failure was due to timeout */
    timedOut: boolean;
    /** Total time spent in retries (ms) */
    totalRetryTimeMs: number;
}

/**
 * Options for withRetry
 */
export interface WithRetryOptions {
    provider: AIProviderType;
    /** Model name for error context */
    model?: string;
    /** Timeout per attempt (ms) */
    timeoutMs?: number;
    /** External abort signal */
    signal?: AbortSignal;
    /** Custom retry config (merged with defaults) */
    retryConfig?: Partial<RetryConfig>;
    /** Task ID for debugging */
    taskId?: string;
    /** Callback after each attempt (for circuit breaker integration) */
    onAttemptComplete?: (error: LLMError | null, attemptNumber: number) => void;
}

// ==========================================
// DEFAULT CONFIG
// ==========================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxTransientRetries: 3,
    maxParseRetries: 2,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterFactor: 0.2,
    enableParseRepair: true
};

// ==========================================
// REPAIR HINTS
// ==========================================

/**
 * Repair hints for different parse failure scenarios
 */
const PARSE_REPAIR_HINTS = {
    truncated: `
CRITICAL: Your previous response was truncated/incomplete.
- Reduce output length significantly
- Ensure JSON is complete and valid
- Close all brackets and braces properly`,
    
    malformed: `
CRITICAL: Your previous response had invalid JSON.
- Output ONLY valid JSON, no markdown
- No trailing commas
- Ensure all strings are properly quoted
- Check array/object syntax`,

    generic: `
CRITICAL: Previous response failed to parse.
- Output clean, valid JSON only
- No explanatory text before or after
- Ensure complete structure`
};

/**
 * Determine appropriate repair hint based on error
 */
function getRepairHint(error: LLMError): string {
    const msg = error.message.toLowerCase();
    
    if (msg.includes('truncat') || msg.includes('incomplete') || msg.includes('unexpected end')) {
        return PARSE_REPAIR_HINTS.truncated;
    }
    if (msg.includes('unexpected token') || msg.includes('syntax')) {
        return PARSE_REPAIR_HINTS.malformed;
    }
    return PARSE_REPAIR_HINTS.generic;
}

// ==========================================
// RETRY DECISION MATRIX
// ==========================================

interface RetryDecision {
    shouldRetry: boolean;
    reason: string;
    delayMs: number;
    useRepairMode: boolean;
}

/**
 * Decide whether to retry based on error category and attempt count
 */
function makeRetryDecision(
    error: LLMError,
    attemptNumber: number,
    parseAttempts: number,
    config: RetryConfig
): RetryDecision {
    const flags = CATEGORY_FLAGS[error.category];

    // Non-retryable categories: AUTH, SAFETY, NON_RETRYABLE, CANCELLED, QUOTA
    if (!flags.retryable) {
        return {
            shouldRetry: false,
            reason: `Category ${error.category} is not retryable`,
            delayMs: 0,
            useRepairMode: false
        };
    }

    // RETRYABLE_PARSE: Special handling with repair mode
    if (error.category === 'RETRYABLE_PARSE') {
        if (parseAttempts >= config.maxParseRetries) {
            return {
                shouldRetry: false,
                reason: `Max parse retries (${config.maxParseRetries}) exceeded`,
                delayMs: 0,
                useRepairMode: false
            };
        }
        
        // Second parse attempt uses repair mode
        const useRepair = parseAttempts > 0 && config.enableParseRepair;
        
        return {
            shouldRetry: true,
            reason: 'Parse error - retrying' + (useRepair ? ' with repair mode' : ''),
            delayMs: calculateBackoff(parseAttempts, config),
            useRepairMode: useRepair
        };
    }

    // RETRYABLE_TRANSIENT, TIMEOUT: Standard exponential backoff
    if (error.category === 'RETRYABLE_TRANSIENT' || error.category === 'TIMEOUT') {
        if (attemptNumber >= config.maxTransientRetries) {
            return {
                shouldRetry: false,
                reason: `Max transient retries (${config.maxTransientRetries}) exceeded`,
                delayMs: 0,
                useRepairMode: false
            };
        }

        // Respect Retry-After header if present
        let delayMs = error.retryAfterMs || calculateBackoff(attemptNumber, config);
        
        return {
            shouldRetry: true,
            reason: `Transient error - retrying after ${delayMs}ms`,
            delayMs,
            useRepairMode: false
        };
    }

    // Default: don't retry unknown categories
    return {
        shouldRetry: false,
        reason: `Unknown category ${error.category}`,
        delayMs: 0,
        useRepairMode: false
    };
}

/**
 * Calculate exponential backoff with jitter
 */
function calculateBackoff(attempt: number, config: RetryConfig): number {
    // Exponential: baseDelay * 2^attempt
    let delay = config.baseDelayMs * Math.pow(2, attempt);
    
    // Cap at max
    delay = Math.min(delay, config.maxDelayMs);
    
    // Add jitter: delay * (1 ± jitterFactor)
    const jitter = delay * config.jitterFactor * (Math.random() * 2 - 1);
    delay = Math.max(0, delay + jitter);
    
    return Math.round(delay);
}

// ==========================================
// RETRY MANAGER CLASS
// ==========================================

export class RetryManager {
    private scheduler: UnifiedScheduler;
    private defaultConfig: RetryConfig;

    constructor(
        scheduler?: UnifiedScheduler,
        defaultConfig?: Partial<RetryConfig>
    ) {
        this.scheduler = scheduler || getScheduler();
        this.defaultConfig = { ...DEFAULT_RETRY_CONFIG, ...defaultConfig };
    }

    /**
     * Execute a function with retry logic.
     * 
     * IMPORTANT: Every attempt goes through the scheduler for proper
     * rate limiting and concurrency control. The retry loop does NOT
     * hold concurrency slots during backoff wait.
     * 
     * @param execute - Function to execute. Receives RetryContext and AbortSignal.
     * @param options - Retry options
     * @returns RetryResult with outcome and attempt statistics
     */
    async withRetry<T>(
        execute: (context: RetryContext, signal: AbortSignal) => Promise<T>,
        options: WithRetryOptions
    ): Promise<RetryResult<T>> {
        const config = { ...this.defaultConfig, ...options.retryConfig };
        const startTime = Date.now();
        
        let attemptNumber = 0;
        let parseAttempts = 0;
        const attemptErrors: LLMError[] = [];
        let repairMode = false;
        let repairHint: string | undefined;
        let previousError: LLMError | undefined;

        // Build error context for this retry session
        const errorContext: WrapErrorContext = {
            provider: options.provider,
            model: options.model
        };

        // Check for abort before starting
        if (options.signal?.aborted) {
            const cancelError = wrapError(
                new DOMException('Operation cancelled', 'AbortError'),
                errorContext
            );
            return {
                success: false,
                error: cancelError,
                totalAttempts: 0,
                attemptErrors: [],
                cancelled: true,
                timedOut: false,
                totalRetryTimeMs: 0
            };
        }

        while (true) {
            // Increment attempt BEFORE making the API call
            attemptNumber++;
            
            const context: RetryContext = {
                attemptNumber,
                totalAttempts: attemptNumber,
                repairMode,
                previousError,
                repairHint
            };

            // Execute through scheduler (handles rate limit, slot, timeout)
            const taskResult = await this.scheduler.schedule<T>(
                async (signal) => {
                    return execute(context, signal);
                },
                {
                    provider: options.provider,
                    timeoutMs: options.timeoutMs,
                    signal: options.signal,
                    taskId: options.taskId ? `${options.taskId}-attempt-${attemptNumber}` : undefined
                }
            );

            // Success!
            if (taskResult.success) {
                // Notify callback (for circuit breaker)
                if (options.onAttemptComplete) {
                    options.onAttemptComplete(null, attemptNumber);
                }
                
                return {
                    success: true,
                    data: taskResult.data,
                    totalAttempts: attemptNumber,
                    attemptErrors,
                    cancelled: false,
                    timedOut: false,
                    totalRetryTimeMs: Date.now() - startTime
                };
            }

            // Handle failure - classify error here using wrapError()
            // Scheduler only marks TIMEOUT/CANCELLED, we classify everything else
            const error = taskResult.error 
                ? wrapError(taskResult.error, errorContext)
                : wrapError(new Error('Unknown error'), errorContext);
            attemptErrors.push(error);
            
            // Notify callback (for circuit breaker)
            if (options.onAttemptComplete) {
                options.onAttemptComplete(error, attemptNumber);
            }

            // Track parse attempts separately
            if (error.category === 'RETRYABLE_PARSE') {
                parseAttempts++;
            }

            // Cancelled by user
            if (taskResult.cancelled) {
                return {
                    success: false,
                    error,
                    totalAttempts: attemptNumber,
                    attemptErrors,
                    cancelled: true,
                    timedOut: false,
                    totalRetryTimeMs: Date.now() - startTime
                };
            }

            // Make retry decision
            const decision = makeRetryDecision(error, attemptNumber, parseAttempts, config);

            if (!decision.shouldRetry) {
                return {
                    success: false,
                    error,
                    totalAttempts: attemptNumber,
                    attemptErrors,
                    cancelled: false,
                    timedOut: taskResult.timedOut,
                    totalRetryTimeMs: Date.now() - startTime
                };
            }

            // Prepare for retry
            console.log(
                `[RetryManager] ${decision.reason} (attempt ${attemptNumber}/${config.maxTransientRetries})`
            );

            previousError = error;
            repairMode = decision.useRepairMode;
            if (repairMode) {
                repairHint = getRepairHint(error);
            }

            // Wait before retry (outside of scheduler - doesn't hold slot)
            if (decision.delayMs > 0) {
                try {
                    await this.abortableSleep(decision.delayMs, options.signal);
                } catch (e) {
                    // Aborted during sleep
                    const cancelError = wrapError(
                        new DOMException('Operation cancelled during retry delay', 'AbortError'),
                        errorContext
                    );
                    return {
                        success: false,
                        error: cancelError,
                        totalAttempts: attemptNumber,
                        attemptErrors,
                        cancelled: true,
                        timedOut: false,
                        totalRetryTimeMs: Date.now() - startTime
                    };
                }
            }

            // Loop continues with next attempt through scheduler
        }
    }

    /**
     * Sleep that can be aborted
     */
    private abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (signal?.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
            }

            const timeoutId = setTimeout(resolve, ms);

            if (signal) {
                const onAbort = () => {
                    clearTimeout(timeoutId);
                    reject(new DOMException('Aborted', 'AbortError'));
                };
                signal.addEventListener('abort', onAbort, { once: true });
            }
        });
    }
}

// ==========================================
// SINGLETON & FACTORY
// ==========================================

let retryManagerInstance: RetryManager | null = null;

/**
 * Get the global RetryManager instance
 */
export function getRetryManager(
    scheduler?: UnifiedScheduler,
    config?: Partial<RetryConfig>
): RetryManager {
    if (!retryManagerInstance) {
        retryManagerInstance = new RetryManager(scheduler, config);
    }
    return retryManagerInstance;
}

/**
 * Reset the global RetryManager instance
 */
export function resetRetryManager(): void {
    retryManagerInstance = null;
}

/**
 * Create a new RetryManager instance
 */
export function createRetryManager(
    scheduler?: UnifiedScheduler,
    config?: Partial<RetryConfig>
): RetryManager {
    return new RetryManager(scheduler, config);
}
