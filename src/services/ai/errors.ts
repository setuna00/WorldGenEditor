/**
 * AI Provider Unified Error Classification System
 * 
 * Provides structured error categorization for LLM API calls with
 * flags for retry logic, fallback behavior, and circuit breaker integration.
 */

// ==========================================
// ERROR CATEGORIES
// ==========================================

/**
 * Error category classification for LLM API errors.
 * Each category has specific behavior for retry/fallback/circuit-breaker.
 */
export type ErrorCategory =
    | 'AUTH'                // Authentication/authorization failures
    | 'SAFETY'              // Content safety/policy violations
    | 'NON_RETRYABLE'       // Other permanent failures (invalid model, bad request format)
    | 'QUOTA'               // Quota/billing exhausted
    | 'RETRYABLE_TRANSIENT' // 429/5xx/network errors - temporary issues
    | 'RETRYABLE_PARSE'     // JSON parse/truncation errors - can repair
    | 'TIMEOUT'             // Request timeout
    | 'CANCELLED';          // User-initiated abort

/**
 * Behavior flags derived from error category.
 */
export interface ErrorFlags {
    /** Whether this error type is safe to retry */
    retryable: boolean;
    /** Whether fallback to another provider is allowed */
    fallbackAllowed: boolean;
    /** Whether this error should count towards circuit breaker threshold */
    countsForCircuitBreaker: boolean;
}

/**
 * Error category to flags mapping.
 */
export const CATEGORY_FLAGS: Record<ErrorCategory, ErrorFlags> = {
    AUTH: {
        retryable: false,
        fallbackAllowed: false,      // Auth issue likely affects all providers with same key
        countsForCircuitBreaker: false
    },
    SAFETY: {
        retryable: false,
        fallbackAllowed: false,      // Content policy issue - retrying won't help
        countsForCircuitBreaker: false
    },
    NON_RETRYABLE: {
        retryable: false,
        fallbackAllowed: false,      // Bad request - need to fix input
        countsForCircuitBreaker: false
    },
    QUOTA: {
        retryable: false,
        fallbackAllowed: true,       // Can try another provider without quota issues
        countsForCircuitBreaker: false
    },
    RETRYABLE_TRANSIENT: {
        retryable: true,
        fallbackAllowed: true,
        countsForCircuitBreaker: true
    },
    RETRYABLE_PARSE: {
        retryable: true,             // Gentle retry with possible repair
        fallbackAllowed: true,
        countsForCircuitBreaker: false  // Parse errors are often random, don't trigger breaker
    },
    TIMEOUT: {
        retryable: true,
        fallbackAllowed: true,
        countsForCircuitBreaker: true
    },
    CANCELLED: {
        retryable: false,            // User cancelled - don't retry
        fallbackAllowed: false,      // User cancelled - don't fallback
        countsForCircuitBreaker: false
    }
};

// ==========================================
// LLM ERROR CLASS
// ==========================================

/**
 * Options for LLMError constructor
 */
export interface LLMErrorOptions {
    cause?: Error;
    provider?: string;
    model?: string;
    stage?: string;
    statusCode?: number;
    rawResponse?: unknown;
    retryAfterMs?: number;
}

/**
 * Unified error class for all LLM-related errors.
 * Provides structured information for retry and fallback decisions.
 * 
 * IMPORTANT: All LLMErrors should have provider, model, and stage populated.
 * The orchestrator's wrapError ensures these are injected if missing.
 */
export class LLMError extends Error {
    /** Error category for behavior decisions */
    readonly category: ErrorCategory;
    /** Behavior flags derived from category */
    readonly flags: ErrorFlags;
    /** Original error that caused this LLM error */
    readonly cause?: Error;
    /** Provider that generated this error (e.g., 'openai', 'gemini') */
    readonly provider?: string;
    /** Model that generated this error (e.g., 'gpt-4o-mini') */
    readonly model?: string;
    /** Generation stage where error occurred (e.g., 'batch', 'structured') */
    readonly stage?: string;
    /** HTTP status code if applicable */
    readonly statusCode?: number;
    /** Raw error response from API */
    readonly rawResponse?: unknown;
    /** Suggested retry delay in ms (e.g., from Retry-After header) */
    readonly retryAfterMs?: number;

