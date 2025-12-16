/**
 * AI Service Context
 * 
 * Provides LLMOrchestrator instance to the app based on user configuration.
 * The orchestrator is the ONLY entry point for all LLM calls.
 * 
 * IMPORTANT: Direct provider access has been removed.
 * All LLM calls MUST go through the orchestrator.
 */

import React, { createContext, useContext, useMemo, useCallback, useState } from 'react';
import { 
    AIProviderType, 
    AISettings, 
    DEFAULT_AI_SETTINGS,
    clearProviderCache,
    getDefaultModel
} from '../services/ai';
import { LLMOrchestrator, getOrchestrator, resetOrchestrator } from '../services/ai/orchestrator';

interface AIServiceContextType {
    /** The LLMOrchestrator - the ONLY entry point for all LLM calls */
    orchestrator: LLMOrchestrator;
    settings: AISettings;
    updateSettings: (settings: AISettings) => void;
    /** Whether an API key is configured for the current provider */
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

/**
 * Check if an API key is configured for the given provider.
 * Does NOT create a provider instance - just checks the key exists.
 */
function checkIsConfigured(settings: AISettings): boolean {
    let apiKey = '';
    
    if (settings.useCustomKey && settings.apiKey) {
        apiKey = settings.apiKey;
    } else {
        apiKey = getEnvKeyForProvider(settings.provider);
    }
    
    return !!apiKey && apiKey.length > 0;
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

    // Update settings and persist
    const updateSettings = useCallback((newSettings: AISettings) => {
        setSettings(newSettings);
        setError(null);
        
        // Persist to localStorage
        const toStore = {
            ...newSettings,
            // Store the API key if using custom key
            apiKey: newSettings.useCustomKey ? newSettings.apiKey : ''
        };
        localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(toStore));
        
        // Clear provider cache so next access gets fresh instance
        clearProviderCache();
        
        // Reset orchestrator to pick up new settings
        resetOrchestrator();
    }, []);

    // Check if configured based on settings (no provider instantiation needed)
    const isConfigured = useMemo(() => checkIsConfigured(settings), [settings]);

    // Create orchestrator instance (uses global singleton)
    const orchestrator = useMemo(() => {
        return getOrchestrator();
    }, []);

    const value = useMemo(() => ({
        orchestrator,
        settings,
        updateSettings,
        isConfigured,
        error
    }), [orchestrator, settings, updateSettings, isConfigured, error]);

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

/**
 * Convenience hook to get the LLMOrchestrator.
 * This is the ONLY way to access LLM functionality.
 * All LLM calls MUST go through the orchestrator.
 */
export const useOrchestrator = (): LLMOrchestrator => {
    const { orchestrator } = useAIService();
    return orchestrator;
};
