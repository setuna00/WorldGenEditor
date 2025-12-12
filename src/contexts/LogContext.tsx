import React, { useState, useCallback, useContext } from 'react';
import { GenerationLogEntry } from '../types';

interface LogContextType {
    globalLogs: GenerationLogEntry[];
    addGlobalLog: (title: string, prompt: string, response: string, tokenCount?: number) => void;
    toggleGlobalLog: (id: string) => void;
}

export const LogContext = React.createContext<LogContextType | null>(null);

export const LogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [globalLogs, setGlobalLogs] = useState<GenerationLogEntry[]>([]);

    const addGlobalLog = useCallback((title: string, prompt: string, response: string, tokenCount?: number) => {
        const finalTitle = tokenCount ? `${title} [${tokenCount} Tokens]` : title;
        const newLog: GenerationLogEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            title: finalTitle,
            prompt,
            response,
            collapsed: true
        };
        setGlobalLogs(prev => [newLog, ...prev].slice(0, 50));
    }, []);

    const toggleGlobalLog = useCallback((id: string) => {
        setGlobalLogs(prev => prev.map(l => l.id === id ? { ...l, collapsed: !l.collapsed } : l));
    }, []);

    return (
        <LogContext.Provider value={{ globalLogs, addGlobalLog, toggleGlobalLog }}>
            {children}
        </LogContext.Provider>
    );
};

export const useLogs = () => {
    const context = useContext(LogContext);
    if (!context) throw new Error("useLogs must be used within a LogProvider");
    return context;
};