import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Terminal, ChevronRight, ChevronDown, Search, Link2, X, Plus, Box } from 'lucide-react';
import { GenerationLogEntry, UniversalEntity } from '../types'; 
import { NexusEntityPicker } from './NexusEntityPicker';
import { EntityUtils } from '../utils/entityUtils'; 
import { db } from '../services/db'; // Import DB to support "All" search
import { PortalTooltip } from './PortalTooltip'; // NEW IMPORT
import { useStrings } from '../lib/translations';

// --- Reusable Tag Input Component ---
export const TagInput = ({ 
    label, 
    tags, 
    setTags, 
    placeholder,
    onTagAdd
}: { 
    label?: string; 
    tags: string[]; 
    setTags: (t: string[]) => void; 
    placeholder: string;
    onTagAdd?: (tag: string) => void;
}) => {
    const handleChange = (newTags: string[]) => {
        if (onTagAdd) {
            newTags.forEach(t => {
                if (!tags.includes(t)) onTagAdd(t);
            });
        }
        setTags(newTags);
    };

    return (
        <NexusEntityPicker 
            label={label}
            value={tags}
            onChange={handleChange}
            placeholder={placeholder}
            lockedMode="tags" // Strict Mode Fix: Lock to tags only
        />
    );
};

// --- Log Viewer Component ---
export const LogViewer = ({ logs, toggleLog }: { logs: GenerationLogEntry[], toggleLog: (id: string) => void }) => {
    if (logs.length === 0) return null;
    const { s } = useStrings();

    return (
        <div className="mt-8 bg-nexus-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
            <div className="p-4 bg-nexus-950 border-b border-slate-700 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <Terminal size={16} className="text-nexus-accent" />
                    {s('shared.systemLogs')}
                </h3>
                <span className="text-xs text-slate-500">{logs.length} events</span>
            </div>
            <div className="space-y-3 p-4">
                {logs.map(log => (
                    <div key={log.id} className="border border-slate-700 rounded bg-nexus-800">
                        <button 
                            onClick={() => toggleLog(log.id)}
                            className="w-full flex items-center justify-between p-3 text-left hover:bg-nexus-700 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                {log.collapsed ? <ChevronRight size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                                <span className="text-xs font-mono text-nexus-accent">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                <span className="text-xs text-slate-300 font-bold truncate max-w-[300px]">{log.title}</span>
                            </div>
                        </button>
                        
                        {!log.collapsed && (
                            <div className="p-3 border-t border-slate-700 bg-black/30 text-xs font-mono">
                                <div className="mb-4">
                                    <div className="text-slate-500 font-bold mb-1 uppercase tracking-wider">{s('shared.systemPromptPayload')}</div>
                                    <div className="bg-nexus-950 p-3 rounded text-green-400 whitespace-pre-wrap border border-slate-800">
                                        {log.prompt}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500 font-bold mb-1 uppercase tracking-wider">{s('shared.rawJsonResponse')}</div>
                                    <div className="bg-nexus-950 p-3 rounded text-blue-400 whitespace-pre-wrap border border-slate-800">
                                        {log.response}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

// --- Reusable Context Selector ---
export const ContextSelectorModal = ({ world, onSelect, onClose }: { world: any, onSelect: (i: UniversalEntity) => void, onClose: () => void }) => {
    const { s } = useStrings();
    // Default to 'All' to enable global search
    const [selectedPool, setSelectedPool] = useState<string>('All');
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<UniversalEntity[]>([]);
    const [mounted, setMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = 'hidden';
        
        // Initial load of content (or just list default pool if not All)
        performSearch();

        return () => { document.body.style.overflow = 'unset'; }
    }, []);

    // Effect to trigger search when inputs change (debounced)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            performSearch();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [search, selectedPool]);

    const performSearch = async () => {
        if (!world) return;
        setIsLoading(true);
        try {
            // FIX: Always use DB search to avoid "lazy load" empty arrays issues in world object
            // If selectedPool is 'All', pass undefined to search all
            const poolFilter = selectedPool === 'All' ? undefined : selectedPool;
            const items = await db.searchEntities(world.id, search, 50, poolFilter);
            setResults(items);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }

    if (!mounted) return null;

    const renderCardPreview = (entity: UniversalEntity) => {
        const displayAttrs = EntityUtils.getDisplayAttributes(entity);
        const description = EntityUtils.getDescription(entity);
        
        return (
            <div className="max-w-xs space-y-2">
                <div className="flex justify-between items-center border-b border-white/20 pb-1 mb-2">
                    <strong className="text-white text-sm">{entity.name}</strong>
                    {!!entity.components['rarity'] && (
                        <span className={`text-xs uppercase font-bold px-1.5 py-0.5 rounded bg-black/40`}>
                            {EntityUtils.getRarity(entity)}
                        </span>
                    )}
                </div>
                
                {description && (
                    <p className="text-xs text-slate-300 italic line-clamp-3 mb-2">{description}</p>
                )}
                
                {Object.keys(displayAttrs).length > 0 && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {Object.entries(displayAttrs).slice(0, 6).map(([k, v]) => (
                            <div key={k} className="flex flex-col">
                                <span className="text-xs text-slate-500 uppercase font-bold">{k}</span>
                                <span className="text-xs text-slate-300 font-mono truncate">{String(v)}</span>
                            </div>
                        ))}
                    </div>
                )}
                
                <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-white/10">
                    {entity.tags.map(t => (
                        <span key={t} className="text-xs px-1.5 py-0.5 bg-white/10 rounded">{t}</span>
                    ))}
                </div>
            </div>
        );
    };

    const modalContent = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
             <div 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />
            
            <div className="relative bg-nexus-800 border border-slate-600 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200 m-4">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-nexus-900 rounded-t-xl">
                    <h3 className="font-bold text-slate-100 flex items-center gap-2">
                        <Link2 size={16} className="text-nexus-accent" /> {s('shared.selectReferenceEntity')}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
                </div>
                
                <div className="p-4 border-b border-slate-700 bg-nexus-900/50 flex gap-4">
                    <div className="w-1/3">
                         <select 
                            value={selectedPool} 
                            onChange={e => { setSelectedPool(e.target.value); }}
                            className="w-full bg-nexus-900 border border-slate-600 rounded p-2.5 text-sm text-white outline-none focus:border-nexus-accent cursor-pointer"
                        >
                            <option value="All">{s('shared.allPools')}</option>
                            {Object.keys(world.pools).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                   
                    <div className="flex-1 relative">
                        <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                        <input 
                            type="text" 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={s('shared.searchByNameOrTag')}
                            className="w-full bg-nexus-900 border border-slate-600 rounded p-2.5 pl-9 text-sm text-white outline-none focus:border-nexus-accent"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {isLoading ? (
                        <div className="text-center py-12 opacity-50">
                            <div className="animate-spin w-6 h-6 border-2 border-nexus-accent border-r-transparent rounded-full mx-auto mb-2"></div>
                            <p className="text-xs text-slate-500">{s('shared.searching')}</p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="text-center py-12 opacity-50">
                            <p className="text-slate-500 italic">{s('shared.noMatchingEntities')}</p>
                            <p className="text-xs text-slate-600 mt-1">{s('shared.tryDifferentSearch')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {results.map((entity: UniversalEntity) => (
                                <PortalTooltip key={entity.id} content={renderCardPreview(entity)}>
                                    <button 
                                        onClick={() => onSelect(entity)}
                                        className="w-full text-left bg-nexus-900 border border-slate-700 hover:border-nexus-accent hover:bg-nexus-800 p-3 rounded group transition-all"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-200 group-hover:text-nexus-accent transition-colors">{entity.name}</span>
                                            </div>
                                            {/* FIX: Only show rarity badge if rarity component exists */}
                                            {!!entity.components['rarity'] && (
                                                <span className={`text-xs uppercase border px-1.5 py-0.5 rounded font-bold ${
                                                    EntityUtils.getRarity(entity) === 'Legendary' ? 'border-amber-500/50 text-amber-500 bg-amber-900/10' : 
                                                    EntityUtils.getRarity(entity) === 'Epic' ? 'border-purple-500/50 text-purple-500 bg-purple-900/10' : 
                                                    'border-slate-700 text-slate-500'
                                                }`}>
                                                    {EntityUtils.getRarity(entity)}
                                                </span>
                                            )}
                                        </div>
                                        {/* Hover Tooltip handles full description now, keep this short */}
                                        <div className="text-xs text-slate-500 truncate mt-1 pr-8 opacity-80 group-hover:opacity-100 flex items-center gap-2">
                                            <Box size={10} />
                                            <span className="truncate">{EntityUtils.getDescription(entity).substring(0, 60) || s('shared.noDescriptionProvided')}...</span>
                                        </div>
                                    </button>
                                </PortalTooltip>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="p-3 bg-nexus-950 border-t border-slate-800 text-xs text-slate-500 flex justify-between rounded-b-xl">
                    <span>{s('shared.foundMatches', { count: results.length })}</span>
                    <span className="italic">{s('shared.hoverForDetails')}</span>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};