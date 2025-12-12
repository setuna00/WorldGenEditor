import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useWorld } from '../hooks/useWorld';
import { NexusModal, NexusButton } from './ui';
import { Database, Tag, Box, Plus, Globe, User, BookOpen, Loader2 } from 'lucide-react';
import { NexusSourceLayout, SourceOption } from './NexusSourceLayout';
import { TagChip } from './TagChip';
import { db } from '../services/db';
import { UniversalEntity } from '../types';

interface NexusEntityPickerProps {
    value: string[]; 
    onChange: (val: string[]) => void;
    label?: string;
    placeholder?: string;
    single?: boolean; 
    limitToPool?: string;
    className?: string; 
    initialMode?: 'tags' | 'entities';
    lockedMode?: 'tags' | 'entities';
    trigger?: React.ReactNode;
}

export const NexusEntityPicker: React.FC<NexusEntityPickerProps> = ({ 
    value = [], onChange, label, placeholder = "Select...", single = false, limitToPool, className, initialMode = 'tags', lockedMode, trigger
}) => {
    const { currentWorld, worldManager } = useWorld();
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedSource, setSelectedSource] = useState<string>('All');
    
    // Initialize viewMode based on lockedMode if present, otherwise initialMode
    const [viewMode, setViewMode] = useState<'tags' | 'entities'>(lockedMode || initialMode);
    
    // ASYNC STATE
    const [isLoading, setIsLoading] = useState(false);
    const [loadedEntities, setLoadedEntities] = useState<UniversalEntity[]>([]);

    // FIX: Ref to track the current active query to prevent race conditions
    const currentQueryRef = useRef<string>('');

    if (!currentWorld) return null;

    // THE FIX: Debounced Search that hits the DB Index AND handles Race Conditions
    useEffect(() => {
        if (!isOpen) return;

        // Capture the query at the start of this effect cycle
        const activeQuery = search;
        currentQueryRef.current = activeQuery;

        const performSearch = async () => {
            setIsLoading(true);
            try {
                // If viewing global tags, we don't need entities
                if (viewMode === 'tags' && selectedSource === 'GlobalTags') {
                    // Only clear if this is still the active query
                    if (currentQueryRef.current === activeQuery) {
                        setLoadedEntities([]);
                    }
                    return;
                }

                // Call the optimized DB search
                // LIMIT set to 100 to prevent memory explosions
                const items = await db.searchEntities(
                    currentWorld.id, 
                    activeQuery, // Use captured variable
                    100, 
                    selectedSource === 'All' || selectedSource === 'GlobalTags' ? undefined : selectedSource
                );
                
                // CRITICAL CHECK: Only update state if this is still the latest query
                if (currentQueryRef.current === activeQuery) {
                    setLoadedEntities(items);
                }
            } catch (e) {
                console.error("Search failed", e);
            } finally {
                // Only turn off loading if we are the active query
                if (currentQueryRef.current === activeQuery) {
                    setIsLoading(false);
                }
            }
        };

        // Debounce typing
        const timeoutId = setTimeout(performSearch, 300);
        return () => clearTimeout(timeoutId);

    }, [selectedSource, search, isOpen, currentWorld.id, viewMode]);

    const sourceOptions: SourceOption[] = useMemo(() => {
        const pools = Object.values(currentWorld.pools);
        return [
            { id: 'All', label: 'All Sources', icon: Globe },
            { id: 'GlobalTags', label: 'Common Tags', icon: Tag },
            ...pools.map(p => ({
                id: p.name,
                label: p.name,
                icon: p.type === 'Character' ? User : p.type === 'World' ? BookOpen : Box,
                color: p.color
            }))
        ];
    }, [currentWorld]);

    const availableOptions = useMemo(() => {
        const options: { id: string, label: string, type: 'tag' | 'item', source: string, color?: string }[] = [];
        
        // 1. Process Loaded Entities (Result of DB Search)
        loadedEntities.forEach(ent => {
            const poolName = (ent as any).poolName || 'Unknown'; 
            
            if (viewMode === 'entities') {
                 options.push({ id: ent.name, label: ent.name, type: 'item', source: poolName });
            } else {
                 // Aggregating tags from the SEARCH RESULT only
                 ent.tags.forEach(t => {
                    const meta = worldManager.getTagMetadata(currentWorld.id, t);
                    options.push({ id: t, label: meta.label, type: 'tag', source: poolName, color: meta.color });
                 });
            }
        });
        
        // 2. Global Tag Fallback (If strictly browsing tags)
        if (viewMode === 'tags' && (selectedSource === 'GlobalTags' || options.length === 0)) {
             const analytics = worldManager.getTagAnalytics(currentWorld.id);
             Object.keys(analytics).forEach((id) => {
                 const data = analytics[id];
                 if (data.label.toLowerCase().includes(search.toLowerCase())) {
                     const resolvedColor = worldManager.resolveTagColor(currentWorld.id, id);
                     options.push({ id, label: data.label, type: 'tag', source: 'Global', color: resolvedColor });
                 }
            });
        }

        // Deduplicate by ID
        const seen = new Set();
        return options.filter(o => {
            if (seen.has(o.id)) return false;
            seen.add(o.id);
            return true;
        });
    }, [selectedSource, search, worldManager, viewMode, loadedEntities, currentWorld.id]); 

    const handleSelect = (val: string) => {
        if (single) { onChange([val]); setIsOpen(false); } 
        else { if (!value.includes(val)) { onChange([...value, val]); } else { onChange(value.filter(v => v !== val)); } }
    };

    const handleCreate = () => {
        if (!search.trim()) return;
        handleSelect(search.trim());
        setSearch('');
    };

    return (
        <div className="w-full">
            {label && <label className="block text-xs text-slate-500 uppercase font-bold mb-1.5 tracking-wide">{label}</label>}
            
            {trigger ? (
                <div onClick={() => setIsOpen(true)}>{trigger}</div>
            ) : (
                <div onClick={() => setIsOpen(true)} className={`bg-nexus-900 border border-slate-600 rounded p-2 min-h-[42px] cursor-pointer hover:border-nexus-accent transition-colors flex flex-row flex-wrap gap-2 items-center ${className || ''}`}>
                    {value.length === 0 && <span className="text-slate-500 text-sm px-1">{placeholder}</span>}
                    {value.map(val => {
                        // Try to resolve as tag first
                        const meta = worldManager.getTagMetadata(currentWorld.id, val);
                        // Check if it looks like an item (crude check, but items usually aren't IDs)
                        const isLikelyItem = !currentWorld.tags[val]; 
                        
                        const color = isLikelyItem ? '#3b82f6' : worldManager.resolveTagColor(currentWorld.id, val, limitToPool);
                        
                        return <TagChip 
                            key={val} 
                            tagName={isLikelyItem ? val : meta.label} 
                            color={color} 
                            description={currentWorld.tags[meta.id]?.description} 
                            isGlobal={meta.isGlobal} 
                            onRemove={() => onChange(value.filter(v => v !== val))} 
                            className="h-7 min-h-0 px-2 text-xs" 
                            icon={isLikelyItem ? Box : undefined}
                        />;
                    })}
                    <div className="ml-auto opacity-50"><Plus size={14} /></div>
                </div>
            )}

            <NexusModal isOpen={isOpen} onClose={() => setIsOpen(false)} title={<><Database size={18} className="text-nexus-accent" /> Select {lockedMode === 'tags' ? 'Tag' : lockedMode === 'entities' ? 'Entity' : 'Entity / Tag'}</>} maxWidth="max-w-4xl" footer={<div className="flex justify-between w-full items-center"><div className="text-xs text-slate-500">{value.length} selected</div><NexusButton onClick={() => setIsOpen(false)}>Done</NexusButton></div>}>
                <NexusSourceLayout sources={sourceOptions} selectedSource={selectedSource} onSourceSelect={setSelectedSource} searchQuery={search} onSearchChange={setSearch} searchPlaceholder={`Search in ${selectedSource}...`} className="h-[500px]">
                    {!lockedMode && (
                        <div className="w-full flex justify-center mb-4 sticky top-0 z-10 bg-nexus-900/95 backdrop-blur-sm pb-2 -mt-2 pt-2 border-b border-slate-800">
                            <div className="flex bg-nexus-950 p-1 rounded-lg border border-slate-700 w-64">
                                <button className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${viewMode === 'tags' ? 'bg-nexus-accent text-white shadow' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setViewMode('tags')}>Tags</button>
                                <button className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${viewMode === 'entities' ? 'bg-nexus-accent text-white shadow' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setViewMode('entities')}>Entities</button>
                            </div>
                        </div>
                    )}
                    
                    {isLoading && (
                        <div className="w-full flex justify-center py-8">
                            <Loader2 className="animate-spin text-nexus-accent" />
                        </div>
                    )}

                    {!isLoading && (
                        <div className="flex flex-wrap gap-2 content-start">
                             {search.trim() && !availableOptions.some(o => o.label.toLowerCase() === search.toLowerCase()) && <button onClick={handleCreate} className="flex items-center gap-2 px-3 py-2 rounded border border-dashed border-nexus-accent/50 bg-nexus-accent/10 text-nexus-accent hover:bg-nexus-accent/20 text-xs font-bold text-left min-h-[40px]"><Plus size={14} /> Create "{search}"</button>}
                            {availableOptions.map((opt, idx) => {
                                const isSelected = value.includes(opt.id) || value.includes(opt.label);
                                return <TagChip key={`${opt.id}-${idx}`} tagName={opt.label} color={opt.color || '#64748b'} selected={isSelected} onClick={() => handleSelect(opt.id)} isGlobal={opt.source === 'Global'} icon={opt.type === 'item' ? Box : undefined} className="flex-grow-0" />;
                            })}
                            {availableOptions.length === 0 && !search && <div className="w-full text-center py-10 text-slate-500 text-xs italic">Start typing to search...</div>}
                        </div>
                    )}
                </NexusSourceLayout>
            </NexusModal>
        </div>
    );
};