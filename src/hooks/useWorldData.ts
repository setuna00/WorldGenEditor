import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import { World } from '../types';
import { useActiveWorld } from '../contexts/ActiveWorldContext';

export const useCurrentWorld = (worldId: string | null) => {
    const [world, setWorld] = useState<World | null>(null);
    const [loading, setLoading] = useState(false);
    
    // FIX: Import the signal
    const { refreshSignal } = useActiveWorld();

    const load = useCallback(async () => {
        if (!worldId) return;
        setLoading(true);
        try {
            const data = await db.loadWorldMeta(worldId);
            setWorld(data || null);
        } catch (e) {
            console.error("Failed to load world", e);
        } finally {
            setLoading(false);
        }
    }, [worldId]);

    // FIX: Add refreshSignal to dependency array
    useEffect(() => { load(); }, [load, refreshSignal]);

    const updateConfig = async (newConfig: any) => {
        if (!world) return;
        const updated = { ...world, config: newConfig };
        setWorld(updated); 
        await db.saveWorld(updated);
    };

    return { world, loading, updateConfig, reload: load };
};
