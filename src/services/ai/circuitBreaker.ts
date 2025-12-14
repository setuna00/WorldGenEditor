/**
 * CircuitBreaker - Time-bucket Sliding Window Circuit Breaker
 * 
 * Prevents cascading failures by temporarily stopping requests to unhealthy providers.
 * 
 * Key features:
 * - Time-bucket sliding window for failure tracking
 * - Records outcomes per API attempt (not per retry round)
 * - Only counts errors with countsForCircuitBreaker=true
 * - HALF_OPEN state with limited probe calls
 * 
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit tripped, requests are rejected immediately
 * - HALF_OPEN: Testing recovery, limited requests allowed
 */

import { LLMError, countsForCircuitBreaker, makeProviderKey } from './errors';

// ==========================================
// TYPES
// ==========================================

/**
 * Circuit breaker states
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    /** Number of time buckets in the sliding window */
    bucketCount: number;
    /** Duration of each bucket in ms */
    bucketDurationMs: number;
    /** Failure threshold to trip the circuit (failures / total in window) */
    failureThreshold: number;
    /** Minimum requests in window before threshold is evaluated */
    minimumRequests: number;
    /** Duration to stay in OPEN state before trying HALF_OPEN (ms) */
    cooldownMs: number;
    /** Max concurrent probe calls in HALF_OPEN state */
    halfOpenMaxCalls: number;
    /** Required success count in HALF_OPEN to close circuit */
    halfOpenSuccessThreshold: number;
}

/**
 * Statistics for a circuit
 */
export interface CircuitStats {
    state: CircuitState;
    failures: number;
    successes: number;
    total: number;
    failureRate: number;
    lastFailureTime?: number;
    openedAt?: number;
    halfOpenCalls: number;
    halfOpenSuccesses: number;
}

/**
 * Time bucket for sliding window
 */
interface TimeBucket {
    startTime: number;
    failures: number;
    successes: number;
}

/**
 * Per-key circuit state
 */
interface CircuitData {
    state: CircuitState;
    buckets: TimeBucket[];
    openedAt?: number;
    lastFailureTime?: number;
    halfOpenCalls: number;
    halfOpenSuccesses: number;
}

// ==========================================
// DEFAULT CONFIG
// ==========================================

const DEFAULT_CONFIG: CircuitBreakerConfig = {
    bucketCount: 10,
    bucketDurationMs: 6000,  // 10 buckets * 6s = 60s window
    failureThreshold: 0.5,   // 50% failure rate
    minimumRequests: 5,
    cooldownMs: 30000,       // 30s cooldown before HALF_OPEN
    halfOpenMaxCalls: 3,
    halfOpenSuccessThreshold: 2
};

// ==========================================
// CIRCUIT BREAKER CLASS
// ==========================================

export class CircuitBreaker {
    private config: CircuitBreakerConfig;
    private circuits: Map<string, CircuitData> = new Map();

