import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useParams, useLocation } from 'react-router-dom';
import { 
    LayoutDashboard, Database, Hammer, Dices, Layers, Globe, Workflow, 
    ArrowLeft, BookOpen, Contact, Settings, Sparkles, Save, Plus, 
    ChevronDown, ChevronRight, ChevronUp, Palette, Hash, Cuboid, Download,
    Menu, X
} from 'lucide-react';

// New Architecture Imports
import { useActiveWorld } from '../../contexts/ActiveWorldContext';
import { useWorldManager } from '../../contexts/ServiceContext';
import { useCurrentWorld } from '../../hooks/useWorldData';
import { useToast } from '../../contexts/ToastContext';
import { useTranslation } from '../../lib/translations'; // NEW IMPORT

import { PoolCategory, Pool } from '../../types';
import { NexusModal, NexusInput, NexusButton, Breadcrumb, useBreadcrumbs } from '../ui';
import { POOL_COLORS, TYPE_COLORS, getPoolColor } from '../../constants/colors';

interface SidebarItemProps {
  to: string;
  icon: any;
  label: string;
  exact?: boolean;
  poolCount?: number;
  color?: string;
  description?: string;
  // Reorder Props
  onMoveUp?: (e: React.MouseEvent) => void;
  onMoveDown?: (e: React.MouseEvent) => void;
  isFirst?: boolean;
  isLast?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ 
    to, icon: Icon, label, exact, poolCount, color, description,
    onMoveUp, onMoveDown, isFirst, isLast 
}) => (
  <div className="group/item flex items-center gap-1 pr-1">
      <NavLink
        to={to}
        end={exact}
        title={description}
        className={({ isActive }) =>
          `flex-1 flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200 text-xs font-medium select-none ${
            isActive
              ? 'bg-nexus-accent/20 text-nexus-accent border-r-2 border-nexus-accent'
              : 'text-slate-400 hover:bg-nexus-800 hover:text-slate-100'
          }`
        }
      >
        <div className="relative flex items-center justify-center">
            <Icon size={14} />
            {color && <span className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full border border-nexus-900" style={{ backgroundColor: color }} />}
        </div>
        <span className="tracking-wide flex-1 truncate">{label}</span>
        {poolCount !== undefined && poolCount > 0 && (
            <span className="text-xs bg-nexus-900 text-slate-500 px-1.5 py-0.5 rounded">{poolCount}</span>
        )}
      </NavLink>

      {/* Manual Sort Controls (Visible on Hover) */}
      {(onMoveUp || onMoveDown) && (
           <div className="flex flex-col gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
               <button 
                   onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoveUp?.(e); }}
                   disabled={isFirst}
                   className={`p-0.5 hover:bg-nexus-700 text-slate-500 hover:text-nexus-accent rounded ${isFirst ? 'invisible' : ''}`}
                   title="Move Up"
                >
                   <ChevronUp size={10} />
               </button>
               <button 
                   onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoveDown?.(e); }}
                   disabled={isLast}
                   className={`p-0.5 hover:bg-nexus-700 text-slate-500 hover:text-nexus-accent rounded ${isLast ? 'invisible' : ''}`}
                   title="Move Down"
                >
                   <ChevronDown size={10} />
               </button>
           </div>
       )}
  </div>
);

const CollapsibleSection = ({ 
    title, 
    isOpen, 
    onToggle, 
    onAdd, 
    children,
    headerColor
}: { 
    title: string, 
    isOpen: boolean, 
    onToggle: () => void, 
    onAdd: (e: React.MouseEvent) => void, 
    children?: React.ReactNode,
    headerColor?: string
}) => (
    <div className="mb-2">
        <div 
            onClick={onToggle}
            className="flex justify-between items-center px-2 py-2 cursor-pointer hover:bg-nexus-800/50 rounded transition-colors group"
        >
            <div 
                className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest"
                style={{ color: isOpen && headerColor ? headerColor : '#64748b' }}
            >
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {title}
            </div>
            <button 
                onClick={(e) => { e.stopPropagation(); onAdd(e); }} 
                className="text-slate-600 hover:text-white p-1 rounded hover:bg-nexus-700 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Create New Pool"
            >
                <Plus size={12}/>
            </button>
        </div>
        {isOpen && (
            <div className="pl-2 space-y-0.5 mt-1 animate-fade-in border-l border-slate-700/50 ml-3">
                {children}
            </div>
        )}
    </div>
);

