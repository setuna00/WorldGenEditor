import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { World } from '../types';
import { useActiveWorld } from './ActiveWorldContext';
import { useWorldManager } from './ServiceContext';

interface WorldDataContextType {
    currentWorld: World | null;
    loading: boolean;
    error: string | null;
    refreshWorld: () => void;
}

const WorldDataContext = createContext<WorldDataContextType | null>(null);

export const WorldDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { activeWorldId, setActiveWorldId, refreshSignal } = useActiveWorld();
    const worldManager = useWorldManager();

    const [currentWorld, setCurrentWorld] = useState<World | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localRefresh, setLocalRefresh] = useState(0);

    // Manual refresh trigger (increments local signal)
    const refreshWorld = useCallback(() => {
        setLocalRefresh(v => v + 1);
    }, []);

    // Load world data when ID or any refresh signal changes
    useEffect(() => {
        const load = async () => {
            if (!activeWorldId) {
                // Initial Boot: If no world selected, try to find the first one
                try {
                    const worlds = await worldManager.listWorlds();
                    if (worlds.length > 0) {
                        setActiveWorldId(worlds[0].id);
                    } else {
                        setCurrentWorld(null);
                    }
                } catch (e) {
                    console.error("Failed to boot world list", e);
                    setError("Failed to load worlds");
                }
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const world = await worldManager.loadWorld(activeWorldId, true);
                if (world) {
                    setCurrentWorld(world);
                } else {
                    setCurrentWorld(null);
                    setError("World not found");
                }
            } catch (e) {
                console.error(`Failed to load world ${activeWorldId}`, e);
                setError("Failed to load world");
                setCurrentWorld(null);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [activeWorldId, refreshSignal, localRefresh, worldManager, setActiveWorldId]);

    const value = useMemo<WorldDataContextType>(() => ({
        currentWorld,
        loading,
        error,
        refreshWorld
    }), [currentWorld, loading, error, refreshWorld]);

    return (
        <WorldDataContext.Provider value={value}>
            {children}
        </WorldDataContext.Provider>
    );
};

export const useWorldData = () => {
    const ctx = useContext(WorldDataContext);
    if (!ctx) throw new Error("useWorldData must be used within WorldDataProvider");
    return ctx;
};

