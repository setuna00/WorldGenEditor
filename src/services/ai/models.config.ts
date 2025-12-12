/**
 * AI Models Configuration
 * 
 * Centralized configuration for all AI provider models.
 * This file contains model definitions with pricing tiers, badges, and capabilities.
 * 
 * To add a new provider:
 * 1. Add the provider type to AIProviderType in types.ts
 * 2. Add provider info to PROVIDER_INFO in types.ts
 * 3. Add models array here
 * 4. Add default config in types.ts
 */

// Note: We don't import ModelOption here to avoid circular dependency
// The type is defined in types.ts and this file is loaded via require()

/**
 * Model configuration for each provider
 * Organized by provider type for easy maintenance and extension
 */
export const MODELS_CONFIG = {
    gemini: [
        // Gemini 3 Series (Latest)
        {
            id: 'gemini-3-pro',
            name: 'Gemini 3 Pro',
            description: 'Latest flagship model, most capable for complex tasks',
            tier: 'premium',
            contextWindow: 1000000,
            badges: ['latest', 'multi']
        },
        {
            id: 'gemini-3-pro-image',
            name: 'Gemini 3 Pro Image',
            description: 'Latest model with enhanced image understanding',
            tier: 'premium',
            contextWindow: 1000000,
            badges: ['latest', 'multi']
        },

        // Gemini 2.5 Series (Current Mainstream)
        {
            id: 'gemini-2.5-pro',
            name: 'Gemini 2.5 Pro',
            description: 'Advanced reasoning, best for complex generation',
            tier: 'premium',
            contextWindow: 1000000,
            badges: ['multi']
        },
        {
            id: 'gemini-2.5-pro-tts',
            name: 'Gemini 2.5 Pro TTS',
            description: 'Pro model with text-to-speech capabilities',
            tier: 'premium',
            contextWindow: 1000000,
            badges: ['multi', 'tts']
        },
        {
            id: 'gemini-2.5-flash',
            name: 'Gemini 2.5 Flash',
            description: 'Fast & cost-effective, great for most tasks',
            tier: 'standard',
            contextWindow: 1000000,
            badges: ['multi']
        },
        {
            id: 'gemini-2.5-flash-preview-image',
            name: 'Gemini 2.5 Flash Image',
            description: 'Fast model with image generation preview',
            tier: 'standard',
            contextWindow: 65536,
            badges: ['multi']
        },
        {
            id: 'gemini-2.5-flash-tts',
            name: 'Gemini 2.5 Flash TTS',
            description: 'Fast model with text-to-speech',
            tier: 'standard',
            contextWindow: 1000000,
            badges: ['multi', 'tts']
        },
        {
            id: 'gemini-2.5-flash-lite',
            name: 'Gemini 2.5 Flash Lite',
            description: 'Fastest & most cost-efficient, high throughput',
            tier: 'budget',
            contextWindow: 1000000,
            badges: ['fast']
        },
        {
            id: 'gemini-2.5-flash-native-audio-dialog',
            name: 'Gemini 2.5 Flash Live',
            description: 'Real-time conversational with streaming audio',
            tier: 'standard',
            contextWindow: 1000000,
            badges: ['multi', 'realtime']
        },

        // Gemini 2.0 Series (Backward Compatibility)
        {
            id: 'gemini-2.0-flash',
            name: 'Gemini 2.0 Flash',
            description: 'Previous gen flash model',
            tier: 'budget',
            contextWindow: 1000000,
            badges: []
        },
        {
            id: 'gemini-2.0-flash-exp',
            name: 'Gemini 2.0 Flash Exp',
            description: 'Experimental version of 2.0 Flash',
            tier: 'budget',
            contextWindow: 1000000,
            badges: []
        },
        {
            id: 'gemini-2.0-flash-lite',
            name: 'Gemini 2.0 Flash Lite',
            description: 'Previous gen lite model',
            tier: 'budget',
            contextWindow: 1000000,
            badges: []
        },

        // Gemini 1.5 Series (Legacy)
        {
            id: 'gemini-1.5-flash',
            name: 'Gemini 1.5 Flash',
            description: 'Legacy fast model',
            tier: 'budget',
            contextWindow: 1000000,
            badges: ['legacy']
        },
        {
            id: 'gemini-1.5-pro',
            name: 'Gemini 1.5 Pro',
            description: 'Legacy pro model with 2M context window',
            tier: 'standard',
            contextWindow: 2000000,
            badges: ['legacy', 'long']
        }
    ],

    openai: [
        // GPT-5.2 Series (Latest)
        {
            id: 'gpt-5.2',
            name: 'GPT-5.2',
            description: 'Latest flagship model with improved capabilities',
            tier: 'premium',
            contextWindow: 128000,
            badges: ['latest']
        },
        {
            id: 'gpt-5.2-chat',
            name: 'GPT-5.2 Chat',
            description: 'Latest chat-optimized model',
            tier: 'premium',
            contextWindow: 128000,
            badges: ['latest']
        },
        {
            id: 'gpt-5.2-pro',
            name: 'GPT-5.2 Pro',
            description: 'Latest professional model',
            tier: 'premium',
            contextWindow: 128000,
            badges: ['latest']
        },

        // GPT-5 Series
        {
            id: 'gpt-5',
            name: 'GPT-5',
            description: 'Multimodal flagship model combining reasoning capabilities',
            tier: 'premium',
            contextWindow: 128000,
            badges: ['multi']
        },
        {
            id: 'gpt-5-chat',
            name: 'GPT-5 Chat',
            description: 'Chat-optimized GPT-5 model',
            tier: 'premium',
            contextWindow: 128000,
            badges: ['multi']
        },
        {
            id: 'gpt-5-pro',
            name: 'GPT-5 Pro',
            description: 'Professional GPT-5 variant',
            tier: 'premium',
            contextWindow: 128000,
            badges: ['multi']
        },
        {
            id: 'gpt-5-mini',
            name: 'GPT-5 Mini',
            description: 'Faster, cost-efficient GPT-5 variant',
            tier: 'budget',
            contextWindow: 128000,
            badges: ['fast']
        },
        {
            id: 'gpt-5-nano',
            name: 'GPT-5 Nano',
            description: 'Fastest and most cost-efficient GPT-5',
            tier: 'budget',
            contextWindow: 128000,
            badges: ['fast']
        },
        {
            id: 'gpt-5-codex',
            name: 'GPT-5 Codex',
            description: 'GPT-5 optimized for coding tasks',
            tier: 'premium',
            contextWindow: 128000,
            badges: ['code']
        },

        // GPT-5.1 Series
        {
            id: 'gpt-5.1',
            name: 'GPT-5.1',
            description: 'Flagship model optimized for coding and agentic tasks',
            tier: 'premium',
            contextWindow: 400000,
            badges: ['code']
        },
        {
            id: 'gpt-5.1-chat',
            name: 'GPT-5.1 Chat',
            description: 'Chat-optimized GPT-5.1',
            tier: 'premium',
            contextWindow: 400000,
            badges: ['code']
        },
        {
            id: 'gpt-5.1-codex',
            name: 'GPT-5.1 Codex',
            description: 'Optimized for agentic coding tasks',
            tier: 'premium',
            contextWindow: 400000,
            badges: ['code']
        },
        {
            id: 'gpt-5.1-codex-mini',
            name: 'GPT-5.1 Codex Mini',
            description: 'Smaller Codex variant for faster coding',
            tier: 'standard',
            contextWindow: 400000,
            badges: ['code']
        },
        {
            id: 'gpt-5.1-codex-max',
            name: 'GPT-5.1 Codex Max',
            description: 'For long-duration coding tasks and refactors',
            tier: 'premium',
            contextWindow: 400000,
            badges: ['code', 'long']
        },

        // GPT-4.1 Series
        {
            id: 'gpt-4.1',
            name: 'GPT-4.1',
            description: 'Enhanced GPT-4 with improved coding and long-context',
            tier: 'premium',
            contextWindow: 128000,
            badges: []
        },
        {
            id: 'gpt-4.1-mini',
            name: 'GPT-4.1 Mini',
            description: 'Smaller, faster GPT-4.1 variant',
            tier: 'standard',
            contextWindow: 128000,
            badges: []
        },
        {
            id: 'gpt-4.1-nano',
            name: 'GPT-4.1 Nano',
            description: 'Most cost-efficient GPT-4.1 variant',
            tier: 'budget',
            contextWindow: 128000,
            badges: []
        },

        // GPT-4 Series
        {
            id: 'gpt-4-turbo',
            name: 'GPT-4 Turbo',
            description: 'Enhanced GPT-4, more cost-effective',
            tier: 'standard',
            contextWindow: 128000,
            badges: []
        },
        {
            id: 'gpt-4-turbo-preview',
            name: 'GPT-4 Turbo Preview',
            description: 'Preview version of GPT-4 Turbo',
            tier: 'standard',
            contextWindow: 128000,
            badges: []
        },
        {
            id: 'gpt-4',
            name: 'GPT-4',
            description: 'Standard GPT-4 model',
            tier: 'premium',
            contextWindow: 8192,
            badges: []
        },
        {
            id: 'gpt-4o',
            name: 'GPT-4o',
            description: 'Multimodal model, accepts text and image inputs',
            tier: 'premium',
            contextWindow: 128000,
            badges: ['multi']
        },
        {
            id: 'gpt-4o-mini',
            name: 'GPT-4o Mini',
            description: 'Fast & affordable multimodal model',
            tier: 'budget',
            contextWindow: 128000,
            badges: ['multi']
        },

        // GPT-3.5 Series (Legacy)
        {
            id: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            description: 'Legacy model, very affordable',
            tier: 'budget',
            contextWindow: 16385,
            badges: ['legacy']
        },
        {
            id: 'gpt-3.5-turbo-16k',
            name: 'GPT-3.5 Turbo 16K',
            description: 'Legacy model with extended context',
            tier: 'budget',
            contextWindow: 16385,
            badges: ['legacy']
        },
        {
            id: 'gpt-3.5-turbo-instruct',
            name: 'GPT-3.5 Turbo Instruct',
            description: 'Legacy instruction-optimized model',
            tier: 'budget',
            contextWindow: 4096,
            badges: ['legacy']
        }
    ],

    deepseek: [
        // DeepSeek V3.2 Series (Latest)
        {
            id: 'deepseek-chat',
            name: 'DeepSeek Chat',
            description: 'DeepSeek-V3.2 non-thinking mode, supports JSON output and tool calls',
            tier: 'budget',
            contextWindow: 128000,
            badges: ['latest']
        },
        {
            id: 'deepseek-reasoner',
            name: 'DeepSeek Reasoner',
            description: 'DeepSeek-V3.2 thinking mode with advanced reasoning',
            tier: 'standard',
            contextWindow: 128000,
            badges: ['latest']
        }
    ],

    claude: [
        // Claude 4.5 Series (Latest)
        {
            id: 'claude-sonnet-4-5',
            name: 'Claude Sonnet 4.5',
            description: 'Smart model for complex agents and coding',
            tier: 'standard',
            contextWindow: 200000,
            badges: ['latest']
        },
        {
            id: 'claude-haiku-4-5',
            name: 'Claude Haiku 4.5',
            description: 'Fastest model with near-frontier intelligence',
            tier: 'budget',
            contextWindow: 200000,
            badges: ['latest', 'fast']
        },
        {
            id: 'claude-opus-4-5',
            name: 'Claude Opus 4.5',
            description: 'Premium model combining maximum intelligence with practical performance',
            tier: 'premium',
            contextWindow: 200000,
            badges: ['latest']
        },

        // Claude 4.1 Series
        {
            id: 'claude-opus-4-1',
            name: 'Claude Opus 4.1',
            description: 'Previous generation flagship model',
            tier: 'premium',
            contextWindow: 200000,
            badges: []
        },
        {
            id: 'claude-sonnet-4',
            name: 'Claude Sonnet 4',
            description: 'Balanced model for general tasks',
            tier: 'standard',
            contextWindow: 200000,
            badges: []
        },

        // Claude 3 Series (Legacy)
        {
            id: 'claude-3-7-sonnet',
            name: 'Claude 3.7 Sonnet',
            description: 'Previous Sonnet model',
            tier: 'standard',
            contextWindow: 200000,
            badges: ['legacy']
        },
        {
            id: 'claude-opus-4',
            name: 'Claude Opus 4',
            description: 'Previous Opus model',
            tier: 'premium',
            contextWindow: 200000,
            badges: ['legacy']
        },
        {
            id: 'claude-3-5-haiku',
            name: 'Claude 3.5 Haiku',
            description: 'Fast and efficient legacy model',
            tier: 'budget',
            contextWindow: 200000,
            badges: ['legacy', 'fast']
        },
        {
            id: 'claude-3-haiku',
            name: 'Claude 3 Haiku',
            description: 'Oldest fast model',
            tier: 'budget',
            contextWindow: 200000,
            badges: ['legacy', 'fast']
        }
    ]
};

/**
 * Badge definitions for UI display
 * Each badge has a label and color scheme
 */
export const BADGE_DEFINITIONS: Record<string, { label: string; className: string }> = {
    // Version status
    latest: {
        label: 'LATEST',
        className: 'text-amber-400 bg-amber-500/10 border-amber-500/30'
    },
    legacy: {
        label: 'LEGACY',
        className: 'text-slate-400 bg-slate-500/10 border-slate-500/30'
    },

    // Special features
    multi: {
        label: 'MULTI',
        className: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
    },
    code: {
        label: 'CODE',
        className: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
    },
    tts: {
        label: 'TTS',
        className: 'text-pink-400 bg-pink-500/10 border-pink-500/30'
    },
    realtime: {
        label: 'REALTIME',
        className: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30'
    },
    fast: {
        label: 'FAST',
        className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    },
    long: {
        label: 'LONG',
        className: 'text-blue-400 bg-blue-500/10 border-blue-500/30'
    }
};

/**
 * Tier color definitions (for price tier badge)
 */
export const TIER_COLORS: Record<string, string> = {
    budget: 'text-green-400 bg-green-500/10 border-green-500/30',
    standard: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    premium: 'text-purple-400 bg-purple-500/10 border-purple-500/30'
};