    constructor(
        message: string,
        category: ErrorCategory,
        options?: LLMErrorOptions
    ) {
        super(message);
        this.name = 'LLMError';
        this.category = category;
        this.flags = CATEGORY_FLAGS[category];
        this.cause = options?.cause;
        this.provider = options?.provider;
        this.model = options?.model;
        this.stage = options?.stage;
        this.statusCode = options?.statusCode;
        this.rawResponse = options?.rawResponse;
        this.retryAfterMs = options?.retryAfterMs;

        // Maintains proper stack trace for where error was thrown
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, LLMError);
        }
    }

    /**
     * Get the unified provider key in format "provider:model"
     * Returns just provider if model is not set, or 'unknown' if neither is set.
     */
    get providerKey(): string {
        return makeProviderKey(this.provider, this.model);
    }

    /**
     * Create a human-readable summary of the error
     */
    toSummary(): string {
        const parts = [
            `[${this.category}]`,
            this.message,
            this.providerKey !== 'unknown' ? `(${this.providerKey})` : '',
            this.stage ? `[stage: ${this.stage}]` : '',
            this.statusCode ? `(status: ${this.statusCode})` : ''
        ].filter(Boolean);
        return parts.join(' ');
    }
}

// ==========================================
// ERROR CLASSIFICATION LOGIC
// ==========================================

/**
 * Known error patterns for different providers and error types.
 */
interface ErrorPattern {
    /** Test function or regex pattern */
    test: (error: Error, statusCode?: number, body?: string) => boolean;
    /** Category to assign if matched */
    category: ErrorCategory;
}

/**
 * Error classification patterns ordered by specificity.
 * More specific patterns should come first.
 */
const ERROR_PATTERNS: ErrorPattern[] = [
    // === CANCELLED (Check first - AbortError is most specific) ===
    {
        test: (error) => {
            return error.name === 'AbortError' || 
                   (error as any).code === 'ABORT_ERR' ||
                   error.message.includes('aborted') ||
                   error.message.includes('cancelled') ||
                   error.message.includes('canceled');
        },
        category: 'CANCELLED'
    },

    // === AUTH ERRORS ===
    {
        test: (error, statusCode) => {
            if (statusCode === 401 || statusCode === 403) return true;
            const msg = error.message.toLowerCase();
            return msg.includes('api key') ||
                   msg.includes('invalid key') ||
                   msg.includes('unauthorized') ||
                   msg.includes('authentication') ||
                   msg.includes('permission denied') ||
                   msg.includes('invalid_api_key');
        },
        category: 'AUTH'
    },

    // === SAFETY/CONTENT POLICY ===
    {
        test: (error, _, body) => {
            const msg = error.message.toLowerCase();
            const bodyLower = body?.toLowerCase() || '';
            return msg.includes('content policy') ||
                   msg.includes('safety') ||
                   msg.includes('blocked') ||
                   msg.includes('harmful') ||
                   msg.includes('content_filter') ||
                   bodyLower.includes('finish_reason":"content_filter') ||
                   bodyLower.includes('blocked_prompt') ||
                   bodyLower.includes('recitation');
        },
        category: 'SAFETY'
    },

    // === QUOTA/BILLING ===
    {
        test: (error, statusCode, body) => {
            const msg = error.message.toLowerCase();
            const bodyLower = body?.toLowerCase() || '';
            // Note: 429 is rate limit, not quota - handled separately
            return msg.includes('quota') ||
                   msg.includes('billing') ||
                   msg.includes('insufficient_funds') ||
                   msg.includes('payment') ||
                   msg.includes('exceeded your current quota') ||
                   bodyLower.includes('quota_exceeded') ||
                   bodyLower.includes('billing_hard_limit');
        },
        category: 'QUOTA'
    },

    // === TIMEOUT ===
    {
        test: (error, statusCode) => {
            if (statusCode === 408 || statusCode === 504) return true;
            const msg = error.message.toLowerCase();
            return msg.includes('timeout') ||
                   msg.includes('timed out') ||
                   msg.includes('etimedout') ||
                   msg.includes('econnaborted');
        },
        category: 'TIMEOUT'
    },

    // === RETRYABLE TRANSIENT (429, 5xx, network) ===
    {
        test: (error, statusCode) => {
            // Rate limit
            if (statusCode === 429) return true;
            // Server errors
            if (statusCode && statusCode >= 500 && statusCode < 600) return true;
            
            const msg = error.message.toLowerCase();
            return msg.includes('rate limit') ||
                   msg.includes('too many requests') ||
                   msg.includes('overloaded') ||
                   msg.includes('capacity') ||
                   msg.includes('temporarily unavailable') ||
                   msg.includes('service unavailable') ||
                   msg.includes('econnreset') ||
                   msg.includes('econnrefused') ||
                   msg.includes('enetunreach') ||
                   msg.includes('socket hang up') ||
                   msg.includes('network error') ||
                   msg.includes('fetch failed');
        },
        category: 'RETRYABLE_TRANSIENT'
    },

    // === PARSE ERRORS ===
    {
        test: (error) => {
            const msg = error.message.toLowerCase();
            return error.name === 'SyntaxError' ||
                   msg.includes('json') ||
                   msg.includes('parse') ||
                   msg.includes('unexpected token') ||
                   msg.includes('unexpected end') ||
                   msg.includes('truncated') ||
                   msg.includes('incomplete');
        },
        category: 'RETRYABLE_PARSE'
    },

    // === NON-RETRYABLE (400 Bad Request, invalid model, etc.) ===
    {
        test: (error, statusCode) => {
            if (statusCode === 400 || statusCode === 404) return true;
            const msg = error.message.toLowerCase();
            return msg.includes('invalid model') ||
                   msg.includes('model not found') ||
                   msg.includes('invalid request') ||
                   msg.includes('bad request') ||
                   msg.includes('invalid parameter');
        },
        category: 'NON_RETRYABLE'
    }
];

