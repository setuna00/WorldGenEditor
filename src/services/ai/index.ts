/**
 * AI Service Module
 * 
 * Main entry point for AI provider abstraction.
 * 
 * Recommended usage:
 * - Use LLMOrchestrator for all LLM calls (handles retry, fallback, circuit breaker)
 * - Direct provider access is available but not recommended for production
 */

// Types
export * from './types';

// Error classification
export * from './errors';

// Scheduler (Task Queue with Rate Limiting and Concurrency Control)
export * from './scheduler';

// Retry Manager
export * from './retryManager';

// Circuit Breaker
export * from './circuitBreaker';

// Fallback Router
export * from './fallbackRouter';

// Orchestrator (RECOMMENDED: unified entry point for all LLM calls)
export * from './orchestrator';

// Build Pipeline (state management, throttled persistence, idempotency)
export * from './buildPipeline';

// Model configurations and badges
export { MODELS_CONFIG, BADGE_DEFINITIONS, TIER_COLORS } from './models.config';

// Schema conversion
export { standardToGemini, geminiToStandard, standardToOpenAI } from './schemaConverter';

// Rate limiting (legacy - prefer using scheduler)
export { RateLimiter, getRateLimiter, resetAllLimiters } from './rateLimiter';

// Providers (direct access - prefer using orchestrator)
export { getProvider, createProvider, clearProviderCache, GeminiProvider, OpenAIProvider, DeepSeekProvider } from './providers';

