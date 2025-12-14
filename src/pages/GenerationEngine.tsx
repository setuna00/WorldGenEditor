// nexus-generator/src/pages/GenerationEngine.tsx
import React, { useContext, useState, useEffect, useMemo } from 'react';
import { useWorld } from '../hooks/useWorld';
import { LogContext } from '../contexts/LogContext';
import { useToast } from '../contexts/ToastContext';
import { useAIService } from '../contexts/AIServiceContext';
import { GenerationStage } from '../services/ai/fallbackRouter';
import { UniversalEntity, Pool, ReferenceItem } from '../types';
import { Save, Check, Trash2, Link2, Plus, ArrowRight, X, Sliders, Cuboid, BookOpen, User, Wand2, ArrowUpRight, Minus, HelpCircle, Tag } from 'lucide-react';
import { TagInput, LogViewer, ContextSelectorModal } from '../components/SharedForgeComponents';
import { buildSchemaForPool } from '../services/schemaBuilder';
import { EntityUtils } from '../utils/entityUtils';
import { NexusButton, NexusSelect, NexusTextArea, NexusInput } from '../components/ui';
import { PortalTooltip } from '../components/PortalTooltip';
import { db } from '../services/db'; 
import { useTranslation } from '../lib/translations';
import { useStrings } from '../lib/translations';

interface GenerationEngineProps {
    defaultMode?: 'Lore' | 'Character' | 'Asset';
}