/**
 * Classify an error into an ErrorCategory.
 * 
 * @param error - The error to classify
 * @param statusCode - HTTP status code if available
 * @param rawBody - Raw response body if available
 * @returns The error category
 */
export function classifyError(
    error: Error,
    statusCode?: number,
    rawBody?: string
): ErrorCategory {
    for (const pattern of ERROR_PATTERNS) {
        if (pattern.test(error, statusCode, rawBody)) {
            return pattern.category;
        }
    }
    
    // Default: treat unknown errors as transient (safer to retry)
    return 'RETRYABLE_TRANSIENT';
}

/**
 * Extract status code from various error shapes.
 */
export function extractStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    
    const err = error as any;
    
    // Direct status property
    if (typeof err.status === 'number') return err.status;
    if (typeof err.statusCode === 'number') return err.statusCode;
    
    // Nested in response
    if (err.response?.status) return err.response.status;
    if (err.response?.statusCode) return err.response.statusCode;
    
    // OpenAI SDK format
    if (err.error?.status) return err.error.status;
    
    return undefined;
}

/**
 * Extract raw response body from various error shapes.
 */
export function extractRawBody(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined;
    
    const err = error as any;
    
    if (typeof err.body === 'string') return err.body;
    if (typeof err.response?.body === 'string') return err.response.body;
    if (typeof err.response?.data === 'string') return err.response.data;
    if (err.response?.data && typeof err.response.data === 'object') {
        return JSON.stringify(err.response.data);
    }
    
    return undefined;
}

/**
 * Extract retry-after delay from error or response headers.
 */
export function extractRetryAfter(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    
    const err = error as any;
    
    // Direct retryAfter property
    if (typeof err.retryAfter === 'number') return err.retryAfter * 1000;
    
    // From headers
    const headers = err.headers || err.response?.headers;
    if (headers) {
        const retryAfter = headers['retry-after'] || headers.get?.('retry-after');
        if (retryAfter) {
            const seconds = parseInt(retryAfter, 10);
            if (!isNaN(seconds)) return seconds * 1000;
        }
    }
    
    return undefined;
}

/**
 * Context for error wrapping - used to inject missing fields
 */
export interface WrapErrorContext {
    provider?: string;
    model?: string;
    stage?: string;
}

