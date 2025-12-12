import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { ForgeState } from '../types';

interface ForgeStateContextType {
    forgeState: Record<string, ForgeState>;
    setForgeState: (key: string, state: ForgeState) => void;
    getForgeState: (key: string) => ForgeState | undefined;
    clearForgeState: (key: string) => void;
}

const ForgeStateContext = createContext<ForgeStateContextType | null>(null);

export const ForgeStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [forgeState, setForgeStateMap] = useState<Record<string, ForgeState>>({});

    const setForgeState = useCallback((key: string, state: ForgeState) => {
        setForgeStateMap(prev => ({ ...prev, [key]: state }));
    }, []);

    const getForgeState = useCallback((key: string) => {
        return forgeState[key];
    }, [forgeState]);

    const clearForgeState = useCallback((key: string) => {
        setForgeStateMap(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    const value = useMemo<ForgeStateContextType>(() => ({
        forgeState,
        setForgeState,
        getForgeState,
        clearForgeState
    }), [forgeState, setForgeState, getForgeState, clearForgeState]);

    return (
        <ForgeStateContext.Provider value={value}>
            {children}
        </ForgeStateContext.Provider>
    );
};

export const useForgeState = () => {
    const ctx = useContext(ForgeStateContext);
    if (!ctx) throw new Error("useForgeState must be used within ForgeStateProvider");
    return ctx;
};

