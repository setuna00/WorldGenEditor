import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import { UniversalEntity } from '../types';
import { useActiveWorld } from '../contexts/ActiveWorldContext';

export const usePoolData = (worldId: string | undefined, poolName: string, pageSize: number = 50) => {
    const [entities, setEntities] = useState<UniversalEntity[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Pagination State
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    // FIX: Listen to global refresh signal to update list on Blueprint changes
    const { refreshSignal } = useActiveWorld();

    const fetchEntities = useCallback(async (targetPage: number) => {
        if (!worldId || !poolName) return;
        setLoading(true);
        try {
            const { items, total } = await db.getEntitiesForPoolPaginated(worldId, poolName, targetPage, pageSize);
            setEntities(items);
            setTotal(total);
            setPage(targetPage);
        } catch (err) {
            console.error("Failed to load pool", err);
            setError("Database Read Failure");
        } finally {
            setLoading(false);
        }
    }, [worldId, poolName, pageSize]);

    // Initial Load & Refresh
    useEffect(() => {
        setPage(1);
        fetchEntities(1);
    }, [worldId, poolName, fetchEntities, refreshSignal]); // Added refreshSignal

    const nextPage = () => {
        if (page * pageSize < total) fetchEntities(page + 1);
    };

    const prevPage = () => {
        if (page > 1) fetchEntities(page - 1);
    };

    // Optimistic Updates
    const addEntity = async (entity: UniversalEntity) => {
        if (!worldId) return;
        // UI update: Add to TOP of list
        setEntities(prev => [entity, ...prev].slice(0, pageSize)); 
        setTotal(t => t + 1);
        await db.saveEntity(worldId, poolName, entity);
    };

    const updateEntity = async (entity: UniversalEntity) => {
        if (!worldId) return;
        setEntities(prev => prev.map(e => e.id === entity.id ? entity : e));
        await db.saveEntity(worldId, poolName, entity);
    };

    const removeEntity = async (entityId: string) => {
        if (!worldId) return;
        setEntities(prev => prev.filter(e => e.id !== entityId));
        setTotal(t => t - 1);
        await db.deleteEntity(entityId);
    };

    return { 
        entities, 
        loading, 
        error, 
        addEntity, 
        updateEntity,
        removeEntity, 
        refresh: () => fetchEntities(page),
        pagination: {
            page,
            totalPages: Math.ceil(total / pageSize),
            totalItems: total,
            nextPage,
            prevPage
        }
    };
};