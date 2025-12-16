/**
 * AI Service Telemetry Module
 * 
 * Provides observability hooks for LLM operations without requiring
 * OpenTelemetry as a hard dependency. This module can be extended
 * to integrate with OpenTelemetry, DataDog, or other observability platforms.
 * 
 * Design principles:
 * - Zero overhead when no listeners are registered
 * - Type-safe event definitions
 * - Easy integration with OpenTelemetry tracer/meter
 * - Works standalone for simple console/log-based observability
 */

import { AIProviderType } from './types';
import { ErrorCategory } from './errors';

// ==========================================
// TELEMETRY EVENT TYPES
// ==========================================

/**
 * Base interface for all telemetry events
 */
interface BaseTelemetryEvent {
    /** Event timestamp (Unix ms) */
    timestamp: number;
    /** Unique trace ID for correlating events */
    traceId?: string;
}

/**
 * Event fired when an LLM call starts
 */
export interface LLMCallStartEvent extends BaseTelemetryEvent {
    type: 'llm.call.start';
    provider: AIProviderType;
    model: string;
    stage: string;
    taskId?: string;
}

/**
 * Event fired when an LLM call completes (success or failure)
 */
export interface LLMCallEndEvent extends BaseTelemetryEvent {
    type: 'llm.call.end';
    provider: AIProviderType;
    model: string;
    stage: string;
    taskId?: string;
    /** Whether the call succeeded */
    success: boolean;
    /** Error category if failed */
    errorCategory?: ErrorCategory;
    /** Error message if failed */
    errorMessage?: string;
    /** Total duration in ms */
    durationMs: number;
    /** Time waiting for rate limit */
    rateLimitWaitMs: number;
    /** Time waiting for concurrency slot */
    slotWaitMs: number;
    /** Actual API execution time */
    apiDurationMs: number;
    /** Number of retry attempts */
    attempts: number;
    /** Whether fallback was used */
    usedFallback: boolean;
    /** Token count if available */
    tokens?: number;
}

/**
 * Event fired when circuit breaker state changes
 */
export interface CircuitBreakerEvent extends BaseTelemetryEvent {
    type: 'circuit.state_change';
    provider: AIProviderType;
    model?: string;
    previousState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    newState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    reason: string;
    failureRate?: number;
}

/**
 * Event fired when rate limit is hit
 */
export interface RateLimitEvent extends BaseTelemetryEvent {
    type: 'rate_limit.wait';
    provider: AIProviderType;
    waitMs: number;
    currentUsage: number;
    maxUsage: number;
}

/**
 * Union type for all telemetry events
 */
export type TelemetryEvent = 
    | LLMCallStartEvent 
    | LLMCallEndEvent 
    | CircuitBreakerEvent 
    | RateLimitEvent;

// ==========================================
// TELEMETRY LISTENER INTERFACE
// ==========================================

/**
 * Listener interface for telemetry events.
 * Implement this to integrate with your observability platform.
 */
export interface TelemetryListener {
    /** Called for every telemetry event */
    onEvent(event: TelemetryEvent): void;
    
    /** Optional cleanup method */
    dispose?(): void;
}

/**
 * Example listener that logs to console (for development)
 */
export class ConsoleTelemetryListener implements TelemetryListener {
    private verbose: boolean;

    constructor(options?: { verbose?: boolean }) {
        this.verbose = options?.verbose ?? false;
    }

    onEvent(event: TelemetryEvent): void {
        switch (event.type) {
            case 'llm.call.start':
                if (this.verbose) {
                    console.log(`[Telemetry] LLM call started: ${event.provider}/${event.model} [${event.stage}]`);
                }
                break;
                
            case 'llm.call.end':
                const status = event.success ? '✓' : '✗';
                const msg = event.success 
                    ? `${event.durationMs}ms (api: ${event.apiDurationMs}ms, wait: ${event.rateLimitWaitMs + event.slotWaitMs}ms)`
                    : `${event.errorCategory}: ${event.errorMessage}`;
                console.log(`[Telemetry] ${status} ${event.provider}/${event.model} [${event.stage}]: ${msg}`);
                break;
                
            case 'circuit.state_change':
                console.log(`[Telemetry] Circuit ${event.provider}${event.model ? '/' + event.model : ''}: ${event.previousState} → ${event.newState} (${event.reason})`);
                break;
                
            case 'rate_limit.wait':
                console.log(`[Telemetry] Rate limit ${event.provider}: waiting ${event.waitMs}ms (${event.currentUsage}/${event.maxUsage})`);
                break;
        }
    }
}

// ==========================================
// OPENTELEMETRY INTEGRATION STUB
// ==========================================

