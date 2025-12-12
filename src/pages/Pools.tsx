// nexus-generator/src/pages/Pools.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Search, Layers, Settings, Plus, Trash2, Save, 
    CheckSquare, Square, Folder, CheckCircle2, AlertTriangle, Box,
    Edit3, Palette, Network, Link2, X
} from 'lucide-react';
import { useActiveWorld } from '../contexts/ActiveWorldContext';
import { useWorldManager } from '../contexts/ServiceContext';
import { useCurrentWorld } from '../hooks/useWorldData';
import { usePoolData } from '../hooks/usePoolData';
import { useToast } from '../contexts/ToastContext';
import { UniversalEntity, ComponentDefinition, ComponentField } from '../types';
import { NexusModal, NexusButton, NexusInput, NexusTextArea, NexusSelect, EmptyState } from '../components/ui';
import { EntityUtils } from '../utils/entityUtils';
import { NexusEntityPicker } from '../components/NexusEntityPicker';
import { useTranslation } from '../lib/translations'; // NEW IMPORT
import { useStrings } from '../lib/translations';
import { POOL_COLORS } from '../constants/colors';

const Pools: React.FC = () => {
  const { activeWorldId, triggerRefresh } = useActiveWorld();
  const worldManager = useWorldManager();
  const params = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const t = useTranslation(); // HOOK
  const { s } = useStrings();
  
  const poolNameParam = params.poolName || '';
  const { world: currentWorld, reload: reloadMeta } = useCurrentWorld(activeWorldId);
  const { entities, addEntity, updateEntity, removeEntity } = usePoolData(activeWorldId || undefined, poolNameParam, 24);

  const [search, setSearch] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  
  const [configTab, setConfigTab] = useState<'blueprint' | 'relations'>('blueprint');
  
  const [newRelType, setNewRelType] = useState('');

  const [isEditPoolModalOpen, setIsEditPoolModalOpen] = useState(false);
  const [isDeletePoolModalOpen, setIsDeletePoolModalOpen] = useState(false);
  
  const [editPoolName, setEditPoolName] = useState('');
  const [editPoolDesc, setEditPoolDesc] = useState('');
  const [editPoolColor, setEditPoolColor] = useState('#3b82f6');
  
  const [editingEntity, setEditingEntity] = useState<UniversalEntity | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const [adderRelType, setAdderRelType] = useState('');

  useEffect(() => {
      setSelectedEntityId(null);
      setEditingEntity(null);
      setIsEntityModalOpen(false);
  }, [poolNameParam]);

  const currentPool = useMemo(() => {
      if (!currentWorld) return null;
      return currentWorld.pools[poolNameParam] || null;
  }, [currentWorld, poolNameParam]);

  const groupedComponents = useMemo(() => {
      if (!currentWorld) return {};
      const groups: Record<string, ComponentDefinition[]> = {};
      
      Object.values(currentWorld.componentRegistry).forEach(def => {
          const cat = def.category || 'General';
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(def);
      });
      
      return groups;
  }, [currentWorld]);

  const isCharacterMode = currentPool?.type === 'Character';

  const openEditPoolModal = () => {
      if (!currentPool) return;
      setEditPoolName(currentPool.name);
      setEditPoolDesc(currentPool.description || '');
      setEditPoolColor(currentPool.color || '#3b82f6');
      setIsEditPoolModalOpen(true);
  };

  const handleUpdatePool = async () => {
      if (!activeWorldId || !editPoolName.trim()) return;
      const cleanName = editPoolName.trim();
      
      try {
          if (cleanName !== currentPool?.name) {
              await worldManager.renamePool(activeWorldId, poolNameParam, cleanName);
          }
          await worldManager.updatePoolDetails(activeWorldId, cleanName, {
              description: editPoolDesc,
              color: editPoolColor
          });

          triggerRefresh();
      toast({ title: s('pools.toast.success.title'), message: s('pools.toast.success.message'), type: "success" });
          setIsEditPoolModalOpen(false);
          
          if (cleanName !== poolNameParam) {
              navigate(`/world/${activeWorldId}/pool/${cleanName}`);
          } else {
              reloadMeta();
          }
      } catch (e: any) {
          toast({ title: s('pools.toast.error.title'), message: e.message, type: "error" });
      }
  };

  const handleDeletePool = async () => {
      if (!activeWorldId) return;
      try {
          await worldManager.deletePool(activeWorldId, poolNameParam);
          triggerRefresh();
          toast({ title: s('pools.toast.deleted.title'), message: s('pools.toast.poolRemoved.message'), type: "info" });
          navigate(`/world/${activeWorldId}/edit`);
      } catch (e: any) {
          toast({ title: s('pools.toast.error.title'), message: e.message, type: "error" });
      }
  };

  const handleToggleComponent = async (compId: string, isActive: boolean) => {
      if (!currentPool || !activeWorldId) return;
      if (compId === 'metadata') {
          toast({ title: s('pools.toast.actionDenied.title'), message: s('pools.toast.actionDenied.message'), type: "error" });
          return;
      }

      const newDefaults = { ...currentPool.defaultComponents };
      
      if (isActive) {
          delete newDefaults[compId];
      } else {
          const def = currentWorld.componentRegistry[compId];
          if (def) {
              const emptyState: any = {};
              def.fields.forEach(f => emptyState[f.key] = f.defaultValue);
              newDefaults[compId] = emptyState;
          }
      }

      await worldManager.updatePoolBlueprints(activeWorldId, currentPool.name, newDefaults);
      await reloadMeta();
      triggerRefresh();   
  };

  const handleAddRelationType = async () => {
      if (!newRelType.trim() || !currentPool) return;
      const currentTypes = currentPool.relationshipTypes || [];
      if (!currentTypes.includes(newRelType)) {
          const updatedTypes = [...currentTypes, newRelType];
          const updatedPool = { ...currentPool, relationshipTypes: updatedTypes };
          const updatedWorld = { ...currentWorld, pools: { ...currentWorld.pools, [currentPool.name]: updatedPool } };
          await worldManager.saveWorld(updatedWorld);
          setNewRelType('');
          reloadMeta();
      }
  }

  const handleRemoveRelationType = async (type: string) => {
      if (!currentPool) return;
      const updatedTypes = (currentPool.relationshipTypes || []).filter(t => t !== type);
      const updatedPool = { ...currentPool, relationshipTypes: updatedTypes };
      const updatedWorld = { ...currentWorld, pools: { ...currentWorld.pools, [currentPool.name]: updatedPool } };
      await worldManager.saveWorld(updatedWorld);
      reloadMeta();
  }

  const handleCreateNew = async () => {
      const initialComps = JSON.parse(JSON.stringify(currentPool?.defaultComponents || {}));
      
      const newId = crypto.randomUUID();
      const now = new Date().toISOString().split('T')[0];

      initialComps.metadata = { 
          id: newId,
          created_at: now
      };
      
      initialComps.relations = {};

      const newEntity: UniversalEntity = {
          id: newId,
          name: isCharacterMode ? s('pools.newCharacter') : s('pools.newItem'),
          tags: [],
          components: initialComps
      };
      
      if (isCharacterMode) {
          await addEntity(newEntity);
          toast({ title: s('pools.toast.characterCreated.title'), message: s('pools.toast.characterCreated.message'), type: "success" });
          setSelectedEntityId(newEntity.id);
          setEditingEntity(newEntity);
      } else {
          setSelectedEntityId(null);
          setEditingEntity(newEntity);
          setIsEntityModalOpen(true);
      }
  };

  const handleSaveEntity = async (entity: UniversalEntity) => {
      if (!entity.name.trim()) return;
      setIsSaving(true);
      try {
          if (isCharacterMode && selectedEntityId !== entity.id) await updateEntity(entity);
          else if (!isCharacterMode && !entities.find(e => e.id === entity.id)) await addEntity(entity);
          else await updateEntity(entity);
          
          setSelectedEntityId(entity.id);
          setIsEntityModalOpen(false);
          
          toast({ title: s('pools.toast.saved.title'), message: `${entity.name} updated.`, type: "success" });
      } catch (e) { toast({ title: s('pools.toast.error.title'), message: s('pools.toast.saveFailed.message'), type: "error" }); } 
      finally { setIsSaving(false); }
  };

  const handleCancel = () => {
      setIsEntityModalOpen(false);
      if (selectedEntityId) {
          const original = entities.find(e => e.id === selectedEntityId);
          if (original) {
              setEditingEntity(JSON.parse(JSON.stringify(original)));
          }
      } else {
          setEditingEntity(null);
      }
  };

  const confirmDelete = async () => {
      if (!deleteCandidateId) return;
      await removeEntity(deleteCandidateId);
      
      if (selectedEntityId === deleteCandidateId) {
          setSelectedEntityId(null);
          setEditingEntity(null);
      }

      setDeleteCandidateId(null);
      toast({ title: s('pools.toast.deleted.title'), message: s('pools.toast.entityRemoved.message'), type: "info" });
  };

  const handleTypedInput = (defId: string, fieldKey: string, type: string, rawValue: string, options: string[] = []) => {
      if (!editingEntity) return;

      let valueToStore: any = rawValue;

      if (type === 'number') {
          const isInteger = options && options[0] === 'integer';
          if (isInteger) {
              if (rawValue !== '' && rawValue !== '-' && !/^-?\d*$/.test(rawValue)) return;
              if (rawValue !== '' && rawValue !== '-') {
                  valueToStore = parseInt(rawValue, 10);
                  if (isNaN(valueToStore)) valueToStore = 0;
              } else {
                  valueToStore = rawValue;
              }
          } else {
              if (rawValue !== '' && rawValue !== '-' && rawValue !== '.' && !/^-?\d*\.?\d*$/.test(rawValue)) return;
              if (rawValue !== '' && rawValue !== '-' && rawValue !== '.' && !/^-?\d*\.?\d*$/.test(rawValue)) valueToStore = rawValue;
          }
      }

      if (type === 'boolean') {
          valueToStore = rawValue === 'true';
      }

      const newComp = { ...editingEntity.components[defId], [fieldKey]: valueToStore };
      setEditingEntity({ 
          ...editingEntity, 
          components: { ...editingEntity.components, [defId]: newComp } 
      });
  };

  const renderRelationshipEditor = (entity: UniversalEntity, onChange: (updated: UniversalEntity) => void) => {
      const activeRelations = entity.components.relations || {};
      const activeKeys = Object.keys(activeRelations);
      
      const availableTypes = (currentPool?.relationshipTypes || []).filter(t => !activeKeys.includes(t));

      const removeRelationCategory = (typeToRemove: string) => {
          const newRels = { ...activeRelations };
          delete newRels[typeToRemove];
          onChange({
              ...entity,
              components: { ...entity.components, relations: newRels }
          });
      };

      const addRelationCategory = async () => {
          if (!adderRelType) return;
          
          const currentTypes = currentPool?.relationshipTypes || [];
          if (!currentTypes.includes(adderRelType)) {
              const updatedTypes = [...currentTypes, adderRelType];
              const updatedPool = { ...currentPool!, relationshipTypes: updatedTypes };
              const updatedWorld = { ...currentWorld!, pools: { ...currentWorld!.pools, [currentPool!.name]: updatedPool } };
              await worldManager.saveWorld(updatedWorld);
              reloadMeta(); 
          }

          const newRels = { ...activeRelations, [adderRelType]: [] };
          onChange({
              ...entity,
              components: { ...entity.components, relations: newRels }
          });
          setAdderRelType(''); 
      };

      return (
          <div className="bg-nexus-900/30 border border-slate-700/50 rounded-lg p-4 space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                  <Network size={14} /> {t.pools.modals.config.tabs.relations}
              </h4>
              <div className="space-y-4">
                  {activeKeys.map(relType => (
                      <div key={relType} className="space-y-2 animate-fade-in">
                          <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase">
                              <span>{relType}...</span>
                              <button 
                                  onClick={() => removeRelationCategory(relType)}
                                  className="text-slate-600 hover:text-red-400 p-1 rounded hover:bg-red-900/20 transition-colors"
                                  title={`Remove "${relType}" section`}
                              >
                                  <Trash2 size={12} />
                              </button>
                          </div>
                          <NexusEntityPicker 
                              value={activeRelations[relType] || []}
                              onChange={(ids) => {
                                  const newRels = { ...activeRelations, [relType]: ids };
                                  onChange({ ...entity, components: { ...entity.components, relations: newRels } });
                              }}
                          placeholder={s('pools.relationship.selectTargets')}
                          />
                      </div>
                  ))}
                  {activeKeys.length === 0 && (
                      <div className="text-xs text-slate-500 italic text-center py-2 border-2 border-dashed border-slate-800 rounded">
                      {s('pools.relationship.noActive')}
                      </div>
                  )}
              </div>
              
              <div className="pt-2 border-t border-slate-800 mt-2">
               <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{s('pools.relationship.addConnectionType')}</label>
                   <div className="flex gap-2">
                       <div className="flex-1 relative">
                            <input 
                                list="rel-types"
                                value={adderRelType}
                                onChange={e => setAdderRelType(e.target.value)}
                                className="w-full bg-nexus-900 border border-slate-600 rounded p-2.5 text-xs text-slate-200 outline-none focus:border-nexus-accent"
                            placeholder={s('pools.relationship.selectOrTypeNew')}
                            />
                            <datalist id="rel-types">
                                {availableTypes.map(t => <option key={t} value={t} />)}
                            </datalist>
                       </div>
                       <NexusButton 
                          size="sm" 
                          disabled={!adderRelType}
                          onClick={addRelationCategory}
                          className="h-[38px]"
                          icon={<Plus size={14} />}
                       >
                           {t.common.confirm}
                       </NexusButton>
                   </div>
              </div>
          </div>
      );
  };

  const getEditorComponents = (entity: UniversalEntity) => {
      if (!currentWorld) return [];
      return Object.keys(entity.components)
          .filter(k => k !== 'metadata' && k !== 'relations')
          .map(k => {
              const def = currentWorld.componentRegistry[k];
              return def || { id: k, label: k, fields: [], category: 'Unknown' };
          })
          .sort((a, b) => (a.category || '').localeCompare(b.category || ''));
  };

  const renderInputForField = (defId: string, f: ComponentField, value: any) => {
      if (f.type === 'boolean') {
          return (
              <NexusSelect 
                  value={String(value)} 
                  onChange={e => handleTypedInput(defId, f.key, 'boolean', e.target.value)}
              >
                  <option value="false">{s('pools.boolean.false')}</option>
                  <option value="true">{s('pools.boolean.true')}</option>
              </NexusSelect>
          );
      }
      if (f.type === 'select') {
          return (
              <NexusSelect
                  value={String(value ?? '')} 
                  onChange={e => handleTypedInput(defId, f.key, 'select', e.target.value)}
              >
                  <option value="">{s('pools.select.placeholder')}</option>
                  {f.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </NexusSelect>
          );
      }
      if (f.type === 'text') {
           return (
              <NexusTextArea 
                value={value || ''} 
                onChange={e => handleTypedInput(defId, f.key, 'text', e.target.value)}
                className="min-h-[3rem]"
              />
          );
      }
      if (f.type === 'number') {
           return (
              <NexusInput 
                value={value ?? ''} 
                onChange={e => handleTypedInput(defId, f.key, f.type, e.target.value, f.options)}
                placeholder="0"
              />
           );
      }
      return (
          <NexusInput 
            value={value || ''} 
            onChange={e => handleTypedInput(defId, f.key, f.type, e.target.value, f.options)}
          />
      );
  };

  const filteredEntities = useMemo(() => {
    if (!search.trim()) return entities;
    const lowerSearch = search.toLowerCase();
    return entities.filter(e => e.name.toLowerCase().includes(lowerSearch));
  }, [entities, search]);

  if (!activeWorldId) return null;
  if (!currentWorld || !currentPool) return <div className="p-8 flex items-center gap-2"><div className="w-4 h-4 border-2 border-nexus-accent border-r-transparent rounded-full animate-spin"></div> {t.common.loading}</div>;

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col animate-fade-in">
        <div className="flex justify-between items-end border-b border-slate-700 pb-4 mb-4 shrink-0">
            <div>
                <div className="flex items-center gap-2 mb-1">
                     <span className="uppercase text-xs font-bold px-2 py-0.5 rounded border tracking-wider bg-nexus-900 text-slate-400 border-slate-700" style={{ borderColor: currentPool.color }}>{currentPool.type}</span>
                     <span className="text-xs text-slate-500">{t.pools.header.id}: {currentPool.name}</span>
                </div>
                <h2 className="text-3xl font-bold text-slate-100 capitalize flex items-center gap-3">
                    <Layers className="text-slate-500" /> {currentPool.name}
                </h2>
                {currentPool.description && (
                    <p className="text-sm text-slate-400 mt-1 max-w-2xl">{currentPool.description}</p>
                )}
            </div>
            <div className="flex gap-3">
                <div className="relative group">
                    <NexusInput 
                        value={search} 
                        onChange={e => setSearch(e.target.value)} 
                        placeholder={t.common.search} 
                        leftIcon={<Search size={16} />}
                        className="w-64" 
                    />
                </div>
                <NexusButton variant="ghost" onClick={openEditPoolModal} icon={<Edit3 size={16} />} title={t.pools.actions.editSettings}/>
                <NexusButton variant="ghost" onClick={() => setIsDeletePoolModalOpen(true)} className="text-slate-500 hover:text-red-400" icon={<Trash2 size={16} />} title={t.pools.actions.deletePool}/>
                <div className="h-8 w-px bg-slate-700 mx-1"></div>
                <NexusButton variant="secondary" onClick={() => setIsConfigModalOpen(true)} icon={<Settings size={16} />}>{t.pools.actions.config}</NexusButton>
                <NexusButton onClick={handleCreateNew} icon={<Plus size={16} />}>{t.pools.actions.newEntity}</NexusButton>
            </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-4">
             {isCharacterMode ? (
                <div className="flex-1 flex gap-6 min-h-0">
                    <div className="w-72 bg-nexus-800 border border-slate-700 rounded-xl overflow-hidden shrink-0 flex flex-col shadow-lg">
                         <div className="p-3 border-b border-slate-700 bg-nexus-900 text-xs font-bold text-slate-500 uppercase">{t.pools.roster.title}</div>
                         <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {filteredEntities.map(e => (
                                <div key={e.id} onClick={() => { setSelectedEntityId(e.id); setEditingEntity(JSON.parse(JSON.stringify(e))); }} className={`p-2 rounded cursor-pointer transition-colors ${selectedEntityId === e.id ? 'bg-nexus-accent text-white shadow-md' : 'text-slate-300 hover:bg-slate-700'}`}>
                                    <div className="font-bold text-sm truncate">{e.name}</div>
                                </div>
                            ))}
                         </div>
                    </div>
                    <div className="flex-1 bg-nexus-800 border border-slate-700 rounded-xl p-6 overflow-y-auto custom-scrollbar shadow-lg">
                         {selectedEntityId && editingEntity ? (
                             <div className="space-y-6">
                                 <div className="flex justify-between items-center border-b border-slate-700 pb-4 gap-4">
                                     <NexusInput 
                                        value={editingEntity.name} 
                                        onChange={e => setEditingEntity({...editingEntity, name: e.target.value})} 
                                        placeholder={s('pools.characterName')}
                                        className="text-3xl font-bold"
                                     />
                                     <div className="flex gap-2">
                                         <NexusButton variant="destructive" onClick={() => setDeleteCandidateId(editingEntity.id)} icon={<Trash2 size={16} />}>{t.common.delete}</NexusButton>
                                         <NexusButton onClick={() => handleSaveEntity(editingEntity)} icon={<Save size={16} />}>{t.common.save}</NexusButton>
                                     </div>
                                 </div>
                                 <div className="flex flex-col gap-6">
                                     {getEditorComponents(editingEntity).map(def => (
                                         <div key={def.id} className="bg-nexus-900/50 p-4 rounded-lg border border-slate-700/50 hover:border-nexus-accent/30 transition-colors w-full">
                                             <div className="flex justify-between items-center mb-3">
                                                 <div className="font-bold text-slate-300 uppercase text-xs tracking-wider">{def.label}</div>
                                             </div>
                                              <div className="space-y-3">
                                                {def.fields.map(f => (
                                                    <div key={f.key}>
                                                        <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">{f.key}</label>
                                                        {renderInputForField(def.id, f, editingEntity.components[def.id]?.[f.key])}
                                                    </div>
                                                ))}
                                              </div>
                                         </div>
                                     ))}
                                 </div>
                                 <div className="space-y-2">
                                     <NexusEntityPicker label={t.pools.modals.editEntity.tags} value={editingEntity.tags} onChange={t => setEditingEntity({...editingEntity, tags: t})} lockedMode="tags" placeholder={s('pools.addTags')} className="min-h-[42px]" />
                                 </div>
                                 {renderRelationshipEditor(editingEntity, setEditingEntity)}
                             </div>
                         ) : (
                             <EmptyState
                                 icon={Box}
                                 title={t.pools.roster.empty || s('pools.emptyCharacter.title')}
                                 description={s('pools.emptyCharacter.desc')}
                                 actionLabel={t.pools.actions.newEntity || s('pools.emptyCharacter.action')}
                                 onAction={handleCreateNew}
                                 size="md"
                             />
                         )}
                    </div>
                </div>
             ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto p-4 custom-scrollbar">
                    {filteredEntities.map(e => {
                        const displayAttrs = EntityUtils.getDisplayAttributes(e);
                        const hasRarity = !!e.components['rarity'];
                        const rarityLabel = hasRarity ? EntityUtils.getRarity(e) : null;
                        
                        // FIX: Resolve Dynamic Rarity Color
                        let rarityColor = currentPool.color || '#3b82f6'; // Fallback
                        if (rarityLabel) {
                            const foundLevel = currentWorld.config.raritySettings?.levels.find(l => l.label === rarityLabel);
                            if (foundLevel) rarityColor = foundLevel.color;
                        }

                        // Pool Theme Color
                        const themeColor = currentPool.color || '#3b82f6';
                        
                        // FIX: Description Extraction
                        const description = EntityUtils.getDescription(e);

                        return (
                            <div 
                                key={e.id} 
                                onClick={() => { 
                                    setSelectedEntityId(e.id);
                                    setEditingEntity(JSON.parse(JSON.stringify(e))); 
                                    setIsEntityModalOpen(true); 
                                }} 
                                // FIX: Card Size and Layout Logic
                                className="bg-nexus-800 border p-4 rounded-xl cursor-pointer relative group flex flex-col shadow-lg transition-all h-[360px] overflow-hidden hover:shadow-xl hover:-translate-y-1"
                                style={{ 
                                    ['--theme-color' as any]: themeColor,
                                    borderColor: `rgba(255,255,255,0.1)`,
                                    backgroundColor: `rgba(15, 23, 42, 0.95)`,
                                    borderLeft: `4px solid ${themeColor}`
                                }}
                                onMouseEnter={(ev) => {
                                    ev.currentTarget.style.borderColor = themeColor;
                                    ev.currentTarget.style.boxShadow = `0 4px 20px -5px ${themeColor}60`;
                                    ev.currentTarget.style.backgroundColor = `${themeColor}15`;
                                }}
                                onMouseLeave={(ev) => {
                                    ev.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                                    ev.currentTarget.style.boxShadow = 'none';
                                    ev.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
                                }}
                            >
                                {/* Header */}
                                <div className="font-bold text-slate-100 text-lg mb-1 pr-6 break-words group-hover:text-[var(--theme-color)] transition-colors truncate shrink-0">{e.name}</div>
                                
                                {rarityLabel && (
                                    <div 
                                        className="text-xs uppercase font-bold mb-2 tracking-wide inline-block px-2 py-0.5 rounded self-start shrink-0" 
                                        style={{ 
                                            color: 'white',
                                            backgroundColor: rarityColor,
                                            boxShadow: `0 0 5px ${rarityColor}80`
                                        }}
                                    >
                                        {rarityLabel}
                                    </div>
                                )}
                                
                                {/* MAJOR FIX: Layout Inversion 
                                    - Description moves to top, shrinkable, limited height.
                                    - Stats expand to fill the rest.
                                */}
                                
                                {description && (
                                    <div className="text-xs text-slate-400 leading-relaxed mb-3 whitespace-pre-wrap break-words shrink-0 max-h-[30%] overflow-y-auto custom-scrollbar group-hover:text-slate-300">
                                        {description}
                                    </div>
                                )}
                                
                                {/* Stats Box Expanded */}
                                <div className="bg-black/20 rounded p-2 border border-white/5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                    <div className="grid grid-cols-1 gap-2">
                                        {Object.entries(displayAttrs).map(([k, v]) => (
                                            <div key={k} className="flex flex-col border-b border-white/5 pb-1 last:border-0">
                                                <span className="text-xs text-slate-500 uppercase font-bold break-all group-hover:text-[var(--theme-color)]">{k}</span>
                                                <span className="text-xs text-slate-300 font-mono break-words">{String(v)}</span>
                                            </div>
                                        ))}
                                        {Object.keys(displayAttrs).length === 0 && <span className="text-xs text-slate-600 italic">{t.pools.emptyState.noStats}</span>}
                                    </div>
                                </div>
                                
                                <button onClick={(ev) => { ev.stopPropagation(); setDeleteCandidateId(e.id); }} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-2 hover:bg-red-900/20 rounded transition-all"><Trash2 size={16}/></button>
                            </div>
                        );
                    })}
                </div>
             )}
        </div>

        {/* MODAL: EDIT POOL SETTINGS */}
        <NexusModal isOpen={isEditPoolModalOpen} onClose={() => setIsEditPoolModalOpen(false)} title={t.pools.modals.editPool.title}>
            <div className="space-y-4">
                <NexusInput 
                    label={t.pools.modals.editPool.name}
                    value={editPoolName} 
                    onChange={e => setEditPoolName(e.target.value)} 
                    autoFocus 
                />
                <NexusTextArea 
                    label={t.pools.modals.editPool.desc}
                    value={editPoolDesc} 
                    onChange={e => setEditPoolDesc(e.target.value)} 
                    className="min-h-[6rem]"
                />
                <div>
                  <label className="block text-xs text-slate-500 uppercase font-bold mb-1.5 tracking-wide">{t.pools.modals.editPool.color}</label>
                  <div className="flex items-center gap-2">
                      <div className="flex flex-wrap gap-2">
                          {POOL_COLORS.slice(0, 6).map(c => (
                              <button
                                  key={c}
                                  type="button"
                                  onClick={() => setEditPoolColor(c)}
                                  className={`w-6 h-6 rounded-full border-2 transition-all ${editPoolColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-110'}`}
                                  style={{ backgroundColor: c }}
                              />
                          ))}
                      </div>
                      <div className="flex items-center gap-1 bg-nexus-900 border border-slate-600 rounded px-1.5 py-0.5 ml-2 relative overflow-hidden">
                          <Palette size={14} className="text-slate-400 absolute left-1.5 pointer-events-none" />
                          <input 
                              type="color" 
                              value={editPoolColor}
                              onChange={e => setEditPoolColor(e.target.value)}
                              className="w-8 h-6 bg-transparent border-none cursor-pointer opacity-0 z-10"
                              title={s('pools.customColor')}
                          />
                          <div className="w-4 h-4 rounded-full absolute right-1.5 pointer-events-none border border-slate-500" style={{ backgroundColor: editPoolColor }}></div>
                      </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
                    <NexusButton variant="ghost" onClick={() => setIsEditPoolModalOpen(false)}>{t.common.cancel}</NexusButton>
                    <NexusButton onClick={handleUpdatePool}>{t.common.save}</NexusButton>
                </div>
            </div>
        </NexusModal>

        {/* MODAL: CONFIG COMPONENTS */}
        <NexusModal
            isOpen={isConfigModalOpen}
            onClose={() => setIsConfigModalOpen(false)}
            title={<><Settings size={18} className="text-nexus-accent"/> {t.pools.modals.config.title}</>}
            maxWidth="max-w-2xl"
            footer={<NexusButton variant="ghost" onClick={() => setIsConfigModalOpen(false)}>{t.common.close}</NexusButton>}
        >
            <div className="flex gap-4 border-b border-slate-700 mb-4">
                <button onClick={() => setConfigTab('blueprint')} className={`pb-2 text-sm font-bold transition-colors ${configTab === 'blueprint' ? 'text-nexus-accent border-b-2 border-nexus-accent' : 'text-slate-500 hover:text-white'}`}>{t.pools.modals.config.tabs.blueprint}</button>
                <button onClick={() => setConfigTab('relations')} className={`pb-2 text-sm font-bold transition-colors ${configTab === 'relations' ? 'text-nexus-accent border-b-2 border-nexus-accent' : 'text-slate-500 hover:text-white'}`}>{t.pools.modals.config.tabs.relations}</button>
            </div>
            {configTab === 'blueprint' && (
                <div className="space-y-4">
                    <div className="bg-blue-900/10 border border-blue-500/20 p-3 rounded text-xs text-blue-200 flex gap-2">
                        <CheckCircle2 size={16} className="shrink-0" />
                        <p>{t.pools.modals.config.blueprintDesc}</p>
                    </div>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {Object.entries(groupedComponents).map(([category, comps]) => (
                            <div key={category} className="space-y-2">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest px-1">
                                    <Folder size={12} /> {category}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {comps.map(comp => {
                                        const isActive = !!currentPool.defaultComponents[comp.id];
                                        const isCore = comp.isCore;
                                        const isLocked = comp.id === 'metadata';
                                        
                                        return (
                                            <div 
                                                key={comp.id} 
                                                onClick={() => !isLocked && handleToggleComponent(comp.id, isActive)}
                                                className={`
                                                    flex items-center gap-3 p-3 rounded border transition-all select-none
                                                    ${isActive 
                                                        ? 'bg-nexus-900 border-nexus-accent/50 shadow-inner' 
                                                        : 'bg-transparent border-slate-700 hover:bg-nexus-800'
                                                    }
                                                    ${isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}
                                                `}
                                            >
                                                <div className={isActive ? "text-nexus-accent" : "text-slate-600"}>
                                                    {isActive ? <CheckSquare size={18} /> : <Square size={18} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-sm font-bold truncate ${isActive ? 'text-white' : 'text-slate-400'}`}>
                                                        {comp.label}
                                                    </div>
                                                    <div className="text-xs text-slate-500 font-mono truncate">{comp.id}</div>
                                                </div>
                                                {isLocked && <span className="text-xs bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded uppercase font-bold border border-red-500/20">Required</span>}
                                                {!isLocked && isCore && <span className="text-xs bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded uppercase font-bold border border-purple-500/20">Core</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {configTab === 'relations' && (
                <div className="space-y-4">
                     <div className="bg-purple-900/10 border border-purple-500/20 p-3 rounded text-xs text-purple-200 flex gap-2">
                        <Network size={16} className="shrink-0" />
                        <p>{t.pools.modals.config.relationsDesc}</p>
                    </div>
                    <div className="flex gap-2">
                        <NexusInput 
                            value={newRelType} 
                            onChange={e => setNewRelType(e.target.value)} 
                            placeholder="e.g. Is Rival Of..." 
                            onKeyDown={e => e.key === 'Enter' && handleAddRelationType()}
                        />
                        <NexusButton onClick={handleAddRelationType}>{t.pools.modals.config.addVerb}</NexusButton>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {(currentPool?.relationshipTypes || []).map(type => (
                            <div key={type} className="flex justify-between items-center bg-nexus-900 p-3 rounded border border-slate-700">
                                <span className="font-bold text-slate-300">{type}</span>
                                <button onClick={() => handleRemoveRelationType(type)} className="text-slate-500 hover:text-red-400"><Trash2 size={14}/></button>
                            </div>
                        ))}
                         {(currentPool?.relationshipTypes || []).length === 0 && <div className="text-slate-500 italic text-center py-4">{s('pools.noRelationshipTypes')}</div>}
                    </div>
                </div>
            )}
        </NexusModal>
        
        {/* MODAL: EDIT ENTITY */}
        <NexusModal isOpen={isEntityModalOpen} onClose={handleCancel} title={t.pools.modals.editEntity.title} maxWidth="max-w-3xl">
            {editingEntity && (
                <div className="space-y-6">
                    <NexusInput value={editingEntity.name} onChange={e => setEditingEntity({...editingEntity, name: e.target.value})} className="text-lg font-bold" placeholder={t.pools.modals.editEntity.name} />
                    <div className="grid grid-cols-1 gap-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        {getEditorComponents(editingEntity).map(def => (
                            <div key={def.id} className="bg-nexus-950/50 p-4 rounded border border-slate-700 h-fit">
                                <div className="font-bold text-xs text-slate-400 uppercase mb-3 border-b border-slate-800 pb-2">{def.label}</div>
                                <div className="space-y-3">
                                    {def.fields.map(f => (
                                        <div key={f.key}>
                                            <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">{f.key}</label>
                                            {renderInputForField(def.id, f, editingEntity.components[def.id]?.[f.key])}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-2">
                        <NexusEntityPicker 
                            label={t.pools.modals.editEntity.tags}
                            value={editingEntity.tags} 
                            onChange={t => setEditingEntity({...editingEntity, tags: t})} 
                            initialMode="tags" 
                            lockedMode="tags" 
                            placeholder={s('pools.addTags')} 
                            className="min-h-[42px]" 
                        />
                    </div>
                    {renderRelationshipEditor(editingEntity, setEditingEntity)}
                </div>
            )}
             {editingEntity && (
                 <div className="flex justify-end gap-2 pt-4 border-t border-slate-700 mt-6">
                     <NexusButton variant="ghost" onClick={handleCancel}>{t.common.cancel}</NexusButton>
                     <NexusButton onClick={() => handleSaveEntity(editingEntity)} icon={<Save size={16}/>}>{t.common.save}</NexusButton>
                 </div>
             )}
        </NexusModal>

        {/* MODAL: DELETE ENTITY */}
        <NexusModal isOpen={!!deleteCandidateId} onClose={() => setDeleteCandidateId(null)} title={<span className="text-red-400 flex items-center gap-2"><AlertTriangle size={20}/> {t.pools.modals.deleteEntity.title}</span>}>
            <div className="space-y-4">
                <p className="text-slate-300">{t.pools.modals.deleteEntity.desc}</p>
                <div className="flex justify-end gap-2">
                    <NexusButton variant="ghost" onClick={() => setDeleteCandidateId(null)}>{t.common.cancel}</NexusButton>
                    <NexusButton variant="destructive" onClick={confirmDelete}>{t.common.confirm}</NexusButton>
                </div>
            </div>
        </NexusModal>

        {/* MODAL: DELETE POOL */}
        <NexusModal isOpen={isDeletePoolModalOpen} onClose={() => setIsDeletePoolModalOpen(false)} title={<span className="text-red-400 flex items-center gap-2"><Trash2 size={20}/> {t.pools.modals.deletePool.title}</span>}>
             <div className="space-y-4">
                <p className="text-slate-300">
                    {t.pools.modals.deletePool.desc} <strong>{currentPool.name}</strong>?
                </p>
                <div className="bg-red-900/10 border border-red-500/30 p-3 rounded text-xs text-red-300">
                    {t.pools.modals.deletePool.warning}
                </div>
                <div className="flex justify-end gap-2">
                    <NexusButton variant="ghost" onClick={() => setIsDeletePoolModalOpen(false)}>{t.common.cancel}</NexusButton>
                    <NexusButton variant="destructive" onClick={handleDeletePool}>{t.common.confirm}</NexusButton>
                </div>
            </div>
        </NexusModal>
    </div>
  );
};

export default Pools;