/**
 * Create a unified provider key in format "provider:model"
 * This is the canonical format used across fallback, circuit breaker, and telemetry.
 * 
 * @param provider - Provider name (e.g., 'openai')
 * @param model - Model name (e.g., 'gpt-4o-mini')
 * @returns Unified key in format "provider:model" or just provider if no model
 */
export function makeProviderKey(provider?: string, model?: string): string {
    if (!provider) return 'unknown';
    if (!model) return provider;
    return `${provider}:${model}`;
}

/**
 * Wrap an unknown error into an LLMError with proper classification.
 * 
 * IMPORTANT: This function ensures context fields (provider, model, stage) are
 * injected into the error. If the error is already an LLMError but missing
 * some context fields, this function will create a new LLMError with the
 * merged context.
 * 
 * @param error - The error to wrap
 * @param context - Context to inject (provider, model, stage)
 * @returns Classified LLMError with complete context
 */
export function wrapError(error: unknown, context?: string | WrapErrorContext): LLMError {
    // Normalize context parameter (backwards compatible with string provider)
    const ctx: WrapErrorContext = typeof context === 'string' 
        ? { provider: context } 
        : (context || {});

    // Already an LLMError - check if we need to merge missing context
    if (error instanceof LLMError) {
        // Check if any context fields are missing and we have them to provide
        const needsMerge = 
            (!error.provider && ctx.provider) ||
            (!error.model && ctx.model) ||
            (!error.stage && ctx.stage);

        if (needsMerge) {
            // Create new LLMError with merged context
            return new LLMError(error.message, error.category, {
                cause: error.cause,
                provider: error.provider || ctx.provider,
                model: error.model || ctx.model,
                stage: error.stage || ctx.stage,
                statusCode: error.statusCode,
                rawResponse: error.rawResponse,
                retryAfterMs: error.retryAfterMs
            });
        }
        return error;
    }
    
    // Convert to Error if needed
    const err = error instanceof Error 
        ? error 
        : new Error(String(error));
    
    const statusCode = extractStatusCode(error);
    const rawBody = extractRawBody(error);
    const retryAfterMs = extractRetryAfter(error);
    const category = classifyError(err, statusCode, rawBody);
    
    return new LLMError(err.message, category, {
        cause: err,
        provider: ctx.provider,
        model: ctx.model,
        stage: ctx.stage,
        statusCode,
        rawResponse: rawBody || error,
        retryAfterMs
    });
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Check if an error is an LLMError of a specific category.
 */
export function isLLMErrorCategory(error: unknown, category: ErrorCategory): error is LLMError {
    return error instanceof LLMError && error.category === category;
}

/**
 * Check if an error is retryable.
 */
export function isRetryable(error: unknown): boolean {
    if (error instanceof LLMError) {
        return error.flags.retryable;
    }
    // Classify unknown error
    const wrapped = wrapError(error);
    return wrapped.flags.retryable;
}

/**
 * Check if fallback to another provider is allowed.
 */
export function isFallbackAllowed(error: unknown): boolean {
    if (error instanceof LLMError) {
        return error.flags.fallbackAllowed;
    }
    const wrapped = wrapError(error);
    return wrapped.flags.fallbackAllowed;
}

/**
 * Check if error counts towards circuit breaker.
 */
export function countsForCircuitBreaker(error: unknown): boolean {
    if (error instanceof LLMError) {
        return error.flags.countsForCircuitBreaker;
    }
    const wrapped = wrapError(error);
    return wrapped.flags.countsForCircuitBreaker;
}

/**
 * Create an AbortError for cancelled operations.
 */
export function createCancelledError(
    message: string = 'Operation cancelled', 
    context?: string | WrapErrorContext
): LLMError {
    const ctx: WrapErrorContext = typeof context === 'string' 
        ? { provider: context } 
        : (context || {});
    return new LLMError(message, 'CANCELLED', ctx);
}

/**
 * Create a TimeoutError.
 */
export function createTimeoutError(
    message: string = 'Request timed out', 
    context?: string | WrapErrorContext
): LLMError {
    const ctx: WrapErrorContext = typeof context === 'string' 
        ? { provider: context } 
        : (context || {});
    return new LLMError(message, 'TIMEOUT', ctx);
}
