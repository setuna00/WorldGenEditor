/**
 * AI Provider Rate Limiter
 * 
 * Sliding window rate limiter that can be shared across
 * different AI provider implementations.
 */

export interface RateLimiterConfig {
    maxRequests: number;
    windowMs: number;
    safetyBufferMs?: number;
}

export class RateLimiter {
    private requestHistory: number[] = [];
    private readonly maxRequests: number;
    private readonly windowMs: number;
    private readonly safetyBufferMs: number;
    private readonly name: string;

    constructor(name: string, config: RateLimiterConfig) {
        this.name = name;
        this.maxRequests = config.maxRequests;
        this.windowMs = config.windowMs;
        this.safetyBufferMs = config.safetyBufferMs ?? 3000;
    }

    /**
     * Enforce rate limit before making a request.
     * Will wait if necessary to avoid hitting the limit.
     */
    async enforce(): Promise<void> {
        const now = Date.now();
        
        // 1. Prune history: Remove requests older than the window
        this.requestHistory = this.requestHistory.filter(
            timestamp => now - timestamp < this.windowMs
        );

        // 2. Check capacity
        if (this.requestHistory.length >= this.maxRequests) {
            // Find the oldest request in the current window
            const oldestRequestTime = this.requestHistory[0];
            
            // Calculate when this request will expire from the window
            const expiryTime = oldestRequestTime + this.windowMs;
            
            // Exact wait time required + safety buffer
            const waitTime = Math.max(0, expiryTime - now + this.safetyBufferMs);

            if (waitTime > 0) {
                console.log(
                    `[${this.name} Rate Limiter] Quota hit (${this.requestHistory.length}/${this.maxRequests}). ` +
                    `Waiting ${Math.ceil(waitTime)}ms...`
                );
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        // 3. Register the new request
        this.requestHistory.push(Date.now());
    }

    /**
     * Get current usage stats
     */
    getStats(): { current: number; max: number; windowMs: number } {
        const now = Date.now();
        this.requestHistory = this.requestHistory.filter(
            timestamp => now - timestamp < this.windowMs
        );
        
        return {
            current: this.requestHistory.length,
            max: this.maxRequests,
            windowMs: this.windowMs
        };
    }

    /**
     * Reset the rate limiter (useful for testing or config changes)
     */
    reset(): void {
        this.requestHistory = [];
    }
}

// ==========================================
// SINGLETON INSTANCES PER PROVIDER
// ==========================================

const limiters = new Map<string, RateLimiter>();

export function getRateLimiter(
    providerName: string, 
    config: RateLimiterConfig
): RateLimiter {
    const key = `${providerName}-${config.maxRequests}-${config.windowMs}`;
    
    if (!limiters.has(key)) {
        limiters.set(key, new RateLimiter(providerName, config));
    }
    
    return limiters.get(key)!;
}

export function resetAllLimiters(): void {
    limiters.forEach(limiter => limiter.reset());
}

