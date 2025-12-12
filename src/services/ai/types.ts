/**
 * AI Provider Abstraction Layer - Type Definitions
 * 
 * This module defines the common interfaces and types for
 * supporting multiple AI providers (Gemini, OpenAI, etc.)
 */

// ==========================================
// STANDARD JSON SCHEMA TYPES
// ==========================================

export type StandardSchemaType = 
    | 'string' 
    | 'number' 
    | 'integer' 
    | 'boolean' 
    | 'array' 
    | 'object' 
    | 'null';

export interface StandardSchema {
    type: StandardSchemaType;
    description?: string;
    properties?: Record<string, StandardSchema>;
    items?: StandardSchema;
    required?: string[];
    enum?: string[];
    nullable?: boolean;
}

// ==========================================
// AI PROVIDER CONFIGURATION
// ==========================================

export type AIProviderType = 'gemini' | 'openai' | 'deepseek' | 'claude';

// Badge types for model capabilities and status
export type ModelBadge = 
    | 'latest'      // Latest version
    | 'legacy'      // Legacy/deprecated version
    | 'multi'       // Multimodal (image/audio support)
    | 'code'        // Code-optimized
    | 'tts'         // Text-to-speech
    | 'realtime'    // Real-time/streaming
    | 'fast'        // Fast response
    | 'long';       // Long context window

// Model definition with pricing tier info and badges
export interface ModelOption {
    id: string;
    name: string;
    description: string;
    tier: 'budget' | 'standard' | 'premium';
    contextWindow?: number;
    badges?: ModelBadge[];  // Optional badges for additional info
}

// Available models for each provider
// Models are loaded from models.config.ts for easier maintenance
import { MODELS_CONFIG } from './models.config';

export const PROVIDER_MODELS: Record<AIProviderType, ModelOption[]> = {
    gemini: MODELS_CONFIG.gemini as ModelOption[] || [],
    openai: MODELS_CONFIG.openai as ModelOption[] || [],
    deepseek: MODELS_CONFIG.deepseek as ModelOption[] || [],
    claude: MODELS_CONFIG.claude as ModelOption[] || []
};

// Provider display info
export const PROVIDER_INFO: Record<AIProviderType, { name: string; description: string; envKey: string }> = {
    gemini: {
        name: 'Google Gemini',
        description: 'Google\'s multimodal AI models',
        envKey: 'GEMINI_API_KEY'
    },
    openai: {
        name: 'OpenAI',
        description: 'ChatGPT & GPT models',
        envKey: 'OPENAI_API_KEY'
    },
    deepseek: {
        name: 'DeepSeek',
        description: 'DeepSeek AI models with reasoning capabilities',
        envKey: 'DEEPSEEK_API_KEY'
    },
    claude: {
        name: 'Anthropic Claude',
        description: 'Claude AI models by Anthropic',
        envKey: 'ANTHROPIC_API_KEY'
    }
};

export interface AIProviderConfig {
    provider: AIProviderType;
    apiKey: string;
    model?: string;
    // Rate limiting config
    rateLimit?: {
        maxRequests: number;
        windowMs: number;
    };
}

// Default configurations for each provider
export const DEFAULT_PROVIDER_CONFIGS: Record<AIProviderType, Partial<AIProviderConfig>> = {
    gemini: {
        model: 'gemini-2.5-flash',
        rateLimit: { maxRequests: 14, windowMs: 60000 }
    },
    openai: {
        model: 'gpt-4o-mini',
        rateLimit: { maxRequests: 50, windowMs: 60000 }
    },
    deepseek: {
        model: 'deepseek-chat',
        rateLimit: { maxRequests: 50, windowMs: 60000 }
    },
    claude: {
        model: 'claude-sonnet-4-5',
        rateLimit: { maxRequests: 50, windowMs: 60000 }
    }
};

// ==========================================
// AI SERVICE INTERFACE
// ==========================================

export interface GenerationOptions {
    language?: 'English' | 'Chinese';
    toneInstruction?: string;
    lengthInstruction?: string;
    lengthPerField?: boolean;
    strictTags?: boolean;
    allowedTags?: string[];
    rarity?: string;
    attributes?: string[];
    negativeConstraints?: string[];
    tagDefinitions?: string[];
    contextItems?: Array<{
        id: string;
        name: string;
        relationType: string;
        tags: string[];
        description?: string;
    }>;
}

export interface GenerationResult {
    data: any;
    tokens: number;
    raw?: string;
}

export interface AIProvider {
    readonly name: AIProviderType;
    
    /**
     * Generate structured data with a schema constraint
     */
    generateStructuredData(
        systemPrompt: string,
        userPrompt: string,
        schema: StandardSchema,
        temperature?: number
    ): Promise<GenerationResult>;
    
    /**
     * Generate batch of entities
     */
    generateBatch(
        poolName: string,
        userPrompt: string,
        count: number,
        worldContext: string,
        options: GenerationOptions,
        schema?: StandardSchema,
        allowedComponentIds?: string[],
        temperature?: number
    ): Promise<any[]>;
    
    /**
     * Check if provider is properly configured
     */
    isConfigured(): boolean;
}

// ==========================================
// LOGGING CALLBACK
// ==========================================

export type LogCallback = (
    prompt: string, 
    response: string, 
    tokenCount?: number
) => void;

// ==========================================
// AI SETTINGS (for GlobalAppSettings)
// ==========================================

export interface AISettings {
    provider: AIProviderType;
    apiKey: string;
    model: string;
    // Whether to use custom key or environment variable
    useCustomKey: boolean;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-2.5-flash',
    useCustomKey: false
};

// Helper function to get default model for a provider
export function getDefaultModel(provider: AIProviderType): string {
    return DEFAULT_PROVIDER_CONFIGS[provider]?.model || PROVIDER_MODELS[provider][0].id;
}
