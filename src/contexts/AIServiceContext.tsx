/**
 * AI Service Context
 * 
 * Provides AI provider instance to the app based on user configuration.
 * Supports multiple providers (Gemini, OpenAI) and model selection.
 */

import React, { createContext, useContext, useMemo, useCallback, useState } from 'react';
import { 
    AIProvider, 
    AIProviderType, 
    AISettings, 
    DEFAULT_AI_SETTINGS,
    PROVIDER_INFO,
    clearProviderCache,
    GeminiProvider,
    OpenAIProvider,
    getDefaultModel
} from '../services/ai';

interface AIServiceContextType {
    provider: AIProvider;
    settings: AISettings;
    updateSettings: (settings: AISettings) => void;
    isConfigured: boolean;
    error: string | null;
}

const AIServiceContext = createContext<AIServiceContextType | null>(null);

const AI_SETTINGS_KEY = 'nexus_ai_settings';

// Helper to get environment variable for a provider
function getEnvKeyForProvider(providerType: AIProviderType): string {
    if (providerType === 'openai') {
        return process.env.OPENAI_API_KEY || '';
    }
    // Default to Gemini env vars
    return process.env.API_KEY || process.env.GEMINI_API_KEY || '';
}

export const AIServiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Load settings from localStorage
    const [settings, setSettings] = useState<AISettings>(() => {
        try {
            const saved = localStorage.getItem(AI_SETTINGS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Ensure model is set for the provider
                if (!parsed.model) {
                    parsed.model = getDefaultModel(parsed.provider || 'gemini');
                }
                return { ...DEFAULT_AI_SETTINGS, ...parsed };
            }
        } catch (e) {
            console.warn('Failed to load AI settings', e);
        }
        return DEFAULT_AI_SETTINGS;
    });

    const [error, setError] = useState<string | null>(null);

    // Create provider based on settings
    const provider = useMemo<AIProvider>(() => {
        setError(null);
        
        try {
            // Determine API key: custom key or environment variable
            let apiKey = '';
            
            if (settings.useCustomKey && settings.apiKey) {
                apiKey = settings.apiKey;
            } else {
                // Fall back to environment variable based on provider
                apiKey = getEnvKeyForProvider(settings.provider);
            }

            // Create the appropriate provider
            switch (settings.provider) {
                case 'openai':
                    return new OpenAIProvider({
                        apiKey,
                        model: settings.model
                    });
                
                case 'gemini':
                default:
                    return new GeminiProvider({
                        apiKey,
                        model: settings.model
                    });
            }
        } catch (e: any) {
            setError(e.message);
            // Return unconfigured provider as fallback
            return new GeminiProvider({ apiKey: '' });
        }
    }, [settings]);

    // Update settings and persist
    const updateSettings = useCallback((newSettings: AISettings) => {
        setSettings(newSettings);
        
        // Persist to localStorage
        const toStore = {
            ...newSettings,
            // Store the API key if using custom key
            apiKey: newSettings.useCustomKey ? newSettings.apiKey : ''
        };
        localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(toStore));
        
        // Clear provider cache so next access gets fresh instance
        clearProviderCache();
    }, []);

    const isConfigured = provider.isConfigured();

    const value = useMemo(() => ({
        provider,
        settings,
        updateSettings,
        isConfigured,
        error
    }), [provider, settings, updateSettings, isConfigured, error]);

    return (
        <AIServiceContext.Provider value={value}>
            {children}
        </AIServiceContext.Provider>
    );
};

export const useAIService = () => {
    const ctx = useContext(AIServiceContext);
    if (!ctx) {
        throw new Error('useAIService must be used within AIServiceProvider');
    }
    return ctx;
};

// Convenience hook to just get the provider
export const useAIProvider = (): AIProvider => {
    const { provider } = useAIService();
    return provider;
};
