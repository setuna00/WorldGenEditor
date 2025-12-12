import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import { World } from '../types';

export const useWorldMetadata = (worldId: string | null) => {
    const [metadata, setMetadata] = useState<World | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!worldId) {
            setMetadata(null);
            return;
        }

        setLoading(true);
        try {
            const data = await db.loadWorldMeta(worldId);
            setMetadata(data || null);
            setError(null);
        } catch (e: any) {
            console.error("Failed to load world metadata", e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [worldId]);

    // Initial load
    useEffect(() => {
        reload();
    }, [reload]);

    return { metadata, loading, error, reload };
};