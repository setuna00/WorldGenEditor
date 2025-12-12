import React, { useState, useEffect, useMemo } from 'react';
import { useWorld } from '../hooks/useWorld';
import { ComponentDefinition, ComponentFieldType } from '../types';
import { NexusButton, NexusInput, NexusSelect, NexusModal, NexusTextArea } from '../components/ui';
import { 
    Box, Plus, Trash2, Edit3, X, Save, GripVertical, AlertTriangle, 
    Cuboid, Folder, Calculator
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { WeightPieChart } from '../components/WeightPieChart'; 
import { useStrings } from '../lib/translations';

interface RarityLevel {
    id: string;
    label: string;
    weight: number;
    color: string;
}

interface UIField {
    _uiId: string;
    key: string;
    type: ComponentFieldType;
    defaultValue: string | number | boolean;
    options: string[];
}

const SYSTEM_CATEGORIES = ['System', 'Core'];
const POOL_CATEGORIES = ['General'];

export const ComponentManager: React.FC = () => {
    const { currentWorld, worldManager, refreshWorld } = useWorld();
    const { toast } = useToast();
    const { s } = useStrings();
    
    // Core State
    const [components, setComponents] = useState<ComponentDefinition[]>([]);
    const [editingDef, setEditingDef] = useState<ComponentDefinition | null>(null);
    const [newCompName, setNewCompName] = useState('');
    const [newCompCategory, setNewCompCategory] = useState('');
    const [newCompDesc, setNewCompDesc] = useState('');

    // Field Editor State
    const [editFields, setEditFields] = useState<UIField[]>([]);

    // Rarity Editor State
    const [rarityLevels, setRarityLevels] = useState<RarityLevel[]>([]);

    // Deletion State
    const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
    const [deleteReport, setDeleteReport] = useState<any>(null);

    if (!currentWorld) return null;

    useEffect(() => {
        setComponents(Object.values(currentWorld.componentRegistry));
    }, [currentWorld, refreshWorld]);

    const availableCategories = useMemo(() => {
        const poolNames = Object.keys(currentWorld.pools).map(p => 
            p.charAt(0).toUpperCase() + p.slice(1)
        );
        return Array.from(new Set([...POOL_CATEGORIES, ...poolNames])).sort();
    }, [currentWorld.pools]);

    const groupedComponents = useMemo(() => {
        const groups: Record<string, ComponentDefinition[]> = {};
        components.forEach(c => {
            const cat = c.category || 'General';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(c);
        });
        return groups;
    }, [components]);

    // --- Handlers ---

    const handleSelectComponent = (def: ComponentDefinition) => {
        setEditingDef(def);
        setNewCompName(def.label);
        setNewCompCategory(def.category || 'General');
        setNewCompDesc(def.description || '');

        if (def.id === 'rarity') {
            const levels = currentWorld.config.raritySettings?.levels || [];
            setRarityLevels(levels.map(l => ({...l, id: l.id || crypto.randomUUID()})));
            setEditFields([]); // Clear generic fields
        } else {
            const mappedFields: UIField[] = def.fields.map(f => ({
                _uiId: crypto.randomUUID(),
                key: f.key,
                type: f.type,
                defaultValue: f.defaultValue,
                options: f.options || []
            }));
            setEditFields(mappedFields);
            setRarityLevels([]); // Clear rarity
        }
    };

    const handleCreateNew = () => {
        setEditingDef(null);
        setTimeout(() => {
            setNewCompName('');
            setNewCompCategory('General');
            setNewCompDesc('');
            setEditFields([]); 
            setRarityLevels([]);
        }, 0);
    };

    const handleSave = async () => {
        if (!newCompName.trim()) {
            toast({ title: s('componentManager.toast.validationError.title'), message: s('componentManager.toast.validationError.message'), type: "warning" });
            return;
        }

        const id = editingDef?.id || newCompName.trim().toLowerCase().replace(/\s+/g, '_');
        let finalFields: any[] = [];

        if (id === 'metadata') {
             toast({ title: s('componentManager.toast.accessDenied.title'), message: s('componentManager.toast.accessDenied.message'), type: "error" });
             return;
        }

        if (id === 'rarity') {
            const options = rarityLevels.map(r => r.label);
            const defaultLevel = rarityLevels.length > 0 ? rarityLevels[0].label : 'Common';
            
            finalFields = [{
                key: 'value',
                type: 'select',
                defaultValue: defaultLevel,
                options: options
            }];

            const updatedConfig = {
                ...currentWorld.config,
                raritySettings: {
                    defaultLevel: defaultLevel,
                    levels: rarityLevels.map(r => ({
                        id: r.label.toLowerCase(),
                        label: r.label,
                        weight: parseFloat(String(r.weight)) || 1,
                        color: r.color
                    }))
                }
            };
            await worldManager.updateWorldConfig(currentWorld.id, currentWorld.name, updatedConfig);
        } else {
            finalFields = editFields.map(f => {
                let parsedDefault: any = f.defaultValue;
                
                if (f.type === 'number') {
                    const isInt = f.options?.[0] === 'integer';
                    const num = parseFloat(String(f.defaultValue));
                    parsedDefault = isInt ? Math.floor(num || 0) : (num || 0);
                }
                
                if (f.type === 'boolean') {
                    parsedDefault = String(f.defaultValue) === 'true';
                }

                return {
                    key: f.key.trim() || 'untitled_field',
                    type: f.type,
                    defaultValue: parsedDefault,
                    options: f.options 
                };
            });
        }

        const def: ComponentDefinition = {
            id,
            label: newCompName,
            description: newCompDesc,
            category: newCompCategory,
            fields: finalFields,
            isCore: editingDef?.isCore || false
        };

        try {
            await worldManager.registerComponentDefinition(currentWorld.id, def);
            toast({ title: s('componentManager.toast.schemaUpdated.title'), message: s('componentManager.toast.schemaUpdated.message', { label: def.label }), type: "success" });
            refreshWorld();
            handleSelectComponent(def); 
        } catch (e: any) {
            toast({ title: s('componentManager.toast.saveFailed.title'), message: e.message, type: "error" });
        }
    };

    const initiateDelete = async (id: string) => {
        const def = components.find(c => c.id === id);
        if (def?.isCore) {
            toast({ title: s('componentManager.toast.systemProtected.title'), message: s('componentManager.toast.systemProtected.message'), type: "error" });
            return;
        }
        
        const report = await worldManager.getComponentUsageReport(currentWorld.id, id);
        setDeleteReport(report);
        setDeleteCandidate(id);
    };

    const confirmDelete = async () => {
        if (!deleteCandidate) return;
        try {
            await worldManager.deleteComponentDefinition(currentWorld.id, deleteCandidate);
            refreshWorld();
            if (editingDef?.id === deleteCandidate) handleCreateNew();
            
            toast({ title: s('componentManager.toast.deleted.title'), message: s('componentManager.toast.deleted.message'), type: "info" });
            setDeleteCandidate(null);
        } catch (e: any) {
            toast({ title: s('componentManager.toast.deletionFailed.title'), message: e.message, type: "error" });
        }
    };

    // --- Generic Field Helpers ---

    const addField = () => {
        setEditFields([...editFields, { 
            _uiId: crypto.randomUUID(), 
            key: 'new_field', 
            type: 'text', 
            defaultValue: '', 
            options: [] 
        }]);
    };
    
    const removeField = (idx: number) => {
        setEditFields(editFields.filter((_, i) => i !== idx));
    };

    const updateField = (idx: number, key: keyof UIField, val: any) => {
        const n = [...editFields];
        if (key === 'defaultValue' && n[idx].type === 'number' && n[idx].options?.[0] === 'integer') {
            const strVal = String(val);
            if (strVal !== '' && strVal !== '-') {
                if (!/^-?\d+$/.test(strVal)) return; 
            }
        }
        n[idx] = { ...n[idx], [key]: val };
        
        if (key === 'type') {
            if (val === 'boolean') n[idx].defaultValue = 'false';
            if (val === 'number') n[idx].defaultValue = 0;
            if (val === 'text') n[idx].defaultValue = '';
            if (val === 'date') n[idx].defaultValue = '';
            n[idx].options = []; 
        }
        setEditFields(n);
    };

    const addOption = (fIdx: number) => {
        const n = [...editFields];
        let baseName = 'New Option';
        let counter = 1;
        while (n[fIdx].options.includes(baseName)) {
            baseName = `New Option ${counter++}`;
        }
        n[fIdx].options.push(baseName);
        setEditFields(n);
    };

    const updateOption = (fIdx: number, oIdx: number, val: string) => {
        const n = [...editFields];
        n[fIdx].options[oIdx] = val;
        setEditFields(n);
    };

    const removeOption = (fIdx: number, oIdx: number) => {
        const n = [...editFields];
        n[fIdx].options = n[fIdx].options.filter((_, i) => i !== oIdx);
        setEditFields(n);
    };

    // --- Rarity Helpers ---

    const addRarityLevel = () => {
        setRarityLevels([...rarityLevels, { 
            id: crypto.randomUUID(), 
            label: 'New Tier', 
            weight: 10, 
            color: '#64748b' 
        }]);
    };

    const updateRarity = (idx: number, field: keyof RarityLevel, val: any) => {
        const n = [...rarityLevels];
        n[idx] = { ...n[idx], [field]: val };
        setRarityLevels(n);
    };

    const removeRarity = (idx: number) => {
        setRarityLevels(rarityLevels.filter((_, i) => i !== idx));
    };

    // --- Renderers ---

    const renderCategorySelector = () => (
        <div>
            <label className="block text-xs text-slate-500 uppercase font-bold mb-1.5 tracking-wide">{s('componentManager.label.category')}</label>
            <div className="relative">
                <select
                    value={newCompCategory}
                    onChange={e => setNewCompCategory(e.target.value)}
                    disabled={editingDef?.isCore}
                    className="w-full bg-nexus-900 border border-slate-600 rounded p-2.5 text-sm text-slate-200 outline-none focus:border-nexus-accent appearance-none cursor-pointer"
                >
                    {SYSTEM_CATEGORIES.includes(newCompCategory) && (
                        <option value={newCompCategory}>{newCompCategory} (System)</option>
                    )}
                    {availableCategories.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
                <div className="absolute right-3 top-3 pointer-events-none text-slate-500">
                    <Folder size={14} />
                </div>
            </div>
        </div>
    );

    const renderRarityEditor = () => {
        const totalWeight = rarityLevels.reduce((sum, r) => sum + (parseFloat(String(r.weight)) || 0), 0);

        return (
            <div className="space-y-6 animate-in fade-in">
                <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-lg flex gap-4 items-center">
                    <div className="p-2 bg-blue-900/50 rounded-full text-blue-400"><Calculator size={20} /></div>
                    <div>
                        <h4 className="font-bold text-blue-200 text-sm">{s('componentManager.probabilityEngine')}</h4>
                        <p className="text-xs text-blue-300/70">
                            Define tiers. Weights determine roll probability automatically.
                            {s('componentManager.totalWeight')} <span className="font-mono text-white">{totalWeight}</span>
                        </p>
                    </div>
                    <div className="ml-auto">
                        <WeightPieChart data={rarityLevels} size={60} />
                    </div>
                </div>

                <div className="space-y-2">
                    {rarityLevels.map((lvl, idx) => {
                        const prob = totalWeight > 0 ? ((lvl.weight / totalWeight) * 100).toFixed(1) : '0.0';
                        return (
                            <div key={lvl.id} className="flex gap-2 items-center bg-nexus-900 p-2 rounded border border-slate-700">
                                <div className="w-8 h-8 rounded shrink-0 border border-slate-600 overflow-hidden" style={{backgroundColor: lvl.color}}>
                                    <input type="color" className="opacity-0 w-full h-full cursor-pointer" value={lvl.color} onChange={e => updateRarity(idx, 'color', e.target.value)} />
                                </div>
                                <div className="flex-1">
                                    <NexusInput 
                                        value={lvl.label} 
                                        onChange={e => updateRarity(idx, 'label', e.target.value)} 
                                        placeholder="Label"
                                        className="text-sm font-bold"
                                    />
                                </div>
                                <div className="w-20">
                                    <input 
                                        type="number" 
                                        value={lvl.weight} 
                                        onChange={e => updateRarity(idx, 'weight', parseFloat(e.target.value))} 
                                        className="bg-nexus-900 border border-slate-700 rounded px-2 py-1 text-xs text-right w-full outline-none focus:border-nexus-accent text-slate-200" 
                                    />
                                </div>
                                <div className="w-12 text-right text-xs text-slate-500 font-mono pt-1">
                                    {prob}%
                                </div>
                                <button onClick={() => removeRarity(idx)} className="p-1 hover:text-red-400 text-slate-600"><Trash2 size={14}/></button>
                            </div>
                        );
                    })}
                    <button onClick={addRarityLevel} className="w-full py-2 border border-dashed border-slate-700 rounded text-xs text-slate-500 hover:text-white hover:border-slate-500 transition-colors flex justify-center items-center gap-2">
                        <Plus size={14} /> Add Rarity Tier
                    </button>
                </div>
            </div>
        );
    };

    const renderMetadataView = () => (
        <div className="space-y-4 animate-in fade-in">
            <div className="bg-yellow-900/20 border border-yellow-500/30 p-4 rounded-lg flex gap-3 items-start">
                <AlertTriangle className="text-yellow-500 shrink-0 mt-0.5" size={18} />
                <div className="text-sm">
                    <strong className="text-yellow-200 block mb-1">{s('componentManager.systemComponent')}</strong>
                    <span className="text-yellow-200/70">
                        This component defines critical entity identity. Schema fields are visible for reference but cannot be modified to prevent database corruption.
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 opacity-75 pointer-events-none grayscale-[0.5]">
                {editingDef?.fields.map((field, i) => (
                    <div key={i} className="bg-nexus-900 border border-slate-700 rounded-lg p-4 flex gap-4">
                         <div className="flex-1">
                             <label className="block text-xs text-slate-500 uppercase font-bold mb-1.5">{s('componentManager.key')}</label>
                             <div className="text-sm font-mono text-slate-300 border-b border-slate-700 pb-1">{field.key}</div>
                         </div>
                         <div className="w-32">
                             <label className="block text-xs text-slate-500 uppercase font-bold mb-1.5">{s('componentManager.type')}</label>
                             <div className="text-sm text-slate-400 border-b border-slate-700 pb-1">{field.type}</div>
                         </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderDefaultValueInput = (field: UIField, i: number) => {
        switch (field.type) {
            case 'boolean':
                return (
                    <NexusSelect 
                        label={s('componentManager.defaultState')}
                        value={String(field.defaultValue)} 
                        onChange={e => updateField(i, 'defaultValue', e.target.value)}
                    >
                        <option value="false">False</option>
                        <option value="true">True</option>
                    </NexusSelect>
                );
            case 'select':
                return (
                    <NexusSelect
                        label={s('componentManager.defaultSelection')}
                        value={String(field.defaultValue)}
                        onChange={e => updateField(i, 'defaultValue', e.target.value)}
                    >
                        <option value="">-- Select Default --</option>
                        {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </NexusSelect>
                );
            case 'number':
                return (
                    <div className="flex gap-2">
                         <div className="flex-1">
                            <NexusInput 
                                type="text" 
                                inputMode={field.options?.[0] === 'integer' ? 'numeric' : 'decimal'}
                                label={s('componentManager.default')}
                                value={String(field.defaultValue)} 
                                onChange={e => updateField(i, 'defaultValue', e.target.value)} 
                            />
                        </div>
                        <div className="w-32">
                            <NexusSelect 
                                label={s('componentManager.constraint')}
                                value={field.options?.[0] || 'float'} 
                                onChange={e => {
                                    const n = [...editFields];
                                    n[i].options = [e.target.value];
                                    setEditFields(n);
                                }}
                            >
                                <option value="float">{s('componentManager.float')}</option>
                                <option value="integer">{s('componentManager.integer')}</option>
                            </NexusSelect>
                        </div>
                    </div>
                );
            case 'date':
                return (
                    <NexusInput 
                        type="date" 
                        label={s('componentManager.defaultDate')}
                        value={String(field.defaultValue)} 
                        onChange={e => updateField(i, 'defaultValue', e.target.value)} 
                    />
                );
            case 'text':
            default:
                return <NexusInput label={s('componentManager.defaultText')} value={String(field.defaultValue)} onChange={e => updateField(i, 'defaultValue', e.target.value)} />;
        }
    };

    const renderGenericEditor = () => (
        <div className="space-y-4 animate-in fade-in">
             <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2">
                    <GripVertical size={14} /> Schema Fields
                </h3>
                <button onClick={addField} className="text-xs font-bold text-nexus-accent hover:text-white flex items-center gap-1 bg-nexus-900 px-3 py-1.5 rounded border border-nexus-accent/30 hover:bg-nexus-accent transition-colors">
                    <Plus size={12} /> Add Field
                </button>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
                {editFields.map((field, i) => (
                    <div key={field._uiId} className="bg-nexus-900 border border-slate-700 rounded-lg p-4 relative group hover:border-nexus-accent/50 transition-colors">
                        <button onClick={() => removeField(i)} className="absolute top-3 right-3 text-slate-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-all"><X size={14} /></button>
                         <div className="flex flex-col gap-4 mb-2">
                             <div className="flex gap-4">
                                <div className="flex-1">
                                    <NexusInput label={s('componentManager.fieldKey')} value={field.key} onChange={e => updateField(i, 'key', e.target.value)} className="font-mono" placeholder="property_name" />
                                </div>
                                <div className="w-40">
                                    <NexusSelect label={s('componentManager.dataType')} value={field.type} onChange={e => updateField(i, 'type', e.target.value)}>
                                        <option value="text">Text (String)</option>
                                        <option value="number">Number</option>
                                        <option value="boolean">Boolean</option>
                                        <option value="date">Date</option>
                                        <option value="select">Select Menu</option>
                                    </NexusSelect>
                                </div>
                             </div>
                             <div className="w-full">
                                {renderDefaultValueInput(field, i)}
                             </div>
                         </div>

                         {field.type === 'select' && (
                             <div className="mt-2 pl-4 border-l-2 border-slate-800">
                                <label className="text-xs uppercase font-bold text-slate-500 mb-2 block">{s('componentManager.dropdownOptions')}</label>
                                 <div className="flex flex-wrap gap-2">
                                     {field.options.map((opt, oIdx) => (
                                         <div key={oIdx} className="flex items-center bg-nexus-950 border border-slate-700 rounded px-2 py-1">
                                             <NexusInput 
                                                value={opt} 
                                                onChange={e => updateOption(i, oIdx, e.target.value)} 
                                                className="text-xs text-slate-200 w-24"
                                             />
                                             <button onClick={() => removeOption(i, oIdx)} className="ml-2 text-slate-600 hover:text-red-400"><X size={10}/></button>
                                         </div>
                                     ))}
                                     <button onClick={() => addOption(i)} className="text-xs bg-nexus-accent/20 text-nexus-accent px-2 rounded border border-nexus-accent/30 hover:bg-nexus-accent hover:text-white transition-colors">
                                         + Add Option
                                     </button>
                                 </div>
                             </div>
                         )}
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="flex h-[calc(100vh-6rem)] gap-6 pb-6 animate-fade-in">
            <div className="w-64 bg-nexus-800 border border-slate-700 rounded-xl flex flex-col overflow-hidden shadow-lg shrink-0">
                <div className="p-4 bg-nexus-900 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <Cuboid size={14} className="text-nexus-accent"/> Registry
                    </h3>
                    <button onClick={handleCreateNew} className="text-nexus-accent hover:text-white p-1 rounded hover:bg-slate-800 transition-colors">
                        <Plus size={16} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar">
                    {Object.entries(groupedComponents).map(([category, items]) => (
                        <div key={category}>
                            <div className="px-2 mb-1 text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                <Folder size={10} /> {category}
                            </div>
                            <div className="space-y-1">
                                {items.map(def => (
                                    <button
                                        key={def.id}
                                        onClick={() => handleSelectComponent(def)}
                                        className={`w-full text-left px-3 py-2.5 rounded text-xs font-medium flex items-center justify-between group transition-all ${
                                            editingDef?.id === def.id 
                                            ? 'bg-nexus-accent text-white shadow-md' 
                                            : 'text-slate-400 hover:bg-nexus-900 hover:text-slate-200'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2 truncate">
                                            <Box size={14} className={editingDef?.id === def.id ? "opacity-100" : "opacity-50"} /> 
                                            {def.label}
                                        </span>
                                        {!def.isCore && (
                                            <span 
                                                onClick={(e) => { e.stopPropagation(); initiateDelete(def.id); }}
                                                className="opacity-0 group-hover:opacity-100 hover:text-red-300 p-1 rounded hover:bg-black/20"
                                            >
                                                <Trash2 size={12} />
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 bg-nexus-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
                <div className="p-6 border-b border-slate-700 bg-nexus-900 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                             {editingDef ? (
                                 <><Edit3 size={24} className="text-nexus-accent"/> Edit Schema: <span className="text-white">{editingDef.label}</span></>
                             ) : (
                                 <><Plus size={24} className="text-nexus-accent"/> Create Component</>
                             )}
                        </h2>
                        <div className="flex gap-2 mt-1">
                            {editingDef?.isCore && <span className="text-xs bg-purple-500/20 text-purple-300 px-2 rounded border border-purple-500/30 uppercase font-bold">System Core</span>}
                            <span className="text-xs text-slate-500 font-mono">ID: {editingDef ? editingDef.id : 'new_component'}</span>
                        </div>
                    </div>
                    {editingDef?.id !== 'metadata' && (
                        <NexusButton onClick={handleSave} icon={<Save size={16} />}>Save Definition</NexusButton>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    <div className="bg-nexus-950/50 p-4 rounded-lg border border-slate-800 mb-4 text-xs text-slate-400">
                        <strong className="text-nexus-accent">Developer Note:</strong> This is a low-level schema editor. 
                        Changes made here affect how the database stores data. 
                        To change how entities interact, use the <strong>Pool Configuration</strong> or <strong>Rules</strong> engine.
                    </div>

                    <div className="grid grid-cols-2 gap-4 max-w-2xl">
                        <NexusInput 
                            label="Component Label" 
                            value={newCompName} 
                            onChange={e => setNewCompName(e.target.value)}
                            disabled={editingDef?.isCore}
                            placeholder="e.g. Combat Stats"
                        />
                         {renderCategorySelector()}
                    </div>

                    <div className="max-w-2xl">
                        <NexusTextArea 
                            label="AI Context Description"
                            value={newCompDesc}
                            onChange={e => setNewCompDesc(e.target.value)}
                            placeholder="Explain to the AI what this component represents (e.g. 'Physical attributes determining damage output')..."
                            className="h-20 text-xs"
                        />
                    </div>

                    {editingDef?.id === 'metadata' ? (
                        renderMetadataView()
                    ) : editingDef?.id === 'rarity' ? (
                        renderRarityEditor()
                    ) : (
                        renderGenericEditor()
                    )}
                </div>
            </div>

            <NexusModal
                isOpen={!!deleteCandidate}
                onClose={() => { setDeleteCandidate(null); setDeleteReport(null); }}
                title={<span className="flex items-center gap-2 text-red-400"><AlertTriangle size={20}/> Delete Component</span>}
            >
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        Permanently delete <strong>{deleteCandidate}</strong>?
                    </p>
                    
                    {deleteReport && deleteReport.entityCount > 0 && (
                        <div className="bg-red-900/10 border border-red-500/30 p-4 rounded-lg text-sm">
                            <div className="text-red-400 font-bold mb-2 uppercase tracking-wide text-xs">Usage Warning</div>
                            <p className="text-slate-300 text-xs mb-1">
                                Used by <strong>{deleteReport.entityCount} entities</strong> across {deleteReport.pools.length} pools.
                            </p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <NexusButton variant="ghost" onClick={() => { setDeleteCandidate(null); setDeleteReport(null); }}>Cancel</NexusButton>
                        <NexusButton variant="destructive" onClick={confirmDelete}>Confirm Deletion</NexusButton>
                    </div>
                </div>
            </NexusModal>
        </div>
    );
};

export default ComponentManager;