/**
 * OpenTelemetry integration listener stub.
 * 
 * To use with OpenTelemetry, install the packages and uncomment:
 * - @opentelemetry/api
 * - @opentelemetry/sdk-trace-base
 * - @opentelemetry/sdk-metrics
 * 
 * Example implementation:
 * ```typescript
 * import { trace, metrics, SpanStatusCode } from '@opentelemetry/api';
 * 
 * export class OpenTelemetryListener implements TelemetryListener {
 *     private tracer = trace.getTracer('ai-service');
 *     private meter = metrics.getMeter('ai-service');
 *     
 *     private callDurationHistogram = this.meter.createHistogram('llm.call.duration', {
 *         description: 'LLM call duration in milliseconds',
 *         unit: 'ms'
 *     });
 *     
 *     onEvent(event: TelemetryEvent): void {
 *         if (event.type === 'llm.call.end') {
 *             this.callDurationHistogram.record(event.durationMs, {
 *                 provider: event.provider,
 *                 model: event.model,
 *                 success: event.success.toString()
 *             });
 *         }
 *     }
 * }
 * ```
 */

// ==========================================
// TELEMETRY EMITTER
// ==========================================

/**
 * Central telemetry emitter singleton.
 * Register listeners to receive telemetry events.
 */
class TelemetryEmitter {
    private listeners: Set<TelemetryListener> = new Set();
    private enabled: boolean = true;

    /**
     * Register a telemetry listener
     */
    addListener(listener: TelemetryListener): void {
        this.listeners.add(listener);
    }

    /**
     * Remove a telemetry listener
     */
    removeListener(listener: TelemetryListener): void {
        this.listeners.delete(listener);
        listener.dispose?.();
    }

    /**
     * Emit a telemetry event to all listeners
     */
    emit(event: Omit<TelemetryEvent, 'timestamp'>): void {
        if (!this.enabled || this.listeners.size === 0) return;
        
        const fullEvent = {
            ...event,
            timestamp: Date.now()
        } as TelemetryEvent;
        
        for (const listener of this.listeners) {
            try {
                listener.onEvent(fullEvent);
            } catch (e) {
                console.error('[Telemetry] Listener error:', e);
            }
        }
    }

    /**
     * Enable/disable telemetry globally
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Check if telemetry is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Clear all listeners
     */
    clear(): void {
        for (const listener of this.listeners) {
            listener.dispose?.();
        }
        this.listeners.clear();
    }
}

// Singleton instance
const telemetryEmitter = new TelemetryEmitter();

// ==========================================
// PUBLIC API
// ==========================================

/**
 * Get the telemetry emitter instance
 */
export function getTelemetry(): TelemetryEmitter {
    return telemetryEmitter;
}

/**
 * Emit an LLM call start event
 */
export function emitCallStart(
    provider: AIProviderType,
    model: string,
    stage: string,
    taskId?: string,
    traceId?: string
): void {
    telemetryEmitter.emit({
        type: 'llm.call.start',
        provider,
        model,
        stage,
        taskId,
        traceId
    });
}

/**
 * Emit an LLM call end event
 */
export function emitCallEnd(params: {
    provider: AIProviderType;
    model: string;
    stage: string;
    taskId?: string;
    traceId?: string;
    success: boolean;
    errorCategory?: ErrorCategory;
    errorMessage?: string;
    durationMs: number;
    rateLimitWaitMs: number;
    slotWaitMs: number;
    apiDurationMs: number;
    attempts: number;
    usedFallback: boolean;
    tokens?: number;
}): void {
    telemetryEmitter.emit({
        type: 'llm.call.end',
        ...params
    });
}

/**
 * Emit a circuit breaker state change event
 */
export function emitCircuitStateChange(
    provider: AIProviderType,
    previousState: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
    newState: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
    reason: string,
    model?: string,
    failureRate?: number
): void {
    telemetryEmitter.emit({
        type: 'circuit.state_change',
        provider,
        model,
        previousState,
        newState,
        reason,
        failureRate
    });
}

/**
 * Emit a rate limit wait event
 */
export function emitRateLimitWait(
    provider: AIProviderType,
    waitMs: number,
    currentUsage: number,
    maxUsage: number
): void {
    telemetryEmitter.emit({
        type: 'rate_limit.wait',
        provider,
        waitMs,
        currentUsage,
        maxUsage
    });
}

// ==========================================
// DEVELOPMENT HELPER
// ==========================================

/**
 * Enable console logging for development.
 * Call this during app initialization if you want to see telemetry in the console.
 */
export function enableConsoleTelemetry(options?: { verbose?: boolean }): TelemetryListener {
    const listener = new ConsoleTelemetryListener(options);
    telemetryEmitter.addListener(listener);
    return listener;
}
