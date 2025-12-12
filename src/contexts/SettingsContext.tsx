import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { GlobalAppSettings } from '../types';
import { DEFAULT_TONES } from '../data/defaultTones'; // Import from new file

interface SettingsContextType {
    settings: GlobalAppSettings;
    updateSettings: (s: GlobalAppSettings) => void;
}

const DEFAULT_SETTINGS: GlobalAppSettings = {
    defaultLanguage: 'English',
    defaultOutputLength: 'Medium',
    tones: DEFAULT_TONES, // Use the imported constant
    lengthDefinitions: { short: 'Max 30 words', medium: 'Approx 80 words', long: 'Min 120 words' },
    enableImageGen: false,
    globalPromptPrefix: '',
    uiScale: 'Small'
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<GlobalAppSettings>(() => {
        try {
            const saved = localStorage.getItem('nexus_global_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                // We merge with DEFAULT_SETTINGS to ensure if we add new fields 
                // (or new default tones in the data file), they are picked up correctly.
                return { ...DEFAULT_SETTINGS, ...parsed };
            }
            return DEFAULT_SETTINGS;
        } catch { 
            return DEFAULT_SETTINGS; 
        }
    });

    useEffect(() => {
        const root = document.documentElement;
        const currentScale = settings.uiScale || 'Small';
        root.removeAttribute('data-scale');
        requestAnimationFrame(() => {
            root.setAttribute('data-scale', currentScale);
        });
    }, [settings.uiScale]);

    const updateSettings = (newSettings: GlobalAppSettings) => {
        const lang = newSettings.defaultLanguage || 'English';
        
        // Logic to project the correct language onto the active fields
        const localizedTones = newSettings.tones.map(tone => {
            if (tone.i18n && tone.i18n[lang]) {
                return {
                    ...tone,
                    name: tone.i18n[lang].name,
                    description: tone.i18n[lang].description,
                    instruction: tone.i18n[lang].instruction
                };
            }
            return tone;
        });

        const finalSettings = { ...newSettings, tones: localizedTones };
        
        setSettings(finalSettings);
        localStorage.setItem('nexus_global_settings', JSON.stringify(finalSettings));
    };

    const value = useMemo(() => ({ settings, updateSettings }), [settings]);

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useAppSettings = () => {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error("useAppSettings must be used within SettingsProvider");
    return ctx;
};