const GenerationEngine: React.FC<GenerationEngineProps> = ({ defaultMode = 'Asset' }) => {
    const { currentWorld, worldManager, refreshWorld, appSettings, forgeState, setForgeState } = useWorld();
    const { orchestrator, isConfigured: aiIsConfigured, settings: aiSettings } = useAIService();
    const logContext = useContext(LogContext);
    const { toast } = useToast(); 
    const t = useTranslation();
    const { s } = useStrings();
    
    if (!currentWorld || !logContext) return null;
    const { globalLogs, addGlobalLog, toggleGlobalLog } = logContext;

    // Core State
    const [mode, setMode] = useState<'Lore' | 'Character' | 'Asset'>(defaultMode);

    // Helper to safely retrieve saved state SC0PED BY MODE
    const getInitialState = () => {
        const key = `${currentWorld.id}_${mode}`;
        const saved = forgeState[key];
        if (saved) return saved;
        
        return {
            prompt: '',
            count: 1,
            targetPool: '',
            generatedItems: [],
            contextItems: [],
            selectedToneId: appSettings.tones?.[0]?.id || '',
            // Initialize with Global Default
            outputLength: appSettings.defaultOutputLength || 'Medium',
            strictTags: true, 
            requiredAttributes: [],
            negativeConstraints: []
        };
    };

    const initialState = getInitialState();
    
    const [prompt, setPrompt] = useState(initialState.prompt || '');
    const [count, setCount] = useState(initialState.count || 1);
    const [selectedPoolName, setSelectedPoolName] = useState(initialState.targetPool || '');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedItems, setGeneratedItems] = useState<UniversalEntity[]>(initialState.generatedItems || []);

    // Configuration
    const [language, setLanguage] = useState<'English' | 'Chinese'>(appSettings.defaultLanguage || 'English');
    
    const [selectedToneId, setSelectedToneId] = useState<string>(initialState.selectedToneId || '');
    const [outputLength, setOutputLength] = useState<'Short' | 'Medium' | 'Long'>((initialState.outputLength as any) || 'Medium');
    const [lengthPerField, setLengthPerField] = useState(false);
    
    // Strict Tags: true = Existing Tags Only, false = Allow New Tags
    const [strictTags, setStrictTags] = useState(initialState.strictTags !== undefined ? initialState.strictTags : true);

    // Advanced Constraints
    const [requiredAttributes, setRequiredAttributes] = useState<string[]>(initialState.requiredAttributes || []);
    const [negativeConstraints, setNegativeConstraints] = useState<string[]>(initialState.negativeConstraints || []);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Context
    const [contextItems, setContextItems] = useState<{ item: UniversalEntity, influence: string }[]>(initialState.contextItems || []);
    const [isContextSelectorOpen, setIsContextSelectorOpen] = useState(false);
    
    // Pool Counts
    const [poolCounts, setPoolCounts] = useState<Record<string, number>>({});

    // --- EFFECT: SYNC GLOBAL SETTINGS ---
    useEffect(() => {
        if (appSettings.defaultOutputLength) {
            setOutputLength(appSettings.defaultOutputLength);
        }
    }, [appSettings.defaultOutputLength]);

    // --- EFFECT: LOAD COUNTS ---
    useEffect(() => {
        const loadCounts = async () => {
            const counts = await db.getPoolCounts(currentWorld.id);
            setPoolCounts(counts);
        };
        loadCounts();
    }, [currentWorld.id, generatedItems]); 

    // --- PERSISTENCE: LOAD (Scoped by Mode) ---
    useEffect(() => {
        const key = `${currentWorld.id}_${mode}`;
        const savedState = forgeState[key];
        
        if (savedState) {
            setPrompt(savedState.prompt || '');
            setCount(savedState.count || 1);
            setSelectedPoolName(savedState.targetPool || '');
            setGeneratedItems(savedState.generatedItems || []);
            setContextItems(savedState.contextItems || []);
            setSelectedToneId(savedState.selectedToneId || '');
            if (savedState.outputLength) setOutputLength(savedState.outputLength);
            setStrictTags(savedState.strictTags !== undefined ? savedState.strictTags : true);
            setRequiredAttributes(savedState.requiredAttributes || []);
            setNegativeConstraints(savedState.negativeConstraints || []);
        } else {
            setPrompt('');
            setCount(1);
            setSelectedPoolName('');
            setGeneratedItems([]);
            setContextItems([]);
        }
    }, [currentWorld.id, mode]); 

    // --- PERSISTENCE: SAVE (Scoped by Mode) ---
    useEffect(() => {
        const stateToSave = {
            prompt,
            count,
            targetPool: selectedPoolName,
            generatedItems,
            contextItems,
            selectedToneId,
            outputLength,
            strictTags,
            selectedRarity: 'Common',
            requiredAttributes,
            negativeConstraints
        };
        const key = `${currentWorld.id}_${mode}`;
        setForgeState(key, stateToSave);
    }, [prompt, count, selectedPoolName, generatedItems, contextItems, selectedToneId, outputLength, strictTags, requiredAttributes, negativeConstraints, mode]);


    const availablePools = useMemo(() => {
        const pools = Object.values(currentWorld.pools) as Pool[];
        if (mode === 'Asset') return pools.filter(p => p.type === 'Asset');
        if (mode === 'Lore') return pools.filter(p => p.type === 'World');
        if (mode === 'Character') return pools.filter(p => p.type === 'Character');
        return [];
    }, [currentWorld, mode]); 

    useEffect(() => {
        const poolExists = availablePools.find(p => p.name === selectedPoolName);
        if (!poolExists) setSelectedPoolName('');
    }, [mode, availablePools]);

    const addContextItem = (item: UniversalEntity) => {
        if (!contextItems.some(c => c.item.id === item.id)) {
            let defaultInfl = s('forge.relationship.relatedTo');
            if (selectedPoolName) {
                const pool = currentWorld.pools[selectedPoolName];
                if (pool && pool.relationshipTypes && pool.relationshipTypes.length > 0) {
                    defaultInfl = pool.relationshipTypes[0]; 
                }
            }
            
            setContextItems([...contextItems, { item, influence: defaultInfl }]);
            toast({ title: s('forge.toast.contextAdded.title'), message: s('forge.toast.contextAdded.message', { name: item.name }), type: 'info' });
        }
        setIsContextSelectorOpen(false);
    };

    const handleGenerate = async () => {
        if (!aiIsConfigured) {
            toast({ title: s('forge.toast.configError.title'), message: s('forge.toast.configError.message'), type: 'error' });
            return;
        }
        if (!selectedPoolName) {
             toast({ title: s('forge.toast.missingSelection.title'), message: s('forge.toast.missingSelection.message'), type: 'warning' });
             return;
        }
        if (!prompt.trim()) {
            toast({ title: s('forge.toast.emptyPrompt.title'), message: s('forge.toast.emptyPrompt.message'), type: 'warning' });
            return;
        }

        setIsGenerating(true);
        setGeneratedItems([]); 
        
        let worldContext = worldManager.generateContextString(currentWorld);
        const targetPool = currentWorld.pools[selectedPoolName];
        if (targetPool.relationshipTypes && targetPool.relationshipTypes.length > 0) {
            worldContext += `\nALLOWED RELATIONSHIP TYPES: [${targetPool.relationshipTypes.join(', ')}]`;
        }

        if (currentWorld.config.useGlobalPromptPrefix && appSettings.globalPromptPrefix) {
            worldContext = `[GLOBAL INSTRUCTION]: ${appSettings.globalPromptPrefix}\n\n${worldContext}`;
        }

        try {
            const referenceItems: ReferenceItem[] = contextItems.map(c => ({
                id: c.item.id,
                name: c.item.name,
                description: EntityUtils.getDescription(c.item),
                tags: c.item.tags,
                relationType: c.influence
            }));

            let allowedTags: string[] = targetPool.suggestedTags || [];
            
            if (strictTags) {
                const globalTopTags = worldManager.getAllTags(currentWorld.id).slice(0, 50);
                allowedTags = Array.from(new Set([...allowedTags, ...globalTopTags]));
            } else {
                allowedTags = targetPool.suggestedTags || [];
            }
            
            const normalizedAllowedTags = allowedTags.map(tagId => 
                worldManager.getTagMetadata(currentWorld.id, tagId).label
            );

            const toneDef = appSettings.tones.find(t => t.id === selectedToneId);
            const toneInstruction = toneDef ? toneDef.instruction : 'Standard RPG style';
            
            const activeComponents = Object.keys(targetPool.defaultComponents);
            const componentContext = activeComponents.map(id => {
                const def = currentWorld.componentRegistry[id];
                return def ? `${def.label}: ${def.description || 'No specific description.'}` : null;
            }).filter(Boolean) as string[];

            const commonOptions = { 
                language,
                contextItems: referenceItems,
                toneInstruction,
                lengthInstruction: appSettings.lengthDefinitions[outputLength.toLowerCase() as keyof typeof appSettings.lengthDefinitions],
                lengthPerField,
                strictTags,
                tagDefinitions: componentContext, 
                attributes: requiredAttributes,
                negativeConstraints: negativeConstraints,
                allowedTags: normalizedAllowedTags.length > 0 ? normalizedAllowedTags : undefined
            };

            const dynamicSchema = buildSchemaForPool(targetPool, currentWorld.componentRegistry);
            const logTitle = `${mode} Forge - ${selectedPoolName} - Batch: ${count}`;
            
            const validComponentIds = Object.keys(targetPool.defaultComponents);

            const batchResult = await orchestrator.generateBatch(
                targetPool.name,
                prompt,
                count,
                worldContext,
                commonOptions,
                dynamicSchema,
                validComponentIds,
                { stage: 'batch' as GenerationStage }
            );
            
            if (!batchResult.success || !batchResult.data) {
                throw new Error(batchResult.error?.message || 'Batch generation failed');
            }
            
            let ecsEntities = batchResult.data;
            
            // Log the generation
            addGlobalLog(logTitle, prompt, JSON.stringify(ecsEntities, null, 2));

            const processedEntities = await Promise.all(ecsEntities.map(async (entity) => {
                const cleanTags: string[] = [];
                for (const t of entity.tags) {
                    if (t.includes('|')) {
                        const [label, desc] = t.split('|');
                        const id = worldManager.ensureTag(currentWorld, label);
                        if (currentWorld.tags[id]) currentWorld.tags[id].description = desc;
                        
                        const existingEntities = await db.searchEntities(currentWorld.id, label, 1);
                        if (existingEntities.length === 0) {
                            cleanTags.push(id);
                        }
                    } else {
                        const existingEntities = await db.searchEntities(currentWorld.id, t, 1);
                        if (existingEntities.length === 0) {
                            if (strictTags) {
                                if (currentWorld.tags[t]) cleanTags.push(t);
                            } else {
                                cleanTags.push(t);
                            }
                        }
                    }
                }
                
                await worldManager.saveWorld(currentWorld);

                return {
                    ...entity,
                    tags: cleanTags
                };
            }));

            setGeneratedItems(processedEntities);
            toast({ title: s('forge.toast.complete.title'), message: s('forge.toast.complete.message', { count: processedEntities.length }), type: 'success' });

        } catch (e: any) {
            toast({ title: s('forge.toast.generationFailed.title'), message: e.message || 'Unknown error', type: 'error' });
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    const persistTags = async (entities: UniversalEntity[]) => {
        let dirty = false;
        entities.forEach(ent => {
            ent.tags.forEach(tag => {
                if (!strictTags && !currentWorld.tags[tag]) {
                    worldManager.ensureTag(currentWorld, tag);
                    dirty = true;
                }
            });
        });
        if (dirty) await worldManager.saveWorld(currentWorld);
    };

    const saveItem = async (entity: UniversalEntity) => {
        await persistTags([entity]);
        await worldManager.saveEntityToPool(currentWorld.id, selectedPoolName, entity);
        refreshWorld();
        setGeneratedItems(prev => prev.filter(i => i.id !== entity.id));
        toast({ title: s('forge.toast.saved.title'), message: s('forge.toast.saved.message', { name: entity.name, pool: selectedPoolName }), type: 'success' });
    };

    const saveAll = async () => {
        await persistTags(generatedItems);
        await worldManager.saveEntitiesToPool(currentWorld.id, selectedPoolName, generatedItems);
        refreshWorld();
        setGeneratedItems([]);
        toast({ title: s('forge.toast.batchSaved.title'), message: s('forge.toast.batchSaved.message'), type: 'success' });
    };

    const getModeMeta = () => {
        switch(mode) {
            case 'Lore': return { color: 'text-purple-400', icon: BookOpen, label: t.forge.modes.lore.label, desc: t.forge.modes.lore.desc };
            case 'Character': return { color: 'text-nexus-accent', icon: User, label: t.forge.modes.character.label, desc: t.forge.modes.character.desc };
            default: return { color: 'text-orange-400', icon: Cuboid, label: t.forge.modes.asset.label, desc: t.forge.modes.asset.desc };
        }
    }
    const meta = getModeMeta();
    const ModeIcon = meta.icon;
    
    const targetPoolObj = currentWorld.pools[selectedPoolName];
    const relationshipOptions = targetPoolObj?.relationshipTypes || [];

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-fade-in">
            <header className="flex items-start justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
                        <ModeIcon className={meta.color} size={32} />
                        {meta.label}
                    </h2>
                    <p className="text-slate-400 mt-2">{meta.desc}</p>
                </div>
                <div className="text-right hidden md:block">
                     <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{s('forge.usingModel')}</div>
                     <div className="text-xs font-mono text-nexus-accent bg-nexus-900 px-2 py-1 rounded border border-nexus-accent/20">{aiSettings?.model || s('appSettings.status.notConfigured')}</div>
                </div>
            </header>

            <div className="bg-nexus-800 border border-slate-700 rounded-xl shadow-lg overflow-hidden">
                <div className="flex border-b border-slate-700 bg-nexus-900/50">
                    <button onClick={() => setMode('Asset')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'Asset' ? 'bg-nexus-800 text-slate-200 border-t-2 border-t-slate-400' : 'text-slate-500 hover:text-slate-300'}`}>
                        <Cuboid size={16} /> {t.forge.modes.asset.label}
                    </button>
                    <button onClick={() => setMode('Lore')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'Lore' ? 'bg-nexus-800 text-purple-400 border-t-2 border-t-purple-400' : 'text-slate-500 hover:text-slate-300'}`}>
                        <BookOpen size={16} /> {t.forge.modes.lore.label}
                    </button>
                    <button onClick={() => setMode('Character')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'Character' ? 'bg-nexus-800 text-nexus-accent border-t-2 border-t-nexus-accent' : 'text-slate-500 hover:text-slate-300'}`}>
                        <User size={16} /> {t.forge.modes.character.label}
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                             <NexusSelect 
                                label={t.forge.controls.targetPool}
                                value={selectedPoolName}
                                onChange={e => setSelectedPoolName(e.target.value)}
                             >
                                 <option value="">-- {t.common.search} --</option>
                                 {availablePools.map((p: Pool) => (
                                     <option key={p.name} value={p.name}>
                                         {p.name} ({poolCounts[p.name] || 0})
                                     </option>
                                 ))}
                             </NexusSelect>
                        </div>
                        <div className="flex gap-4 items-end">
                            <div className="flex-1">
                                <NexusSelect
                                    label={t.forge.controls.language}
                                    value={language}
                                    onChange={e => setLanguage(e.target.value as any)}
                                >
                                    <option value="English">English</option>
                                    <option value="Chinese">Chinese (中文)</option>
                                </NexusSelect>
                            </div>
                            
                            <PortalTooltip content={<div className="text-xs">{t.forge.controls.strictTags.tooltip}</div>}>
                                <button 
                                    onClick={() => setStrictTags(!strictTags)}
                                    className={`h-[42px] px-3 rounded border flex items-center gap-2 transition-all ${
                                        strictTags 
                                        ? 'bg-nexus-900 border-blue-500/50 text-blue-400' 
                                        : 'bg-nexus-900 border-green-500/50 text-green-400'
                                    }`}
                                >
                                    {strictTags ? <Tag size={18} /> : <ArrowUpRight size={18} />}
                                    <span className="text-xs font-bold">
                                        {strictTags ? t.forge.controls.strictTags.strict : t.forge.controls.strictTags.allow}
                                    </span>
                                </button>
                            </PortalTooltip>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <NexusSelect 
                                label={t.forge.controls.tone}
                                value={selectedToneId}
                                onChange={e => setSelectedToneId(e.target.value)}
                            >
                                {appSettings.tones.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </NexusSelect>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs text-slate-500 uppercase font-bold mb-1.5 tracking-wide">{t.forge.controls.batchSize}</label>
                                <div className="flex items-center gap-2 h-[42px] bg-nexus-900 border border-slate-600 rounded px-2">
                                    <NexusButton variant="ghost" size="sm" onClick={() => setCount(Math.max(1, count - 1))} icon={<Minus size={14} />} className="w-8 h-8 p-0" />
                                    <span className="flex-1 text-center font-bold text-slate-200">{count}</span>
                                    <NexusButton variant="ghost" size="sm" onClick={() => setCount(Math.min(10, count + 1))} icon={<Plus size={14} />} className="w-8 h-8 p-0" />
                                </div>
                            </div>
                            
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="block text-xs text-slate-500 uppercase font-bold tracking-wide">{t.forge.controls.length.label}</label>
                                    <PortalTooltip content={t.forge.controls.length.tooltip}>
                                        <div className="flex items-center gap-1.5 cursor-pointer group">
                                            <input 
                                                type="checkbox" 
                                                id="scope-toggle"
                                                checked={lengthPerField} 
                                                onChange={e => setLengthPerField(e.target.checked)}
                                                className="accent-nexus-accent w-3 h-3 cursor-pointer"
                                            />
                                            <label htmlFor="scope-toggle" className="text-xs text-slate-400 font-bold uppercase cursor-pointer select-none group-hover:text-nexus-accent">
                                                {t.forge.controls.length.scopeField}
                                            </label>
                                            <HelpCircle size={10} className="text-slate-600" />
                                        </div>
                                    </PortalTooltip>
                                </div>
                                <NexusSelect 
                                    value={outputLength}
                                    onChange={e => setOutputLength(e.target.value as any)}
                                >
                                    <option value="Short">{s('forge.length.short')}</option>
                                    <option value="Medium">{s('forge.length.medium')}</option>
                                    <option value="Long">{s('forge.length.long')}</option>
                                </NexusSelect>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-nexus-950 border border-slate-700 rounded-lg shadow-inner">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-bold text-slate-400 text-xs uppercase flex items-center gap-2"><Link2 size={14} /> {t.forge.controls.context.header}</h4>
                            <NexusButton variant="secondary" onClick={() => setIsContextSelectorOpen(true)} icon={<Plus size={12} />} className="h-7 text-xs">
                                {t.forge.controls.context.addLink}
                            </NexusButton>
                        </div>
                        {contextItems.length === 0 && (
                            <p className="text-xs text-slate-600 italic">{t.forge.controls.context.empty}</p>
                        )}
                        <div className="space-y-2">
                            {contextItems.map((ctx) => (
                                <div key={ctx.item.id} className="bg-nexus-900 border border-slate-700 rounded p-2 flex items-center justify-between animate-in slide-in-from-left-2">
                                    <div className="flex-1 flex items-center gap-2">
                                        <div className="w-40">
                                            <NexusSelect
                                                value={ctx.influence} 
                                                onChange={e => {
                                                    setContextItems(prev => prev.map(c => c.item.id === ctx.item.id ? { ...c, influence: e.target.value } : c));
                                                }}
                                                className="h-8 py-0 text-xs"
                                            >
                                                {relationshipOptions.length > 0 ? (
                                                    relationshipOptions.map(rel => <option key={rel} value={rel}>{rel}</option>)
                                                ) : (
                                                    <>
                                                        <option value={s('forge.relationship.relatedTo')}>{s('forge.relationship.relatedTo')}</option>
                                                        <option value={s('forge.relationship.allyOf')}>{s('forge.relationship.allyOf')}</option>
                                                        <option value={s('forge.relationship.enemyOf')}>{s('forge.relationship.enemyOf')}</option>
                                                    </>
                                                )}
                                            </NexusSelect>
                                        </div>
                                        <ArrowRight size={10} className="text-slate-600" />
                                        <span className="text-xs font-bold text-slate-200">{ctx.item.name}</span>
                                    </div>
                                    <button onClick={() => setContextItems(prev => prev.filter(c => c.item.id !== ctx.item.id))} className="text-slate-600 hover:text-red-400 ml-2"><X size={12} /></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                         <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 text-xs text-nexus-accent hover:text-white mb-2 transition-colors font-bold uppercase tracking-wider">
                            <Sliders size={14} /> {t.forge.controls.advanced.toggle}
                         </button>
                        
                        {showAdvanced && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-nexus-900/50 p-4 rounded-lg border border-slate-700/50 mb-6 animate-in slide-in-from-top-2">
                                <div className="md:col-span-2">
                                     <TagInput label={t.forge.controls.advanced.mustContain} tags={requiredAttributes} setTags={setRequiredAttributes} placeholder={s('forge.placeholder.mustContain')} />
                                </div>
                                <div className="md:col-span-2">
                                     <TagInput label={t.forge.controls.advanced.mustAvoid} tags={negativeConstraints} setTags={setNegativeConstraints} placeholder={s('forge.placeholder.mustAvoid')} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <NexusTextArea 
                            label={t.forge.controls.prompt}
                            value={prompt} 
                            onChange={e => setPrompt(e.target.value)} 
                            placeholder={language === 'Chinese' ? `描述你想生成的${mode === 'Lore' ? '设定' : mode === 'Character' ? '角色' : '资源'}...` : `Describe the ${mode.toLowerCase()} you want to generate...`}
                            className="h-28 font-medium text-base"
                        />
                    </div>

                    <NexusButton 
                        onClick={handleGenerate} 
                        disabled={isGenerating} 
                        className="w-full h-12 text-lg shadow-lg shadow-blue-900/20"
                        icon={isGenerating ? <Wand2 className="animate-spin" /> : <Wand2 />}
                    >
                        {isGenerating ? t.forge.controls.buttons.generating : t.forge.controls.buttons.generate}
                    </NexusButton>
                </div>
            </div>

            {generatedItems.length > 0 && (
                <div className="space-y-4 animate-fade-in mt-6">
                    <div className="flex justify-between items-center bg-nexus-800 p-4 rounded-lg border border-slate-700">
                        <h3 className="font-bold text-slate-200 text-lg">{t.forge.results.title} ({generatedItems.length})</h3>
                        <NexusButton onClick={saveAll} variant="secondary" icon={<Check size={14} />}>
                            {t.forge.controls.buttons.saveAll}
                        </NexusButton>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {generatedItems.map(item => {
                            const desc = EntityUtils.getDescription(item);
                            const displayAttrs = EntityUtils.getDisplayAttributes(item);
                            const hasRarity = !!item.components['rarity'];
                            
                            return (
                                <div key={item.id} className="bg-nexus-800 border border-slate-700 p-5 rounded-lg hover:border-nexus-accent transition-colors flex gap-4 group shadow-lg">
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h4 className="font-bold text-xl text-white group-hover:text-nexus-accent transition-colors">{item.name}</h4>
                                                <div className="text-xs text-slate-500 uppercase font-bold mt-1 flex gap-2">
                                                    <span className="bg-nexus-900 px-2 py-0.5 rounded text-slate-400">{selectedPoolName}</span>
                                                    {hasRarity && (
                                                        <span className="text-nexus-accent">{EntityUtils.getRarity(item)}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => saveItem(item)} className="bg-nexus-accent hover:bg-blue-600 text-white p-2 rounded shadow-lg transform hover:scale-105 transition-all"><Save size={16} /></button>
                                                <button onClick={() => setGeneratedItems(items => items.filter(i => i.id !== item.id))} className="bg-slate-800 text-slate-500 hover:text-red-400 p-2 rounded border border-slate-700 hover:border-red-500"><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                        <p className="text-slate-300 text-sm mb-4 leading-relaxed whitespace-pre-wrap">{desc}</p>
                                        
                                        <div className="flex flex-col gap-2 text-xs text-slate-500 bg-nexus-900/50 p-3 rounded border border-slate-800/50">
                                            {Object.entries(displayAttrs).map(([k, v]) => (
                                                <div key={k} className="flex flex-col gap-1 border-b border-slate-800/50 pb-2 last:border-0 last:pb-0">
                                                    <span className="capitalize opacity-60 font-bold">{k}</span>
                                                    <span className="text-slate-300 font-mono break-words whitespace-pre-wrap">{String(v)}</span>
                                                </div>
                                            ))}
                                            {Object.keys(displayAttrs).length === 0 && <span className="italic">{s('forge.noStatsGenerated')}</span>}
                                        </div>

                                        <div className="flex flex-wrap gap-1 mt-3">
                                            {item.tags.map(t => (
                                                <span key={t} className="text-xs bg-black/40 text-slate-400 px-2 py-0.5 rounded border border-slate-800">{t}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <LogViewer logs={globalLogs} toggleLog={toggleGlobalLog} />
            {isContextSelectorOpen && <ContextSelectorModal world={currentWorld} onSelect={addContextItem} onClose={() => setIsContextSelectorOpen(false)} />}
        </div>
    );
};

export default GenerationEngine;