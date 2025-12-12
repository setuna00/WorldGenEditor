import React, { useState, useMemo, useEffect } from 'react';
import { useWorld } from '../hooks/useWorld';
import { Trash2, Save, Edit3, Tag, Globe, Plus, AlertTriangle, Loader2 } from 'lucide-react';
import { NexusModal, NexusButton, NexusInput, NexusTextArea } from '../components/ui';
import { NexusSourceLayout, SourceOption } from '../components/NexusSourceLayout';
import { TagChip } from '../components/TagChip';
import { normalizeTagId } from '../services/worldManager';
import { useToast } from '../contexts/ToastContext';
import { db } from '../services/db';
import { useStrings } from '../lib/translations';

const TagManagerPage: React.FC = () => {
    const { currentWorld, worldManager, refreshWorld } = useWorld();
    const { toast } = useToast();
    const { s } = useStrings();
    
    // Core State
    const [search, setSearch] = useState('');
    const [selectedSource, setSelectedSource] = useState('All');
    
    // Deletion State
    const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
    const [impactReport, setImpactReport] = useState<Record<string, number> | null>(null);
    const [isCalculatingImpact, setIsCalculatingImpact] = useState(false);
    
    // Editing State
    const [editingTagId, setEditingTagId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');

    // Migration State
    const [migrationCandidate, setMigrationCandidate] = useState<{ oldId: string, newId: string, newLabel: string } | null>(null);
    const [isMigrating, setIsMigrating] = useState(false);

    // Creation State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newTagLabel, setNewTagLabel] = useState('');
    const [newTagDesc, setNewTagDesc] = useState('');
    const [isCreating, setIsCreating] = useState(false); 

    // Active Pool Tags State (For Filtering)
    const [activePoolTags, setActivePoolTags] = useState<Set<string>>(new Set());
    const [isLoadingTags, setIsLoadingTags] = useState(false);

    // --- EFFECT: Load Tags for Selected Pool ---
    useEffect(() => {
        if (!currentWorld) return;
        
        const loadTagsForPool = async () => {
            if (selectedSource === 'All') {
                setActivePoolTags(new Set()); // Empty set implies "All"
                return;
            }

            setIsLoadingTags(true);
            try {
                // Fetch actual entities from DB to get real tag usage
                const entities = await db.getEntitiesForPool(currentWorld.id, selectedSource);
                const tagSet = new Set<string>();
                
                // Add entity tags
                entities.forEach(ent => {
                    ent.tags.forEach(t => tagSet.add(t));
                });
                
                // Add suggested tags from pool config
                const pool = currentWorld.pools[selectedSource];
                if (pool && pool.suggestedTags) {
                    pool.suggestedTags.forEach(t => tagSet.add(t));
                }

                setActivePoolTags(tagSet);
            } catch (e) {
                console.error("Failed to load pool tags", e);
            } finally {
                setIsLoadingTags(false);
            }
        };

        loadTagsForPool();
    }, [selectedSource, currentWorld?.id]);

    // --- Data Preparation ---

    const sources: SourceOption[] = useMemo(() => {
         if (!currentWorld) return [];
         const pools = Object.values(currentWorld.pools);
         return [
             { id: 'All', label: 'All Tags', icon: Globe },
             ...pools.map(p => ({
                 id: p.name,
                 label: p.name,
                 icon: Tag,
                 color: p.color
             }))
         ];
    }, [currentWorld]);

    const filteredTags = useMemo(() => {
        if (!currentWorld) return [];
        let allTags = Object.values(currentWorld.tags);
        
        // --- REAL SOURCE FILTERING ---
        if (selectedSource !== 'All') {
            // Filter list based on the Set we populated from DB
            allTags = allTags.filter(t => activePoolTags.has(t.id));
        }

        // --- SEARCH FILTER ---
        if (search.trim()) {
            allTags = allTags.filter(t => 
                t.label.toLowerCase().includes(search.toLowerCase()) || 
                t.id.includes(search.toLowerCase())
            );
        }
        
        return allTags.sort((a,b) => a.label.localeCompare(b.label));
    }, [currentWorld, search, selectedSource, activePoolTags]);

    // Early return AFTER all hooks
    if (!currentWorld) return null;

    // --- Handlers ---

    const handleCreateTag = async () => {
        if (!newTagLabel.trim()) {
             toast({ title: s('tagManager.toast.validationError.title'), message: s('tagManager.toast.validationError.message'), type: 'warning' });
             return;
        }

        setIsCreating(true);
        try {
            await worldManager.updateTagDefinition(currentWorld.id, newTagLabel, newTagDesc); 
            refreshWorld(); 
            setIsCreateOpen(false);
            setNewTagLabel('');
            setNewTagDesc('');
            toast({ title: s('tagManager.toast.tagCreated.title'), message: s('tagManager.toast.tagCreated.message', { label: newTagLabel }), type: 'success' });
        } catch (error) {
            toast({ title: s('tagManager.toast.persistFailed.title'), message: s('tagManager.toast.persistFailed.message'), type: 'error' });
        } finally {
            setIsCreating(false);
        }
    };

    const checkTagImpact = async (tagId: string) => {
        setIsCalculatingImpact(true);
        try {
            const count = await db.getTagUsageCount(currentWorld.id, tagId);
            setImpactReport(count > 0 ? { "Global Usage": count } : null);
        } catch (e) {
            toast({ title: s('tagManager.toast.scanFailed.title'), message: s('tagManager.toast.scanFailed.message'), type: "error" });
        } finally {
            setIsCalculatingImpact(false);
        }
    };

    const initiateDelete = (tagId: string) => {
        setDeletingTagId(tagId);
        setImpactReport(null);
        checkTagImpact(tagId);
    };

    const confirmDelete = async () => {
        if (!deletingTagId) return;
        try {
            const updatedTags = { ...currentWorld.tags };
            delete updatedTags[deletingTagId];
            await worldManager.updateWorldTags(currentWorld.id, updatedTags);
            toast({ title: s('tagManager.toast.tagDeleted.title'), message: s('tagManager.toast.tagDeleted.message'), type: "info" });
            setDeletingTagId(null);
            refreshWorld();
        } catch (e) {
            toast({ title: s('tagManager.toast.deleteFailed.title'), message: s('tagManager.toast.deleteFailed.message'), type: "error" });
        }
    };

    const startEdit = (tagId: string) => {
        const def = currentWorld.tags[tagId];
        setEditingTagId(tagId);
        setEditName(def?.label || tagId);
        setEditDesc(def?.description || '');
    };

    const handlePreSave = async () => {
        if (!editingTagId) return;
        const newId = normalizeTagId(editName);
        const oldId = editingTagId;
        if (newId && newId !== oldId) {
             setMigrationCandidate({ oldId, newId, newLabel: editName });
             return;
        } 
        try {
            await worldManager.updateTagDefinition(currentWorld.id, editName, editDesc);
            toast({ title: s('tagManager.toast.saved.title'), message: s('tagManager.toast.saved.message'), type: "success" });
            setEditingTagId(null);
            refreshWorld();
        } catch (e) {
            toast({ title: s('tagManager.toast.saveFailed.title'), message: s('tagManager.toast.saveFailed.message'), type: "error" });
        }
    };

    const confirmMigration = async () => {
        if (!migrationCandidate) return;
        setIsMigrating(true);
        try {
             const count = await worldManager.renameTag(currentWorld.id, migrationCandidate.oldId, migrationCandidate.newLabel);
             toast({ title: s('tagManager.toast.migrationComplete.title'), message: s('tagManager.toast.migrationComplete.message', { count, label: migrationCandidate.newLabel }), type: "success" });
             setMigrationCandidate(null);
             setEditingTagId(null);
             refreshWorld();
        } catch (e) {
             console.error("Migration failed", e);
             toast({ title: s('tagManager.toast.migrationFailed.title'), message: s('tagManager.toast.migrationFailed.message'), type: "error" });
        } finally {
             setIsMigrating(false);
        }
    };

    return (
        <div className="h-[calc(100vh-6rem)] animate-fade-in flex flex-col">
            <NexusSourceLayout 
                sources={sources} 
                selectedSource={selectedSource} 
                onSourceSelect={setSelectedSource}
                searchQuery={search}
                onSearchChange={setSearch}
                searchPlaceholder={s('tagManager.searchPlaceholder')}
                className="flex-1"
                actions={
                    <NexusButton onClick={() => setIsCreateOpen(true)} icon={<Plus size={16}/>}>
                        {s('tagManager.newTag')}
                    </NexusButton>
                }
            >
                {isLoadingTags ? (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 className="animate-spin text-nexus-accent" size={32} />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
                         {filteredTags.map(tag => {
                            const isEditing = editingTagId === tag.id;
                            if (isEditing) {
                                return (
                                    <div key={tag.id} className="bg-nexus-950 border-2 border-nexus-accent p-4 rounded-xl shadow-2xl relative">
                                        <h3 className="text-xs font-bold text-nexus-accent uppercase mb-4 flex items-center gap-2">
                                            <Edit3 size={12}/> Editing '{tag.id}'
                                        </h3>
                                        <div className="space-y-4">
                                            <NexusInput label={s('tagManager.field.label')} value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                                            <NexusTextArea label={s('tagManager.field.description')} value={editDesc} onChange={e => setEditDesc(e.target.value)} className="h-20 text-xs" />
                                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                                                <button onClick={() => setEditingTagId(null)} className="px-3 py-1.5 rounded text-xs text-slate-400 hover:bg-white/5">{s('tagManager.button.cancel')}</button>
                                                <NexusButton onClick={handlePreSave} className="h-8 text-xs" icon={<Save size={12}/>}>{s('tagManager.button.save')}</NexusButton>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={tag.id} className="group bg-nexus-800 border border-slate-700 p-4 rounded-xl flex justify-between items-start hover:border-nexus-accent/50 hover:shadow-lg transition-all h-full">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-bold text-white mb-1 flex items-center gap-2 truncate">
                                            <TagChip tagName={tag.label} color={tag.color || '#64748b'} className="pointer-events-none" />
                                        </div>
                                        {tag.description ? (
                                            <p className="text-xs text-slate-400 italic line-clamp-2 mt-2 leading-relaxed">"{tag.description}"</p>
                                        ) : (
                                            <p className="text-xs text-slate-600 italic mt-2">{s('tagManager.noDescription')}</p>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1 ml-2">
                                        <button onClick={() => startEdit(tag.id)} className="text-slate-600 hover:text-nexus-accent opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded hover:bg-nexus-900"><Edit3 size={14}/></button>
                                        <button onClick={() => initiateDelete(tag.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1.5 hover:bg-red-900/10 rounded"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            );
                        })}
                        {filteredTags.length === 0 && (
                            <div className="col-span-full text-center py-16">
                                <div className="text-slate-500 font-medium">{s('tagManager.noMatches')}</div>
                            </div>
                        )}
                    </div>
                )}
            </NexusSourceLayout>

            <NexusModal
                isOpen={!!migrationCandidate}
                onClose={() => setMigrationCandidate(null)}
                title={<span className="text-yellow-400 flex items-center gap-2"><AlertTriangle size={20}/> {s('tagManager.modal.confirmRenaming')}</span>}
                footer={
                    <div className="flex justify-end gap-2">
                        <NexusButton variant="ghost" onClick={() => setMigrationCandidate(null)}>{s('tagManager.button.cancel')}</NexusButton>
                        <NexusButton onClick={confirmMigration} disabled={isMigrating}>{isMigrating ? s('tagManager.button.migrating') : s('tagManager.button.confirmRename')}</NexusButton>
                    </div>
                }
            >
                <div className="space-y-4">
                    <p className="text-slate-300">
                        {s('tagManager.modal.renameBody', { old: migrationCandidate?.oldId || '', new: migrationCandidate?.newId || '' })}
                    </p>
                    <div className="bg-yellow-900/10 border border-yellow-500/30 p-3 rounded text-xs text-yellow-200">
                        {s('tagManager.modal.renameHint')}
                    </div>
                </div>
            </NexusModal>

            <NexusModal
                isOpen={!!deletingTagId}
                onClose={() => setDeletingTagId(null)}
                title={<span className="text-red-400 flex items-center gap-2"><Trash2 size={20}/> {s('tagManager.modal.deleteTag')}</span>}
                footer={
                     <div className="flex justify-end gap-2">
                        <NexusButton variant="ghost" onClick={() => setDeletingTagId(null)}>{s('tagManager.button.cancel')}</NexusButton>
                        <NexusButton variant="destructive" onClick={confirmDelete}>{s('common.delete')}</NexusButton>
                    </div>
                }
            >
                <div className="space-y-4">
                     <p className="text-slate-300">{s('tagManager.modal.deleteQuestion')}</p>
                     {isCalculatingImpact && <div className="text-xs text-slate-500 flex gap-2"><Loader2 className="animate-spin" size={12}/> {s('tagManager.modal.checkingUsage')}</div>}
                     {impactReport && (
                        <div className="bg-red-900/10 border border-red-500/30 p-3 rounded text-xs text-red-300">
                            <strong>{s('tagManager.modal.warningPrefix')}</strong> {s('tagManager.modal.usageWarning', { count: impactReport["Global Usage"] })}
                        </div>
                     )}
                </div>
            </NexusModal>

            <NexusModal
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                title={s('tagManager.modal.createNewTag')}
                footer={
                    <div className="flex justify-end gap-2">
                         <NexusButton variant="ghost" onClick={() => setIsCreateOpen(false)}>{s('tagManager.button.cancel')}</NexusButton>
                         <NexusButton onClick={handleCreateTag} disabled={isCreating}>
                             {isCreating ? <Loader2 className="animate-spin" /> : s('tagManager.button.createTag')}
                         </NexusButton>
                    </div>
                }
            >
                <div className="space-y-4">
                    <NexusInput label={s('tagManager.field.label')} value={newTagLabel} onChange={e => setNewTagLabel(e.target.value)} autoFocus placeholder={s('tagManager.placeholder.exampleLabel')} />
                    <NexusTextArea label={s('tagManager.field.description')} value={newTagDesc} onChange={e => setNewTagDesc(e.target.value)} placeholder={s('tagManager.placeholder.contextUsage')} />
                </div>
            </NexusModal>
        </div>
    );
};

export default TagManagerPage;