    constructor(config?: Partial<CircuitBreakerConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    /**
     * Check if a request should be allowed through.
     * 
     * @param key - Circuit key (typically provider:model)
     * @returns true if request should proceed, false if circuit is OPEN
     */
    canExecute(key: string): boolean {
        const circuit = this.getOrCreateCircuit(key);
        this.maybeTransitionState(key, circuit);

        switch (circuit.state) {
            case 'CLOSED':
                return true;
            
            case 'OPEN':
                return false;
            
            case 'HALF_OPEN':
                // Allow limited probe calls
                if (circuit.halfOpenCalls < this.config.halfOpenMaxCalls) {
                    circuit.halfOpenCalls++;
                    return true;
                }
                return false;
            
            default:
                return true;
        }
    }

    /**
     * Record the outcome of an API attempt.
     * This should be called after EVERY real API call (including retries).
     * 
     * @param key - Circuit key
     * @param error - Error if failed, null if succeeded
     */
    recordOutcome(key: string, error: LLMError | null): void {
        const circuit = this.getOrCreateCircuit(key);
        
        // Only count errors that are marked for circuit breaker
        const isFailure = error !== null && countsForCircuitBreaker(error);
        
        // Record in current bucket
        const now = Date.now();
        const currentBucket = this.getCurrentBucket(circuit, now);
        
        if (isFailure) {
            currentBucket.failures++;
            circuit.lastFailureTime = now;
        } else {
            currentBucket.successes++;
        }

        // Handle HALF_OPEN state transitions
        if (circuit.state === 'HALF_OPEN') {
            if (isFailure) {
                // Failed probe - back to OPEN
                this.transitionToOpen(key, circuit);
            } else {
                circuit.halfOpenSuccesses++;
                
                // Check if we've hit success threshold
                if (circuit.halfOpenSuccesses >= this.config.halfOpenSuccessThreshold) {
                    this.transitionToClosed(key, circuit);
                }
            }
            return;
        }

        // Check if we should trip the circuit (only in CLOSED state)
        if (circuit.state === 'CLOSED') {
            this.maybeTrip(key, circuit);
        }
    }

    /**
     * Get current statistics for a circuit
     */
    getStats(key: string): CircuitStats {
        const circuit = this.getOrCreateCircuit(key);
        this.maybeTransitionState(key, circuit);
        this.pruneOldBuckets(circuit, Date.now());

        const { failures, successes } = this.aggregateBuckets(circuit);
        const total = failures + successes;

        return {
            state: circuit.state,
            failures,
            successes,
            total,
            failureRate: total > 0 ? failures / total : 0,
            lastFailureTime: circuit.lastFailureTime,
            openedAt: circuit.openedAt,
            halfOpenCalls: circuit.halfOpenCalls,
            halfOpenSuccesses: circuit.halfOpenSuccesses
        };
    }

    /**
     * Get all circuit keys and their states
     */
    getAllStats(): Record<string, CircuitStats> {
        const result: Record<string, CircuitStats> = {};
        for (const key of this.circuits.keys()) {
            result[key] = this.getStats(key);
        }
        return result;
    }

    /**
     * Manually reset a circuit to CLOSED state
     */
    reset(key: string): void {
        const circuit = this.getOrCreateCircuit(key);
        circuit.state = 'CLOSED';
        circuit.buckets = [];
        circuit.openedAt = undefined;
        circuit.lastFailureTime = undefined;
        circuit.halfOpenCalls = 0;
        circuit.halfOpenSuccesses = 0;
    }

    /**
     * Reset all circuits
     */
    resetAll(): void {
        this.circuits.clear();
    }

    // ==========================================
    // PRIVATE: STATE MANAGEMENT
    // ==========================================

    /**
     * Get or create circuit data for a key
     */
    private getOrCreateCircuit(key: string): CircuitData {
        if (!this.circuits.has(key)) {
            this.circuits.set(key, {
                state: 'CLOSED',
                buckets: [],
                halfOpenCalls: 0,
                halfOpenSuccesses: 0
            });
        }
        return this.circuits.get(key)!;
    }

    /**
     * Check if state should transition (e.g., OPEN -> HALF_OPEN after cooldown)
     */
    private maybeTransitionState(key: string, circuit: CircuitData): void {
        if (circuit.state === 'OPEN' && circuit.openedAt) {
            const elapsed = Date.now() - circuit.openedAt;
            if (elapsed >= this.config.cooldownMs) {
                this.transitionToHalfOpen(key, circuit);
            }
        }
    }

    /**
     * Check if circuit should trip (CLOSED -> OPEN)
     */
    private maybeTrip(key: string, circuit: CircuitData): void {
        const now = Date.now();
        this.pruneOldBuckets(circuit, now);

        const { failures, successes } = this.aggregateBuckets(circuit);
        const total = failures + successes;

        // Don't evaluate if below minimum requests
        if (total < this.config.minimumRequests) {
            return;
        }

        const failureRate = failures / total;
        if (failureRate >= this.config.failureThreshold) {
            this.transitionToOpen(key, circuit);
        }
    }

    /**
     * Transition to OPEN state
     */
    private transitionToOpen(key: string, circuit: CircuitData): void {
        console.log(`[CircuitBreaker] ${key}: OPEN (failures exceeded threshold)`);
        circuit.state = 'OPEN';
        circuit.openedAt = Date.now();
        circuit.halfOpenCalls = 0;
        circuit.halfOpenSuccesses = 0;
    }

    /**
     * Transition to HALF_OPEN state
     */
    private transitionToHalfOpen(key: string, circuit: CircuitData): void {
        console.log(`[CircuitBreaker] ${key}: HALF_OPEN (cooldown elapsed, testing recovery)`);
        circuit.state = 'HALF_OPEN';
        circuit.halfOpenCalls = 0;
        circuit.halfOpenSuccesses = 0;
    }

    /**
     * Transition to CLOSED state
     */
    private transitionToClosed(key: string, circuit: CircuitData): void {
        console.log(`[CircuitBreaker] ${key}: CLOSED (recovery confirmed)`);
        circuit.state = 'CLOSED';
        circuit.buckets = [];  // Clear history on recovery
        circuit.openedAt = undefined;
        circuit.halfOpenCalls = 0;
        circuit.halfOpenSuccesses = 0;
    }

    // ==========================================
    // PRIVATE: TIME BUCKET MANAGEMENT
    // ==========================================

    /**
     * Get or create the current time bucket
     */
    private getCurrentBucket(circuit: CircuitData, now: number): TimeBucket {
        const bucketStart = this.getBucketStartTime(now);
        
        // Check if we already have this bucket
        let bucket = circuit.buckets.find(b => b.startTime === bucketStart);
        if (!bucket) {
            bucket = {
                startTime: bucketStart,
                failures: 0,
                successes: 0
            };
            circuit.buckets.push(bucket);
            
            // Prune while adding new bucket
            this.pruneOldBuckets(circuit, now);
        }
        
        return bucket;
    }

    /**
     * Calculate bucket start time
     */
    private getBucketStartTime(timestamp: number): number {
        return Math.floor(timestamp / this.config.bucketDurationMs) * this.config.bucketDurationMs;
    }

    /**
     * Remove buckets outside the sliding window
     */
    private pruneOldBuckets(circuit: CircuitData, now: number): void {
        const windowStart = now - (this.config.bucketCount * this.config.bucketDurationMs);
        circuit.buckets = circuit.buckets.filter(b => b.startTime >= windowStart);
    }

    /**
     * Aggregate failures and successes across all buckets
     */
    private aggregateBuckets(circuit: CircuitData): { failures: number; successes: number } {
        let failures = 0;
        let successes = 0;
        
        for (const bucket of circuit.buckets) {
            failures += bucket.failures;
            successes += bucket.successes;
        }
        
        return { failures, successes };
    }
}

// ==========================================
// SINGLETON & FACTORY
// ==========================================

let circuitBreakerInstance: CircuitBreaker | null = null;

/**
 * Get the global CircuitBreaker instance
 */
export function getCircuitBreaker(config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!circuitBreakerInstance) {
        circuitBreakerInstance = new CircuitBreaker(config);
    }
    return circuitBreakerInstance;
}

/**
 * Reset the global CircuitBreaker instance
 */
export function resetCircuitBreaker(): void {
    if (circuitBreakerInstance) {
        circuitBreakerInstance.resetAll();
    }
    circuitBreakerInstance = null;
}

/**
 * Create a new CircuitBreaker instance
 */
export function createCircuitBreaker(config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    return new CircuitBreaker(config);
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Create a circuit key from provider and model.
 * Uses the unified makeProviderKey format: "provider:model"
 * 
 * @param provider - Provider name (e.g., 'openai')
 * @param model - Model name (e.g., 'gpt-4o-mini')
 * @returns Unified key in format "provider:model"
 */
export function makeCircuitKey(provider: string, model?: string): string {
    return makeProviderKey(provider, model);
}
