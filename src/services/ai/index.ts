/**
 * AI Service Module
 * 
 * Main entry point for AI provider abstraction.
 * 
 * Recommended usage:
 * - Use LLMOrchestrator for all LLM calls (handles retry, fallback, circuit breaker)
 * - Direct provider access is available but not recommended for production
 * 
 * Architecture:
 * - Scheduler: Rate limiting (Bottleneck) + concurrency control + timeout
 * - RetryManager: Intelligent retry with repair mode for JSON errors
 * - CircuitBreaker: Prevents cascading failures
 * - FallbackRouter: Multi-provider fallback with parameter degradation
 * - Orchestrator: Unified entry point coordinating all components
 * - Telemetry: Observability hooks (OpenTelemetry-compatible)
 */

// Types
export * from './types';

// Error classification
export * from './errors';

// Scheduler (Task Queue with Bottleneck Rate Limiting and Concurrency Control)
export * from './scheduler';

// Retry Manager
export * from './retryManager';

// Circuit Breaker
export * from './circuitBreaker';

// Fallback Router
export * from './fallbackRouter';

// Orchestrator (RECOMMENDED: unified entry point for all LLM calls)
export * from './orchestrator';

// Telemetry (observability hooks for OpenTelemetry integration)
export * from './telemetry';

// Build Pipeline (state management, throttled persistence, idempotency)
export * from './buildPipeline';

// Model configurations and badges
export { MODELS_CONFIG, BADGE_DEFINITIONS, TIER_COLORS } from './models.config';

// Schema conversion
export { standardToGemini, geminiToStandard, standardToOpenAI } from './schemaConverter';

// Rate limiting (legacy - prefer using scheduler with Bottleneck)
export { RateLimiter, getRateLimiter, resetAllLimiters } from './rateLimiter';

// Providers (direct access - prefer using orchestrator)
export { getProvider, createProvider, clearProviderCache, GeminiProvider, OpenAIProvider, DeepSeekProvider, ClaudeProvider } from './providers';

