import React, { createContext, useContext } from 'react';
import { WorldManager } from '../services/worldManager';

// Instantiate once. This is the singleton.
export const worldManager = new WorldManager();

const ServiceContext = createContext<WorldManager>(worldManager);

export const ServiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <ServiceContext.Provider value={worldManager}>
            {children}
        </ServiceContext.Provider>
    );
};

export const useWorldManager = () => {
    const ctx = useContext(ServiceContext);
    if (!ctx) throw new Error("useWorldManager must be used within ServiceProvider");
    return ctx;
};