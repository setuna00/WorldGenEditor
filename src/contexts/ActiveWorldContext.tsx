import React, { createContext, useContext, useState, useMemo } from 'react';

interface ActiveWorldContextType {
    activeWorldId: string | null;
    setActiveWorldId: (id: string | null) => void;
    refreshSignal: number;
    triggerRefresh: () => void;
}

const ActiveWorldContext = createContext<ActiveWorldContextType | null>(null);

export const ActiveWorldProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeWorldId, setActiveWorldId] = useState<string | null>(null);
    const [refreshSignal, setRefreshSignal] = useState(0);

    const triggerRefresh = () => setRefreshSignal(prev => prev + 1);

    const value = useMemo(() => ({
        activeWorldId, setActiveWorldId, refreshSignal, triggerRefresh
    }), [activeWorldId, refreshSignal]);

    return (
        <ActiveWorldContext.Provider value={value}>
            {children}
        </ActiveWorldContext.Provider>
    );
};

export const useActiveWorld = () => {
    const ctx = useContext(ActiveWorldContext);
    if (!ctx) throw new Error("useActiveWorld must be used within ActiveWorldProvider");
    return ctx;
};