// --- MAIN LAYOUT ---

const Layout: React.FC = () => {
  // 1. Inject Dependencies
  const { activeWorldId, setActiveWorldId, triggerRefresh } = useActiveWorld();
  const worldManager = useWorldManager();
  const { toast } = useToast();
  const t = useTranslation(); // Use Hook
  
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  // 2. Data Fetching
  const { world: currentWorld, loading } = useCurrentWorld(activeWorldId);

  // 3. UI State
  const [saveStatus, setSaveStatus] = useState<'Saved' | 'Saving...'>('Saved');
  const [createPoolType, setCreatePoolType] = useState<PoolCategory | null>(null);
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolDesc, setNewPoolDesc] = useState('');
  const [newPoolColor, setNewPoolColor] = useState('#3b82f6');
  
  // Form Validation
  const [poolNameError, setPoolNameError] = useState<string | undefined>();
  const [poolNameTouched, setPoolNameTouched] = useState(false);

  const validatePoolName = (name: string): string | undefined => {
      if (!name.trim()) return t.common?.validation?.required || 'Pool name is required';
      if (name.trim().length < 2) return t.common?.validation?.minLength || 'Name must be at least 2 characters';
      if (!/^[a-zA-Z0-9\s-]+$/.test(name)) return t.common?.validation?.invalidChars || 'Only letters, numbers, spaces and hyphens allowed';
      if (currentWorld?.pools[name.trim().toLowerCase().replace(/\s+/g, '-')]) return t.common?.validation?.alreadyExists || 'Pool with this name already exists';
      return undefined;
  };

  const handlePoolNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setNewPoolName(value);
      if (poolNameTouched) {
          setPoolNameError(validatePoolName(value));
      }
  };

  const handlePoolNameBlur = () => {
      setPoolNameTouched(true);
      setPoolNameError(validatePoolName(newPoolName));
  };

  // Reset pool form when modal closes
  useEffect(() => {
      if (!createPoolType) {
          setNewPoolName('');
          setNewPoolDesc('');
          setNewPoolColor('#3b82f6');
          setPoolNameError(undefined);
          setPoolNameTouched(false);
      }
  }, [createPoolType]);

  const [sections, setSections] = useState({
      world: true,
      character: true,
      asset: true
  });

  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
      setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
          if (e.key === 'Escape') setIsMobileMenuOpen(false);
      };
      if (isMobileMenuOpen) {
          document.addEventListener('keydown', handleEscape);
          document.body.style.overflow = 'hidden';
      }
      return () => {
          document.removeEventListener('keydown', handleEscape);
          document.body.style.overflow = 'unset';
      };
  }, [isMobileMenuOpen]);

  const toggleMobileMenu = useCallback(() => {
      setIsMobileMenuOpen(prev => !prev);
  }, []);

  // Local Sort Order State (Replaces Drag & Drop)
  const [orderedWorldPools, setOrderedWorldPools] = useState<Pool[]>([]);
  const [orderedCharacterPools, setOrderedCharacterPools] = useState<Pool[]>([]);
  const [orderedAssetPools, setOrderedAssetPools] = useState<Pool[]>([]);

  useEffect(() => {
      if (params.worldId && activeWorldId !== params.worldId) {
          setActiveWorldId(params.worldId);
      }
  }, [params.worldId, activeWorldId, setActiveWorldId]);

  // Sync Local Sort State when World loads/updates
  useEffect(() => {
      if (currentWorld) {
          const pools = Object.values(currentWorld.pools);
          
          // Helper to check if lists are essentially same content to avoid overwriting manual sort
          const hasDifferentContent = (current: Pool[], incoming: Pool[]) => {
              if (current.length !== incoming.length) return true;
              const currentNames = new Set(current.map(p => p.name));
              return incoming.some(p => !currentNames.has(p.name));
          };

          const worlds = pools.filter(p => p.type === 'World').sort((a,b) => a.name.localeCompare(b.name));
          const chars = pools.filter(p => p.type === 'Character').sort((a,b) => a.name.localeCompare(b.name));
          const assets = pools.filter(p => p.type === 'Asset').sort((a,b) => a.name.localeCompare(b.name));

          if (orderedWorldPools.length === 0 || hasDifferentContent(orderedWorldPools, worlds)) {
              setOrderedWorldPools(worlds);
          }
          if (orderedCharacterPools.length === 0 || hasDifferentContent(orderedCharacterPools, chars)) {
              setOrderedCharacterPools(chars);
          }
          if (orderedAssetPools.length === 0 || hasDifferentContent(orderedAssetPools, assets)) {
              setOrderedAssetPools(assets);
          }
      }
  }, [currentWorld]);

  const isHubMode = location.pathname === '/';
  
  // Get current pool name for breadcrumbs
  const currentPoolName = params.poolName ? 
      (currentWorld?.pools[params.poolName]?.name || params.poolName) : 
      undefined;
  
  // Generate breadcrumbs
  const breadcrumbItems = useBreadcrumbs(
      location.pathname,
      currentWorld?.name,
      currentPoolName
  );

  // --- Handlers ---

  const handleManualSave = async () => {
      if (currentWorld) {
          setSaveStatus('Saving...');
          await worldManager.saveWorld(currentWorld);
          setTimeout(() => setSaveStatus('Saved'), 500);
      }
  };

  const handleExport = async () => {
      if (!currentWorld) return;
      try {
          const json = await worldManager.exportWorldToJson(currentWorld.id);
          if (!json) throw new Error("Export failed");
          
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Nexus_${currentWorld.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          toast({ title: "Export Complete", message: "Rulebook package downloaded.", type: "success" });
      } catch (e) {
          toast({ title: "Export Failed", message: "Could not generate package.", type: "error" });
      }
  };

  const handleCreatePool = async () => {
      if (!currentWorld || !createPoolType) return;
      
      // Validate
      const validationError = validatePoolName(newPoolName);
      setPoolNameError(validationError);
      setPoolNameTouched(true);
      
      if (validationError) return;
      
      const name = newPoolName.trim().toLowerCase().replace(/\s+/g, '-');
      await worldManager.createPool(currentWorld.id, name, createPoolType, newPoolDesc, newPoolColor);
      
      triggerRefresh();
      setCreatePoolType(null);
      
      // Expand section
      if (createPoolType === 'World') setSections(s => ({ ...s, world: true }));
      if (createPoolType === 'Character') setSections(s => ({ ...s, character: true }));
      if (createPoolType === 'Asset') setSections(s => ({ ...s, asset: true }));
      
      setTimeout(() => {
          navigate(`/world/${currentWorld.id}/pool/${name}`);
      }, 50);
  };

  const toggleSection = (key: keyof typeof sections) => {
      setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // --- Sort Handlers ---
  const movePool = (index: number, direction: 'up' | 'down', list: Pool[], setList: React.Dispatch<React.SetStateAction<Pool[]>>) => {
      if (direction === 'up' && index === 0) return;
      if (direction === 'down' && index === list.length - 1) return;

      const newList = [...list];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      
      [newList[index], newList[swapIndex]] = [newList[swapIndex], newList[index]];
      setList(newList);
  };


  return (
    <div className="flex h-screen bg-nexus-900 text-slate-200 font-sans">
      {/* Mobile Header Bar - Only show when not in Hub mode */}
      {!isHubMode && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-nexus-800 border-b border-slate-700 flex items-center justify-between px-4 z-40 lg:hidden">
            <button
                onClick={toggleMobileMenu}
                className="p-2 text-slate-400 hover:text-white hover:bg-nexus-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-nexus-accent"
                aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMobileMenuOpen}
            >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h1 
                className="text-xl font-bold bg-gradient-to-r from-nexus-accent to-purple-500 bg-clip-text text-transparent cursor-pointer" 
                onClick={() => navigate('/')}
            >
                NEXUS
            </h1>
            <div className="w-10" /> {/* Spacer for centering */}
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {!isHubMode && isMobileMenuOpen && (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
        />
      )}

      {/* Sidebar - Desktop: always visible, Mobile: slide-in drawer */}
      {!isHubMode && (
        <aside 
            className={`
                fixed lg:static inset-y-0 left-0 z-50
                w-72 lg:w-64 bg-nexus-800 border-r border-slate-700 
                flex flex-col shadow-2xl
                transform transition-transform duration-300 ease-in-out
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                pt-14 lg:pt-0
            `}
            aria-label="Main navigation"
        >
            {/* Sidebar Header - Hidden on mobile (shown in top bar) */}
            <div className="p-6 border-b border-slate-700 hidden lg:block">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-nexus-accent to-purple-500 bg-clip-text text-transparent cursor-pointer" onClick={() => navigate('/')}>
                    NEXUS
                </h1>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest flex items-center gap-1">
                <BookOpen size={12} className="text-nexus-accent"/> {t.headers.worldEditor}
                </p>
            </div>

            {/* Sidebar Content */}
            <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
                <div className="mb-6">
                    <button 
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-xs text-slate-400 hover:text-white mb-4 transition-colors"
                    >
                        <ArrowLeft size={14} /> {t.sidebar.backToHub}
                    </button>

                    {loading && (
                        <div className="border p-3 rounded-lg bg-nexus-900 border-slate-700 animate-pulse">
                             <div className="h-3 w-20 bg-slate-700 rounded mb-2"></div>
                             <div className="h-4 w-32 bg-slate-700 rounded"></div>
                        </div>
                    )}

                    {!loading && currentWorld && (
                        <div className="border p-3 rounded-lg bg-nexus-900 border-slate-700">
                            <div className="text-xs uppercase font-bold mb-1 text-slate-500">
                                {t.sidebar.activeWorld}
                            </div>
                            <div className="font-bold text-white truncate">{currentWorld.name}</div>
                        </div>
                    )}
                </div>

                <nav className="space-y-1">
                    {params.worldId && currentWorld && (
                        <>
                            <SidebarItem to={`/world/${params.worldId}/edit`} icon={LayoutDashboard} label={t.sidebar.overview} exact />
                            <SidebarItem to={`/world/${params.worldId}/app-settings`} icon={Settings} label={t.sidebar.settings} />
                            <SidebarItem to={`/world/${params.worldId}/settings`} icon={Globe} label={t.sidebar.worldContext} />
                            
                            <div className="h-px bg-slate-700 my-4"></div>

                            {/* WORLD LORE SECTION (ARROW SORT) */}
                            <CollapsibleSection 
                                title={t.sidebar.worldLore} 
                                isOpen={sections.world} 
                                onToggle={() => toggleSection('world')}
                                onAdd={() => setCreatePoolType('World')}
                                headerColor={TYPE_COLORS['World']}
                            >
                                {orderedWorldPools.map((pool, idx) => (
                                    <SidebarItem 
                                        key={pool.name}
                                        to={`/world/${params.worldId}/pool/${pool.name}`} 
                                        icon={BookOpen} 
                                        label={pool.name.charAt(0).toUpperCase() + pool.name.slice(1)}
                                        poolCount={pool.entities.length}
                                        color={pool.color && pool.color !== '#64748b' ? pool.color : TYPE_COLORS['World']}
                                        description={pool.description}
                                        onMoveUp={() => movePool(idx, 'up', orderedWorldPools, setOrderedWorldPools)}
                                        onMoveDown={() => movePool(idx, 'down', orderedWorldPools, setOrderedWorldPools)}
                                        isFirst={idx === 0}
                                        isLast={idx === orderedWorldPools.length - 1}
                                    />
                                ))}
                                {orderedWorldPools.length === 0 && <div className="text-xs text-slate-600 pl-4 italic">{t.placeholders.noWorldPools}</div>}
                            </CollapsibleSection>

                            {/* CHARACTER LORE SECTION (ARROW SORT) */}
                            <CollapsibleSection 
                                title={t.sidebar.characterLore} 
                                isOpen={sections.character} 
                                onToggle={() => toggleSection('character')}
                                onAdd={() => setCreatePoolType('Character')}
                                headerColor={TYPE_COLORS['Character']}
                            >
                                {orderedCharacterPools.map((pool, idx) => (
                                    <SidebarItem 
                                        key={pool.name}
                                        to={`/world/${params.worldId}/pool/${pool.name}`} 
                                        icon={Contact} 
                                        label={pool.name.charAt(0).toUpperCase() + pool.name.slice(1)}
                                        poolCount={pool.entities.length}
                                        color={pool.color && pool.color !== '#64748b' ? pool.color : TYPE_COLORS['Character']}
                                        description={pool.description}
                                        onMoveUp={() => movePool(idx, 'up', orderedCharacterPools, setOrderedCharacterPools)}
                                        onMoveDown={() => movePool(idx, 'down', orderedCharacterPools, setOrderedCharacterPools)}
                                        isFirst={idx === 0}
                                        isLast={idx === orderedCharacterPools.length - 1}
                                    />
                                ))}
                                {orderedCharacterPools.length === 0 && <div className="text-xs text-slate-600 pl-4 italic">{t.placeholders.noCharPools}</div>}
                            </CollapsibleSection>

                            {/* ASSETS SECTION (ARROW SORT) */}
                            <CollapsibleSection 
                                title={t.sidebar.assetsData} 
                                isOpen={sections.asset} 
                                onToggle={() => toggleSection('asset')}
                                onAdd={() => setCreatePoolType('Asset')}
                                headerColor={TYPE_COLORS['Asset']}
                            >
                                {orderedAssetPools.map((pool, idx) => (
                                    <SidebarItem 
                                        key={pool.name}
                                        to={`/world/${params.worldId}/pool/${pool.name}`} 
                                        icon={Database} 
                                        label={pool.name.charAt(0).toUpperCase() + pool.name.slice(1)}
                                        poolCount={pool.entities.length}
                                        color={pool.color && pool.color !== '#64748b' ? pool.color : TYPE_COLORS['Asset']}
                                        description={pool.description}
                                        onMoveUp={() => movePool(idx, 'up', orderedAssetPools, setOrderedAssetPools)}
                                        onMoveDown={() => movePool(idx, 'down', orderedAssetPools, setOrderedAssetPools)}
                                        isFirst={idx === 0}
                                        isLast={idx === orderedAssetPools.length - 1}
                                    />
                                ))}
                                {orderedAssetPools.length === 0 && <div className="text-xs text-slate-600 pl-4 italic">{t.placeholders.noAssetPools}</div>}
                            </CollapsibleSection>

                            <div className="h-px bg-slate-700 my-4"></div>
                            
                            <div className="px-2 text-xs uppercase font-bold text-slate-500 mt-4 mb-1">{t.sidebar.tools}</div>
                            <SidebarItem to={`/world/${params.worldId}/components`} icon={Cuboid} label={t.sidebar.components} />
                            <SidebarItem to={`/world/${params.worldId}/tags`} icon={Hash} label={t.sidebar.tagManager} />
                            <SidebarItem to={`/world/${params.worldId}/forge`} icon={Hammer} label={t.sidebar.aiForge} />
                            <SidebarItem to={`/world/${params.worldId}/rules`} icon={Workflow} label={t.sidebar.rules} />
                            <SidebarItem to={`/world/${params.worldId}/roller`} icon={Dices} label={t.sidebar.rollerTest} />
                        </>
                    )}
                </nav>
            </div>

            {/* Sidebar Footer */}
            <div className="p-4 border-t border-slate-700 bg-nexus-850 space-y-3">
                <div className="flex gap-2">
                    <button 
                        onClick={handleExport}
                        className="flex-1 bg-nexus-accent hover:bg-blue-600 text-white py-2 rounded flex items-center justify-center gap-2 transition-all shadow-lg text-xs font-bold"
                        title="Export Rulebook JSON"
                    >
                        <Download size={14} /> {t.sidebar.export}
                    </button>
                    <button 
                        onClick={handleManualSave}
                        className="px-3 bg-nexus-900 border border-slate-600 text-slate-400 hover:text-white hover:border-nexus-accent rounded flex items-center justify-center transition-all"
                        title="Manual Save"
                    >
                        <Save size={14} className={saveStatus === 'Saving...' ? 'animate-pulse text-nexus-accent' : ''} />
                    </button>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-slate-500 justify-center pt-1">
                    <Layers size={12} />
                    <span>v5.2.2-Stable</span>
                </div>
            </div>
        </aside>
      )}

      {/* Main Content Area */}
      <main className={`flex-1 overflow-y-auto bg-nexus-900 relative ${!isHubMode ? 'pt-14 lg:pt-0' : ''}`}>
        <div className="absolute inset-0 bg-[url('[https://grainy-gradients.vercel.app/noise.svg](https://grainy-gradients.vercel.app/noise.svg)')] opacity-5 pointer-events-none"></div>
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 relative z-0">
          {/* Breadcrumb Navigation */}
          {!isHubMode && breadcrumbItems.length > 0 && (
            <div className="mb-4 pb-3 border-b border-slate-800">
              <Breadcrumb items={breadcrumbItems} />
            </div>
          )}
          <Outlet />
        </div>
      </main>

      {/* CREATE POOL MODAL */}
      <NexusModal 
        isOpen={!!createPoolType} 
        onClose={() => setCreatePoolType(null)} 
        title={<><Plus size={18} className="text-nexus-accent" /> {t.headers.createPool} ({createPoolType})</>}
        footer={
            <>
                <NexusButton variant="ghost" onClick={() => setCreatePoolType(null)}>{t.actions.cancel}</NexusButton>
                <NexusButton disabled={!newPoolName.trim()} onClick={handleCreatePool}>{t.actions.create}</NexusButton>
            </>
        }
      >
          <div className="space-y-4">
              <NexusInput 
                label="Pool Name"
                autoFocus
                value={newPoolName}
                onChange={handlePoolNameChange}
                onBlur={handlePoolNameBlur}
                placeholder="e.g. Guilds, Vehicles, Spells"
                required
                error={poolNameError}
              />
              <NexusInput 
                label="Description"
                value={newPoolDesc}
                onChange={e => setNewPoolDesc(e.target.value)}
                placeholder="Brief explanation of this category..."
              />
              <div>
                  <label className="block text-xs text-slate-500 uppercase font-bold mb-1.5 tracking-wide">Theme Color</label>
                  <div className="flex items-center gap-2">
                      <div className="flex flex-wrap gap-2">
                          {POOL_COLORS.slice(0, 6).map(c => (
                              <button
                                  key={c}
                                  type="button"
                                  onClick={() => setNewPoolColor(c)}
                                  className={`w-6 h-6 rounded-full border-2 transition-all ${newPoolColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-110'}`}
                                  style={{ backgroundColor: c }}
                              />
                          ))}
                      </div>
                      <div className="flex items-center gap-1 bg-nexus-900 border border-slate-600 rounded px-1.5 py-0.5 ml-2 relative overflow-hidden">
                          <Palette size={14} className="text-slate-400 absolute left-1.5 pointer-events-none" />
                          <input 
                              type="color" 
                              value={newPoolColor}
                              onChange={e => setNewPoolColor(e.target.value)}
                              className="w-8 h-6 bg-transparent border-none cursor-pointer opacity-0 z-10"
                              title="Custom Color"
                          />
                          <div className="w-4 h-4 rounded-full absolute right-1.5 pointer-events-none border border-slate-500" style={{ backgroundColor: newPoolColor }}></div>
                      </div>
                  </div>
              </div>
          </div>
      </NexusModal>
    </div>
  );
};

export default Layout;