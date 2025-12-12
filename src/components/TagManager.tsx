import React, { useState } from 'react';
import { useWorld } from '../hooks/useWorld';
import { Plus, X, Edit2, Save } from 'lucide-react';
import { NexusInput, NexusTextArea, NexusModal, NexusButton } from './ui';
import { TagChip } from './TagChip';

interface TagManagerProps {
    worldId: string;
    poolTags: string[]; // IDs
    onChange: (tags: string[]) => void;
    allowAdding?: boolean; 
}

export const TagManager: React.FC<TagManagerProps> = ({ worldId, poolTags, onChange, allowAdding = true }) => {
    const { currentWorld, worldManager, refreshWorld } = useWorld();
    const [newTagInput, setNewTagInput] = useState('');
    const [editingTagId, setEditingTagId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');

    // Impact Modal State
    const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
    const [impactReport, setImpactReport] = useState<Record<string, string[]> | null>(null);

    if (!currentWorld) return null;

    const handleAdd = () => {
        const input = newTagInput.trim();
        if (!input) return;

        // Ensure tag exists in registry (creates ID)
        const id = worldManager.ensureTag(currentWorld, input);

        if (poolTags.includes(id)) {
            alert(`Tag '${input}' (ID: ${id}) already exists in this list.`);
            return;
        }

        worldManager.saveWorld(currentWorld); // Persist registry update
        onChange([...poolTags, id]);
        setNewTagInput('');
    };

    const initiateDelete = (tagId: string) => {
        // Just removing from this pool's suggestion list, not global delete
        onChange(poolTags.filter(t => t !== tagId));
    };

    const startEdit = (tagId: string) => {
        const def = currentWorld.tags[tagId];
        setEditingTagId(tagId);
        setEditName(def?.label || tagId);
        setEditDesc(def?.description || '');
    };

    const saveEdit = () => {
        if (!editingTagId) return;
        worldManager.updateTagDefinition(worldId, editName, editDesc);
        refreshWorld();
        setEditingTagId(null);
    };

    return (
        <div className="space-y-4">
            {/* Add Bar */}
            {allowAdding && (
                <div className="flex gap-2">
                    <NexusInput 
                        placeholder="Add new tag to this pool..." 
                        value={newTagInput} 
                        onChange={e => setNewTagInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                    <button onClick={handleAdd} className="bg-nexus-800 border border-slate-600 px-3 rounded text-slate-300 hover:text-white hover:border-nexus-accent">
                        <Plus size={16} />
                    </button>
                </div>
            )}

            {/* Flex Grid */}
            <div className="flex flex-wrap gap-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar content-start">
                {poolTags.map(tagId => {
                    const isEditing = editingTagId === tagId;
                    const meta = worldManager.getTagMetadata(worldId, tagId);
                    const def = currentWorld.tags[tagId];

                    if (isEditing) {
                        return (
                            <div key={tagId} className="w-full bg-nexus-950 border border-nexus-accent rounded p-3 space-y-3 animate-fade-in">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-nexus-accent uppercase">Editing Tag Definition</span>
                                    <button onClick={() => setEditingTagId(null)} className="text-slate-500 hover:text-white"><X size={14}/></button>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <NexusInput 
                                        label="Display Label" 
                                        value={editName} 
                                        onChange={e => setEditName(e.target.value)} 
                                    />
                                    <NexusTextArea 
                                        label="Description / Tooltip" 
                                        value={editDesc} 
                                        onChange={e => setEditDesc(e.target.value)} 
                                        placeholder="What does this tag mean?"
                                        className="h-[42px]"
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <button onClick={saveEdit} className="bg-nexus-accent text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2">
                                        <Save size={14} /> Save Changes
                                    </button>
                                </div>
                            </div>
                        )
                    }

                    return (
                        <TagChip 
                            key={tagId}
                            tagName={meta.label}
                            color={meta.color}
                            description={def?.description}
                            isGlobal={meta.isGlobal}
                            onEdit={() => startEdit(tagId)}
                            onRemove={() => initiateDelete(tagId)}
                        />
                    );
                })}
            </div>
        </div>
    );
};