// nexus-generator/src/pages/Dashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Settings, FileJson, Database, Activity, 
    Edit2, Save, X, Hash, Trash2, AlertTriangle, BookOpen, 
    CheckCircle2, ShieldAlert
} from 'lucide-react';

// Contexts & Hooks
import { useActiveWorld } from '../contexts/ActiveWorldContext';
import { useWorldManager } from '../contexts/ServiceContext';
import { useWorldMetadata } from '../hooks/useWorldMetadata';
import { useToast } from '../contexts/ToastContext';
import { db } from '../services/db'; 
import { useTranslation } from '../lib/translations'; // NEW IMPORT
import { useStrings } from '../lib/translations';

// Components
import { Pool } from '../types';
import { NexusButton, NexusInput } from '../components/ui';
import { TYPE_COLORS, getPoolColor } from '../constants/colors';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorldId, triggerRefresh, refreshSignal } = useActiveWorld(); 
  const worldManager = useWorldManager();
  const { toast } = useToast();
  const t = useTranslation(); // HOOK
  const { s } = useStrings();

  const { metadata: currentWorld, loading, reload } = useWorldMetadata(activeWorldId);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGenre, setEditGenre] = useState('');
  const [deleteStage, setDeleteStage] = useState(0);
  
  const [poolCounts, setPoolCounts] = useState<Record<string, number>>({});
  const [topTags, setTopTags] = useState<string[]>([]);

  useEffect(() => {
      const loadData = async () => {
          if (currentWorld?.id) {
              const counts = await db.getPoolCounts(currentWorld.id);
              setPoolCounts(counts);
              
              const tags = await db.getTopTags(currentWorld.id, 50);
              setTopTags(tags);
          }
      };
      loadData();
  }, [currentWorld?.id, refreshSignal]);

  const stats = useMemo(() => {
      if (!currentWorld) return [];
      
      const totalEntities = Object.values(poolCounts).reduce((acc, c) => acc + c, 0);

      return [
        { label: t.dashboard.stats.pools, value: Object.keys(currentWorld.pools || {}).length, icon: FileJson, color: 'text-blue-400' },
        { label: t.dashboard.stats.entities, value: totalEntities, icon: Database, color: 'text-orange-400' },
        { label: t.dashboard.stats.modules, value: Object.keys(currentWorld.componentRegistry || {}).length, icon: Settings, color: 'text-purple-400' }, 
      ];
  }, [currentWorld, poolCounts, t]);

  if (!activeWorldId) return <div className="p-12 text-center text-slate-500 font-mono">{s('common.noWorldSelected')}</div>;
  
  if (loading) {
      return (
          <div className="h-full flex flex-col items-center justify-center space-y-4 text-nexus-accent animate-pulse">
              <Activity size={48} />
              <div className="text-sm font-bold uppercase tracking-widest">{t.common.loading}</div>
          </div>
      );
  }

  if (!currentWorld) {
      return (
          <div className="p-8 border border-red-500/50 bg-red-900/10 rounded-xl text-red-400 flex items-center gap-4">
              <AlertTriangle size={24} />
              <div>
                  <h3 className="font-bold">{s('common.loadFailure.title')}</h3>
                  <p className="text-sm">{s('dashboard.loadFailure.desc', { id: activeWorldId })}</p>
              </div>
          </div>
      );
  }

  const startEditing = () => {
    setEditName(currentWorld.name);
    setEditGenre(currentWorld.config.genre);
    setIsEditing(true);
  };

  const handleSaveConfig = async () => {
    if (!editName.trim()) {
        toast({ title: s('dashboard.validationError.title'), message: s('dashboard.validationError.worldNameEmpty'), type: "warning" });
        return;
    }
    
    try {
        await worldManager.updateWorldConfig(currentWorld.id, editName, {
            ...currentWorld.config,
            genre: editGenre
        }); 

        await reload();
        triggerRefresh(); 
        setIsEditing(false);
        toast({ title: s('dashboard.toast.configSaved.title'), message: s('dashboard.toast.configSaved.message'), type: "success" });
    } catch (e) {
        toast({ title: s('dashboard.toast.saveFailed.title'), message: s('dashboard.toast.saveFailed.message'), type: "error" });
    }
  };

  const handleDeleteWorld = async () => {
      if (deleteStage === 0) { setDeleteStage(1); return; }
      if (deleteStage === 1) { setDeleteStage(2); return; }
      if (deleteStage === 2) { 
          try {
              await worldManager.deleteWorld(currentWorld.id); 
              toast({ title: s('dashboard.toast.worldDeleted.title'), message: s('dashboard.toast.worldDeleted.message', { name: currentWorld.name }), type: "info" });
              navigate('/'); 
          } catch (e) {
              toast({ title: s('dashboard.toast.deletionFailed.title'), message: s('dashboard.toast.deletionFailed.message'), type: "error" });
          }
      }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* HEADER */}
      <header className="border-b border-slate-700 pb-6 flex justify-between items-start">
        <div className="flex-1 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3 bg-nexus-800 text-nexus-accent border border-nexus-accent/30">
              <BookOpen size={12} /> {t.dashboard.headers.coreRulebook}
          </div>
          
          {isEditing ? (
             <div className="space-y-4 animate-in slide-in-from-left-2 fade-in duration-200">
                <input 
                    type="text" 
                    value={editName} 
                    onChange={(e) => setEditName(e.target.value)} 
                    className="w-full bg-nexus-900 border border-slate-600 rounded-lg p-3 text-3xl font-bold text-white outline-none focus:border-nexus-accent placeholder-slate-500 shadow-inner" 
                    placeholder="World Name" 
                    autoFocus
                />
                 <div className="flex items-center gap-2 text-sm text-slate-500 font-mono">
                    <span>ID: {currentWorld.id}</span>
                 </div>
             </div>
          ) : (
             <div className="animate-in slide-in-from-left-2 fade-in duration-200">
                <h2 className="text-4xl font-black text-slate-100 tracking-tight">{currentWorld.name}</h2>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-2">
                    <span className="bg-nexus-900 px-2 py-0.5 rounded border border-slate-700">ID: {currentWorld.id}</span>
                </div>
                <p className="text-slate-400 mt-2 text-lg">{t.dashboard.headers.subtitle}</p>
             </div>
          )}
        </div>

        <div className="flex items-start gap-2 pt-2">
            {isEditing ? (
                <>
                    <NexusButton variant="ghost" onClick={() => setIsEditing(false)} icon={<X size={18} />}>
                        {t.common.cancel}
                    </NexusButton>
                    <NexusButton onClick={handleSaveConfig} icon={<Save size={18} />}>
                        {t.common.save}
                    </NexusButton>
                </>
            ) : (
                <NexusButton variant="secondary" onClick={startEditing} icon={<Edit2 size={16} />}>
                    {t.common.edit}
                </NexusButton>
            )}
        </div>
      </header>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-nexus-800 border border-slate-700 p-6 rounded-xl flex items-center justify-between shadow-lg hover:border-nexus-accent/50 transition-colors group">
            <div>
              <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">{stat.label}</div>
              <div className="text-3xl font-black text-slate-100">{stat.value}</div>
            </div>
            <div className={`bg-nexus-900 p-3 rounded-xl border border-slate-700 group-hover:border-slate-500 transition-colors ${stat.color}`}>
                <stat.icon size={24} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-6">
             {/* WORLD CONFIG CARD */}
             <div className="bg-nexus-800 border border-slate-700 rounded-xl overflow-hidden p-6 shadow-lg">
                <h3 className="text-xl font-bold text-slate-200 mb-6 flex items-center gap-2">
                    <Activity size={20} className="text-nexus-accent" /> 
                    {t.dashboard.cards.genre}
                </h3>
                <div className="space-y-6">
                    <div>
                        {isEditing ? (
                            <NexusInput 
                                label={t.dashboard.cards.genre}
                                value={editGenre}
                                onChange={e => setEditGenre(e.target.value)}
                                placeholder="e.g. Cyberpunk, High Fantasy"
                            />
                        ) : (
                            <div className="bg-nexus-900 border border-slate-700 rounded p-4">
                                <label className="block text-xs text-slate-500 uppercase font-bold mb-1 tracking-wide">{t.dashboard.cards.genre}</label>
                                <div className="text-lg font-medium text-white">{currentWorld.config.genre}</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* TAGS CLOUD CARD */}
            <div className="bg-nexus-800 border border-slate-700 rounded-xl overflow-hidden p-6 shadow-lg min-h-[200px]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-200 flex items-center gap-2">
                        <Hash size={20} className="text-purple-400" /> 
                        {t.dashboard.cards.tags}
                    </h3>
                    <NexusButton variant="ghost" onClick={() => navigate(`../tags`)} className="h-8 text-xs">{t.dashboard.cards.manageTags}</NexusButton>
                </div>
                
                {topTags.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-slate-700 rounded-lg">
                        <p className="text-slate-500 text-sm italic">{s('dashboard.noTagsYet')}</p>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {topTags.map((tagLabel, idx) => {
                            const rarityColor = worldManager.resolveRarityColor(currentWorld, tagLabel);
                            
                            return (
                                <span 
                                    key={idx} 
                                    className="px-2.5 py-1 bg-nexus-900 border border-slate-700 rounded text-xs font-bold text-slate-300 transition-colors cursor-default select-none"
                                    style={{ 
                                        color: rarityColor ? '#fff' : undefined,
                                        backgroundColor: rarityColor ? `${rarityColor}20` : undefined,
                                        borderColor: rarityColor ? `${rarityColor}50` : undefined
                                    }}
                                >
                                    #{tagLabel}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>

        {/* POOLS OVERVIEW */}
        <div className="xl:col-span-1">
            <div className="bg-nexus-800 border border-slate-700 rounded-xl overflow-hidden p-6 shadow-lg h-full flex flex-col">
                <h3 className="text-xl font-bold text-slate-200 mb-6 flex items-center gap-2">
                    <Database size={20} className="text-orange-400" /> 
                    {t.dashboard.cards.pools}
                </h3>
                <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1 max-h-[500px]">
                    {Object.values(currentWorld.pools).map((pool: Pool) => {
                        const poolColor = getPoolColor(pool.color, pool.type);
                        
                        const count = poolCounts[pool.name] || 0;

                        return (
                            <div 
                                key={pool.name} 
                                onClick={() => navigate(`../pool/${pool.name}`)}
                                className="group flex justify-between items-center bg-nexus-900 p-4 rounded-lg border border-slate-700 cursor-pointer transition-all hover:translate-x-1 hover:shadow-lg"
                                style={{ 
                                    borderLeftColor: poolColor, 
                                    borderLeftWidth: '4px' 
                                }}
                            >
                                <div className="flex items-center gap-4">
                                    <div 
                                        className="w-10 h-10 rounded-lg flex items-center justify-center shadow-inner"
                                        style={{ backgroundColor: `${poolColor}20` }}
                                    >
                                        <div 
                                            className="w-3 h-3 rounded-full shadow-[0_0_8px]"
                                            style={{ backgroundColor: poolColor, boxShadow: `0 0 10px ${poolColor}` }}
                                        />
                                    </div>
                                    
                                    <div>
                                        <div className="font-bold text-slate-200 capitalize flex items-center gap-2 group-hover:text-white transition-colors text-lg">
                                            {pool.name}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{pool.description || s('dashboard.noDescriptionProvided')}</div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-1">
                                    <span 
                                        className="text-xs uppercase font-bold px-2 py-0.5 rounded border tracking-wider"
                                        style={{ 
                                            borderColor: `${poolColor}40`, 
                                            backgroundColor: `${poolColor}10`,
                                            color: poolColor 
                                        }}
                                    >
                                        {pool.type}
                                    </span>
                                    <span className="text-xs text-slate-600 font-mono">{s('dashboard.itemsCount', { count })}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
      </div>

      {/* DANGER ZONE */}
      <div className="border border-red-900/50 rounded-xl p-6 bg-gradient-to-br from-red-900/10 to-transparent mt-12">
          <h3 className="text-xl font-bold text-red-500 mb-2 flex items-center gap-2"><AlertTriangle size={20} /> {t.dashboard.danger.title}</h3>
          <p className="text-slate-400 text-sm mb-6">{t.dashboard.danger.desc}</p>
          
          {deleteStage === 0 && (
              <NexusButton 
                variant="destructive" 
                onClick={handleDeleteWorld} 
                icon={<Trash2 size={16} />}
                className="bg-red-900/20 border-red-900/50 hover:bg-red-900/40 text-red-500"
            >
                {t.dashboard.danger.buttons.delete}
            </NexusButton>
          )}

          {deleteStage === 1 && (
            <div className="animate-in fade-in slide-in-from-left-2 flex items-center gap-4 p-4 bg-red-900/20 rounded-lg border border-red-500/30">
                <AlertTriangle className="text-red-400 shrink-0" size={24} />
                <div className="flex-1">
                    <p className="text-red-200 font-bold text-sm">{t.dashboard.danger.warnings.stage1}</p>
                    <p className="text-red-300/70 text-xs">{t.dashboard.danger.warnings.stage1Desc}</p>
                </div>
                <div className="flex gap-2">
                    <NexusButton variant="ghost" onClick={() => setDeleteStage(0)}>{t.dashboard.danger.buttons.cancel}</NexusButton>
                    <NexusButton variant="destructive" onClick={handleDeleteWorld}>{t.dashboard.danger.buttons.confirm}</NexusButton>
                </div>
            </div>
          )}

          {deleteStage === 2 && (
             <div className="animate-in fade-in slide-in-from-left-2 flex items-center gap-4 p-4 bg-red-500/10 rounded-lg border border-red-500">
                <ShieldAlert className="text-red-500 shrink-0" size={24} />
                 <div className="flex-1">
                    <p className="text-red-400 font-black uppercase tracking-wider text-sm">{t.dashboard.danger.warnings.stage2}</p>
                    <p className="text-red-400/70 text-xs">{t.dashboard.danger.warnings.stage2Desc} <strong>{currentWorld.name}</strong>.</p>
                 </div>
                 <div className="flex gap-2">
                    <NexusButton variant="ghost" onClick={() => setDeleteStage(0)}>{s('common.abort')}</NexusButton>
                    <NexusButton variant="destructive" onClick={handleDeleteWorld} className="bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/50">
                        {t.dashboard.danger.buttons.finalConfirm}
                    </NexusButton>
                 </div>
             </div>
          )}
      </div>
    </div>
  );
};

export default Dashboard;