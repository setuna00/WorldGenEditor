/**
 * AI Provider Factory
 * 
 * Creates and manages AI provider instances.
 */

import { AIProvider, AIProviderType, AIProviderConfig } from "../types";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import { DeepSeekProvider } from "./deepseek";
// Claude provider is experimental - uncomment when ready
// import { ClaudeProvider } from "./claude";

// ==========================================
// PROVIDER FACTORY
// ==========================================

const providerInstances = new Map<string, AIProvider>();

/**
 * Get or create an AI provider instance
 */
export function getProvider(
    type: AIProviderType, 
    config?: Partial<AIProviderConfig>
): AIProvider {
    const key = `${type}-${config?.apiKey || 'default'}-${config?.model || 'default'}`;
    
    if (!providerInstances.has(key)) {
        const provider = createProvider(type, config);
        providerInstances.set(key, provider);
    }
    
    return providerInstances.get(key)!;
}

/**
 * Create a new provider instance
 */
export function createProvider(
    type: AIProviderType, 
    config?: Partial<AIProviderConfig>
): AIProvider {
    switch (type) {
        case 'gemini':
            return new GeminiProvider(config);
        
        case 'openai':
            return new OpenAIProvider(config);
        
        case 'deepseek':
            return new DeepSeekProvider(config);
        
        // Claude provider is experimental - uncomment when ready
        // case 'claude':
        //     return new ClaudeProvider(config);
        
        default:
            throw new Error(`Unknown provider type: ${type}`);
    }
}

/**
 * Clear all cached provider instances
 * Useful when configuration changes
 */
export function clearProviderCache(): void {
    providerInstances.clear();
}

// Re-export provider classes for direct instantiation if needed
export { GeminiProvider } from "./gemini";
export { OpenAIProvider } from "./openai";
export { DeepSeekProvider } from "./deepseek";
// Claude provider is experimental - uncomment when ready
// export { ClaudeProvider } from "./claude";

