// nexus-generator/src/pages/Home.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    PlusCircle, Edit2, Layers, BookOpen, Download, Upload, FileUp, 
    Sparkles, Settings, MessageSquare, Monitor, Check, 
    Trash2, Save, Plus, AlertTriangle, Languages, FlaskConical, ToggleLeft, ToggleRight, Lock,
    Bot, Zap, Key, Eye, EyeOff, CheckCircle, XCircle
} from 'lucide-react';
import { useWorldManager } from '../contexts/ServiceContext';
import { useActiveWorld } from '../contexts/ActiveWorldContext';
import { useToast } from '../contexts/ToastContext';
import { NexusButton, NexusInput, NexusModal, NexusTextArea, NexusSelect, EmptyState } from '../components/ui';
import { WorldForgeModal } from '../components/WorldForgeModal';
import { useAppSettings } from '../contexts/SettingsContext';
import { ToneDefinition } from '../types';
import { useTranslation } from '../lib/translations'; // NEW IMPORT
import { useStrings } from '../lib/translations';
import { useAIService } from '../contexts/AIServiceContext';
import { 
    AIProviderType, 
    PROVIDER_MODELS, 
    PROVIDER_INFO,
    getDefaultModel,
    BADGE_DEFINITIONS,
    TIER_COLORS
} from '../services/ai';

interface WorldListItem {
    id: string;
    name: string;
    type: string;
}

const Home: React.FC = () => {
  const navigate = useNavigate();
  const worldManager = useWorldManager();
  const { setActiveWorldId } = useActiveWorld();
  const { toast } = useToast();
  const { settings, updateSettings } = useAppSettings();
  const { settings: aiSettings, updateSettings: updateAISettings, isConfigured: aiIsConfigured } = useAIService();
  const t = useTranslation(); // HOOK
  const { s } = useStrings();
  
  const [worlds, setWorlds] = useState<WorldListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form States
  const [isCreatingWorld, setIsCreatingWorld] = useState(false);
  const [isForgeOpen, setIsForgeOpen] = useState(false); 
  const [newName, setNewName] = useState('');
  const [newGenre, setNewGenre] = useState('');
  
  // Form Validation States
  const [nameError, setNameError] = useState<string | undefined>();
  const [nameTouched, setNameTouched] = useState(false);

  // Validate world name
  const validateWorldName = (name: string): string | undefined => {
      if (!name.trim()) return t.common.validation.required;
      if (name.trim().length < 2) return t.common.validation.minLength;
      if (name.trim().length > 50) return t.common.validation.maxLength;
      return undefined;
  };

  // Handle name change with validation
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setNewName(value);
      if (nameTouched) {
          setNameError(validateWorldName(value));
      }
  };

  // Handle name blur for validation
  const handleNameBlur = () => {
      setNameTouched(true);
      setNameError(validateWorldName(newName));
  };

  // Reset form when modal closes
  useEffect(() => {
      if (!isCreatingWorld) {
          setNewName('');
          setNewGenre('');
          setNameError(undefined);
          setNameTouched(false);
      }
  }, [isCreatingWorld]);
  
  // GLOBAL SETTINGS MODAL STATE
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'interface' | 'narrative' | 'system'>('interface');
  
  // Narrative Role Editor State
  const [editingTone, setEditingTone] = useState<Partial<ToneDefinition> | null>(null);

  // AI Settings state
  const [showApiKey, setShowApiKey] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(aiSettings.apiKey || '');
  const [tempProvider, setTempProvider] = useState<AIProviderType>(aiSettings.provider);
  const [tempModel, setTempModel] = useState(aiSettings.model);

  // Sync AI settings when they change externally
  useEffect(() => {
    setTempApiKey(aiSettings.apiKey || '');
    setTempProvider(aiSettings.provider);
    setTempModel(aiSettings.model);
  }, [aiSettings]);

  const fileInputRef = useRef<HTMLInputElement>(null); // For World Import
  const configFileInputRef = useRef<HTMLInputElement>(null); // For Config Import

  const loadWorlds = async () => {
      setIsLoading(true);
      try {
          const allData = await worldManager.listWorlds();
          const filtered = allData.filter((w) => !w.type || w.type === 'Rulebook');
          setWorlds(filtered);
      } catch (e) {
          console.error("Failed to list worlds", e);
          toast({ title: s('home.toast.systemError.title'), message: s('home.toast.systemError.message'), type: "error" });
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
      loadWorlds();
  }, [worldManager]);

  const handleEnterWorld = (worldId: string) => {
      setActiveWorldId(worldId);
      navigate(`/world/${worldId}/edit`);
  };

  const handleCreateRulebook = async () => {
    // Validate all fields
    const nameValidationError = validateWorldName(newName);
    setNameError(nameValidationError);
    setNameTouched(true);
    
    if (nameValidationError) {
        return;
    }
    
    try {
        const newWorld = await worldManager.createWorld(newName, newGenre);
        setActiveWorldId(newWorld.id);
        setIsCreatingWorld(false);
        toast({ title: s('home.toast.worldInitialized.title'), message: s('home.toast.worldInitialized.message', { name: newWorld.name }), type: "success" });
        navigate(`/world/${newWorld.id}/edit`);
    } catch (e) {
        toast({ title: s('home.toast.creationFailed.title'), message: s('home.toast.creationFailed.message'), type: "error" });
    }
  };

  const handleExport = async (worldId: string, name: string) => {
      try {
          const json = await worldManager.exportWorldToJson(worldId);
          if (!json) throw new Error("Export failed");
          
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Nexus_${name.replace(/\s+/g, '_')}_${Date.now()}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          toast({ title: s('home.toast.exportComplete.title'), message: s('home.toast.exportComplete.message'), type: "success" });
      } catch (e) {
          toast({ title: s('home.toast.exportFailed.title'), message: s('home.toast.exportFailed.message'), type: "error" });
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          const content = event.target?.result as string;
          if (content) {
              try {
                  const imported = await worldManager.importWorldFromJson(content);
                  if (imported) {
                      loadWorlds(); 
                      toast({ title: s('home.toast.importSuccessful.title'), message: s('home.toast.importSuccessful.message', { name: imported.name }), type: "success" });
                  } else {
                      throw new Error("Invalid Format");
                  }
              } catch (e) {
                  toast({ title: s('home.toast.importFailed.title'), message: s('home.toast.importFailed.message'), type: "error" });
              }
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  // --- CONFIG IMPORT / EXPORT HANDLERS ---

  const handleExportConfig = () => {
      const exportData = {
          globalPromptPrefix: settings.globalPromptPrefix,
          tones: settings.tones
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexus_style_config_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: s('home.toast.styleExported.title'), message: s('home.toast.styleExported.message'), type: "success" });
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const content = event.target?.result as string;
              const data = JSON.parse(content);
              
              if (Array.isArray(data.tones)) {
                  updateSettings({
                      ...settings,
                      globalPromptPrefix: data.globalPromptPrefix || settings.globalPromptPrefix,
                      tones: data.tones
                  });
                  toast({ title: s('home.toast.styleImported.title'), message: s('home.toast.styleImported.message', { count: data.tones.length }), type: "success" });
              } else {
                  throw new Error("Invalid format");
              }
          } catch (err) {
              toast({ title: s('home.toast.invalidConfig.title'), message: s('home.toast.invalidConfig.message'), type: "error" });
          }
      };
      reader.readAsText(file);
      e.target.value = ''; // Reset input
  };

  // --- SETTINGS HANDLERS ---

  const handleUpdateUiScale = (scale: 'Small' | 'Medium' | 'Large') => {
      updateSettings({ ...settings, uiScale: scale });
      toast({ title: s('home.toast.interfaceScaled.title'), message: s('home.toast.interfaceScaled.message', { scale }), type: "success" });
  };

  const handleUpdateLanguage = (lang: 'English' | 'Chinese') => {
      updateSettings({ ...settings, defaultLanguage: lang });
  };

  const handleSaveTone = () => {
      if (!editingTone || !editingTone.name || !editingTone.instruction) return;
      
      const newTones = [...settings.tones];
      if (editingTone.id) {
          const idx = newTones.findIndex(t => t.id === editingTone.id);
          if (idx !== -1) newTones[idx] = editingTone as ToneDefinition;
      } else {
          newTones.push({
              ...editingTone,
              id: crypto.randomUUID(),
              description: editingTone.description || ''
          } as ToneDefinition);
      }
      
      updateSettings({ ...settings, tones: newTones });
      setEditingTone(null);
      toast({ title: s('home.toast.rolesUpdated.title'), message: s('home.toast.rolesUpdated.message'), type: "success" });
  };

  const handleDeleteTone = (id: string) => {
      const newTones = settings.tones.filter(t => t.id !== id);
      updateSettings({ ...settings, tones: newTones });
  };

  // AI Configuration handlers
  const handleProviderChange = (provider: AIProviderType) => {
      setTempProvider(provider);
      setTempModel(getDefaultModel(provider));
  };

  const handleSaveAIConfig = () => {
      updateAISettings({
          ...aiSettings,
          provider: tempProvider,
          model: tempModel,
          apiKey: tempApiKey
      });
      toast({ 
          title: s('home.toast.aiConfigSaved.title'), 
          message: s('home.toast.aiConfigSaved.message', { provider: PROVIDER_INFO[tempProvider].name, model: tempModel }),
          type: 'success' 
      });
  };

  // Get available models for current provider
  const availableModels = PROVIDER_MODELS[tempProvider] || [];
  const currentProviderInfo = PROVIDER_INFO[tempProvider];

  // --- RENDERERS ---

  const renderInterfaceSettings = () => (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
          <div className="bg-nexus-900 p-4 rounded-lg border border-slate-700">
              <h3 className="font-bold text-slate-200 mb-4 flex items-center gap-2">
                  <Monitor size={18} className="text-nexus-accent" /> UI Scaling
              </h3>
              <div className="grid grid-cols-3 gap-4">
                  {(['Small', 'Medium', 'Large'] as const).map(scale => (
                      <button
                          key={scale}
                          onClick={() => handleUpdateUiScale(scale)}
                          className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                              (settings.uiScale || 'Small') === scale
                              ? 'border-nexus-accent bg-nexus-accent/10 text-white'
                              : 'border-slate-700 bg-nexus-800 text-slate-500 hover:border-slate-500'
                          }`}
                      >
                          <span className={`font-bold mb-1 ${scale === 'Large' ? 'text-lg' : scale === 'Medium' ? 'text-base' : 'text-sm'}`}>
                              Aa
                          </span>
                          <span className="text-xs uppercase font-bold">{scale}</span>
                      </button>
                  ))}
              </div>
              <p className="text-xs text-slate-500 mt-4 text-center">
                  Adjusts the global font size and density of the Nexus interface.
              </p>
          </div>
      </div>
  );

  const renderNarrativeSettings = () => (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-2 h-[400px] flex flex-col">
          
          {/* IMPORT / EXPORT CONTROLS */}
          <div className="flex justify-between items-center bg-nexus-900 p-3 rounded-lg border border-slate-700">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Style Config</span>
              <div className="flex gap-2">
                   <input 
                       type="file" 
                       ref={configFileInputRef} 
                       onChange={handleImportConfig} 
                       accept=".json" 
                       className="hidden" 
                   />
                   <NexusButton size="sm" variant="ghost" onClick={() => configFileInputRef.current?.click()} icon={<Upload size={14} />}>
                       Import Style
                   </NexusButton>
                   <NexusButton size="sm" variant="ghost" onClick={handleExportConfig} icon={<Download size={14} />}>
                       Export Style
                   </NexusButton>
              </div>
          </div>

          {/* AI PREFIX */}
          <div className="shrink-0">
               <h3 className="font-bold text-slate-200 mb-2 flex items-center gap-2">
                  <MessageSquare size={16} className="text-blue-400" /> Global AI Prefix
              </h3>
              <NexusTextArea 
                  value={settings.globalPromptPrefix || ''}
                  onChange={e => updateSettings({ ...settings, globalPromptPrefix: e.target.value })}
                  placeholder="System instructions injected into every AI call (e.g. 'Be succinct', 'No modern tech')..."
                  className="h-64 text-xs font-mono" // Resized to h-64
              />
          </div>

          {/* ROLES EDITOR */}
          <div className="flex-1 min-h-0 flex flex-col">
               <div className="flex justify-between items-center mb-2 mt-4">
                   <h3 className="font-bold text-slate-200 flex items-center gap-2">
                      <Sparkles size={16} className="text-purple-400" /> Narrative Roles
                   </h3>
                   <button 
                      onClick={() => setEditingTone({ name: '', description: '', instruction: '' })}
                      className="text-xs flex items-center gap-1 text-nexus-accent hover:text-white"
                   >
                       <Plus size={12} /> Add Role
                   </button>
               </div>

               {editingTone ? (
                   <div className="bg-nexus-900 p-3 rounded border border-slate-700 space-y-3 animate-in zoom-in-95">
                       <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                           <span className="text-xs font-bold text-purple-400 uppercase">Editing Role</span>
                           <button onClick={() => setEditingTone(null)} className="text-slate-500 hover:text-white"><Settings size={12} /></button>
                       </div>
                       <div className="grid grid-cols-2 gap-2">
                           <NexusInput 
                               value={editingTone.name} 
                               onChange={e => setEditingTone({...editingTone, name: e.target.value})} 
                               placeholder="Role Name"
                           />
                           <NexusInput 
                               value={editingTone.description} 
                               onChange={e => setEditingTone({...editingTone, description: e.target.value})} 
                               placeholder="Short Desc"
                           />
                       </div>
                       <NexusTextArea 
                           value={editingTone.instruction} 
                           onChange={e => setEditingTone({...editingTone, instruction: e.target.value})} 
                           placeholder="System Instruction (e.g. 'You are a gritty narrator...')"
                           className="h-20 text-xs"
                       />
                       <div className="flex justify-end gap-2">
                           <NexusButton size="sm" variant="ghost" onClick={() => setEditingTone(null)}>{t.common.cancel}</NexusButton>
                           <NexusButton size="sm" onClick={handleSaveTone} icon={<Save size={12}/>}>{t.common.save}</NexusButton>
                       </div>
                   </div>
               ) : (
                   <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 border border-slate-700 rounded bg-nexus-900 p-2">
                       {settings.tones.map(tone => (
                           <div key={tone.id} className="bg-nexus-800 p-2 rounded border border-slate-700 flex justify-between items-center group">
                               <div className="min-w-0 pr-2">
                                   <div className="text-xs font-bold text-slate-200">{tone.name}</div>
                                   <div className="text-xs text-slate-500 whitespace-normal leading-relaxed">{tone.description}</div>
                               </div>
                               <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                   <button onClick={() => setEditingTone(tone)} className="p-1 text-slate-400 hover:text-white"><Edit2 size={12} /></button>
                                   <button onClick={() => handleDeleteTone(tone.id)} className="p-1 text-slate-400 hover:text-red-400"><Trash2 size={12} /></button>
                               </div>
                           </div>
                       ))}
                   </div>
               )}
          </div>
      </div>
  );

  const renderSystemSettings = () => (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
          {/* AI Provider Configuration */}
          <div className="bg-nexus-900 p-4 rounded-lg border border-slate-700">
              <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                      <Bot size={20} className="text-yellow-400" />
                      <div>
                          <h3 className="font-bold text-slate-200 text-sm">AI Provider Configuration</h3>
                          <p className="text-xs text-slate-500">Choose your AI provider and model for content generation.</p>
                      </div>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                      aiIsConfigured 
                      ? 'bg-green-500/10 border border-green-500/30 text-green-400' 
                      : 'bg-red-500/10 border border-red-500/30 text-red-400'
                  }`}>
                      {aiIsConfigured ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {aiIsConfigured ? 'Connected' : 'Not Configured'}
                  </div>
              </div>

              <div className="space-y-4">
                  {/* Provider Selection */}
                  <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(PROVIDER_INFO) as AIProviderType[]).map(provider => {
                          const info = PROVIDER_INFO[provider];
                          const isActive = tempProvider === provider;
                          return (
                              <button
                                  key={provider}
                                  onClick={() => handleProviderChange(provider)}
                                  className={`flex flex-col items-start p-3 rounded-lg border transition-all text-left ${
                                      isActive 
                                      ? 'bg-nexus-accent/10 border-nexus-accent' 
                                      : 'bg-nexus-950 border-slate-700 hover:border-slate-500'
                                  }`}
                              >
                                  <div className="flex items-center gap-2 mb-1">
                                      <span className={`font-bold text-xs ${isActive ? 'text-nexus-accent' : 'text-slate-300'}`}>
                                          {info.name}
                                      </span>
                                      {isActive && <Check size={12} className="text-nexus-accent" />}
                                  </div>
                                  <span className="text-xs text-slate-500">{info.description}</span>
                              </button>
                          );
                      })}
                  </div>

                  {/* Model Selection */}
                  <div className="bg-nexus-950 p-3 rounded-lg border border-slate-700">
                      <label className="block text-xs text-slate-500 uppercase font-bold mb-2 tracking-wide flex items-center gap-2">
                          <Zap size={10} /> Select Model
                      </label>
                      <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto custom-scrollbar">
                          {availableModels.map(model => {
                              const isActive = tempModel === model.id;
                              return (
                                  <button
                                      key={model.id}
                                      onClick={() => setTempModel(model.id)}
                                      className={`flex items-center justify-between p-2.5 rounded border transition-all ${
                                          isActive 
                                          ? 'bg-nexus-accent/10 border-nexus-accent' 
                                          : 'bg-nexus-900 border-slate-700 hover:border-slate-500'
                                      }`}
                                  >
                                      <div className="flex flex-col items-start min-w-0 flex-1 pr-2">
                                          <span className={`font-bold text-xs ${isActive ? 'text-nexus-accent' : 'text-slate-300'}`}>
                                              {model.name}
                                          </span>
                                          <span 
                                              className="text-xs text-slate-500 truncate min-w-0"
                                              title={model.description}
                                          >
                                              {model.description}
                                          </span>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                                          {/* Price tier badge */}
                                          <span className={`text-xs px-1.5 py-0.5 rounded border font-bold uppercase ${TIER_COLORS[model.tier]}`}>
                                              {model.tier}
                                          </span>
                                          {/* Feature badges */}
                                          {model.badges?.map(badge => {
                                              const badgeDef = BADGE_DEFINITIONS[badge];
                                              if (!badgeDef) return null;
                                              return (
                                                  <span 
                                                      key={badge}
                                                      className={`text-xs px-1.5 py-0.5 rounded border font-bold uppercase ${badgeDef.className}`}
                                                      title={badgeDef.label}
                                                  >
                                                      {badgeDef.label}
                                                  </span>
                                              );
                                          })}
                                          {isActive && <Check size={12} className="text-nexus-accent shrink-0" />}
                                      </div>
                                  </button>
                              );
                          })}
                      </div>
                  </div>

                  {/* Use Custom Key Toggle */}
                  <div className="flex items-center justify-between bg-nexus-950 p-3 rounded-lg border border-slate-700">
                      <div>
                          <h4 className="font-bold text-slate-200 text-xs">Use Custom API Key</h4>
                          <p className="text-xs text-slate-500">
                              {aiSettings.useCustomKey 
                                  ? 'Using your personal API key (stored locally)' 
                                  : `Using environment variable (${currentProviderInfo.envKey})`}
                          </p>
                      </div>
                      <button 
                          onClick={() => {
                              const newSettings = { ...aiSettings, useCustomKey: !aiSettings.useCustomKey };
                              updateAISettings(newSettings);
                              toast({ 
                                  title: s('home.toast.apiModeChanged.title'), 
                                  message: newSettings.useCustomKey 
                                      ? s('home.toast.apiModeChanged.custom')
                                      : s('home.toast.apiModeChanged.env'),
                                  type: 'info' 
                              });
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all text-xs font-bold ${
                              aiSettings.useCustomKey 
                                  ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' 
                                  : 'bg-slate-800 border-slate-600 text-slate-500'
                          }`}
                      >
                          {aiSettings.useCustomKey ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          {aiSettings.useCustomKey ? 'Custom' : 'Env'}
                      </button>
                  </div>

                  {/* API Key Input (only shown when using custom key) */}
                  {aiSettings.useCustomKey && (
                      <div className="bg-nexus-950 p-3 rounded-lg border border-slate-700 animate-in slide-in-from-top-2">
                          <label className="block text-xs text-slate-500 uppercase font-bold mb-2 tracking-wide flex items-center gap-2">
                              <Key size={10} /> {currentProviderInfo.name} API Key
                          </label>
                          <div className="flex gap-2">
                              <div className="flex-1 relative">
                                  <NexusInput
                                      type={showApiKey ? 'text' : 'password'}
                                      value={tempApiKey}
                                      onChange={e => setTempApiKey(e.target.value)}
                                      placeholder={tempProvider === 'openai' ? 'sk-...' : 'AIza...'}
                                      className="text-xs font-mono pr-10"
                                  />
                                  <button 
                                      onClick={() => setShowApiKey(!showApiKey)}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                  >
                                      {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                  </button>
                              </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                              {tempProvider === 'gemini' && (
                                  <>Get your API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-nexus-accent hover:underline">Google AI Studio</a>.</>
                              )}
                              {tempProvider === 'openai' && (
                                  <>Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-nexus-accent hover:underline">OpenAI Dashboard</a>.</>
                              )}
                              {' '}Your key is stored locally and never sent to any server.
                          </p>
                      </div>
                  )}

                  {/* Save Button */}
                  <div className="flex justify-end pt-1">
                      <NexusButton size="sm" onClick={handleSaveAIConfig} icon={<Save size={12} />}>
                          Save AI Configuration
                      </NexusButton>
                  </div>
              </div>
          </div>

          {/* Language */}
          <div className="bg-nexus-900 p-4 rounded-lg border border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                  <Languages size={20} className="text-orange-400" />
                  <div>
                      <h3 className="font-bold text-slate-200 text-sm">Default Language</h3>
                      <p className="text-xs text-slate-500">Output language for AI generation.</p>
                  </div>
              </div>
              <div className="flex bg-nexus-950 rounded p-1 border border-slate-800">
                  {(['English', 'Chinese'] as const).map(lang => (
                      <button
                          key={lang}
                          onClick={() => handleUpdateLanguage(lang)}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                              settings.defaultLanguage === lang
                              ? 'bg-nexus-accent text-white shadow'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                      >
                          {lang === 'Chinese' ? '中文' : 'EN'}
                      </button>
                  ))}
              </div>
          </div>

          {/* Experimental - NOW DISABLED PLACEHOLDER */}
          <div className="bg-nexus-900/50 p-4 rounded-lg border border-slate-800 flex items-center justify-between opacity-75 grayscale">
              <div className="flex items-center gap-3">
                  <FlaskConical size={20} className="text-slate-500" />
                  <div>
                      <h3 className="font-bold text-slate-400 text-sm flex items-center gap-2">
                        Image Generation 
                        <span className="bg-slate-800 text-slate-500 text-xs px-1.5 py-0.5 rounded uppercase tracking-wider">Coming Soon</span>
                      </h3>
                      <p className="text-xs text-slate-600">Visual asset generation is currently disabled.</p>
                  </div>
              </div>
              <button 
                  disabled
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-700 bg-slate-800/50 text-slate-600 text-xs font-bold cursor-not-allowed"
              >
                  <Lock size={14} />
                  Unavailable
              </button>
          </div>
      </div>
  );

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 min-h-screen flex flex-col">
      <header className="text-center mb-16 space-y-4 relative animate-fade-in">
        <h1 className="text-6xl font-black bg-gradient-to-r from-nexus-accent via-purple-500 to-nexus-accent bg-clip-text text-transparent tracking-tight drop-shadow-lg">
            {t.home.hero.title}
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto whitespace-pre-wrap">
            {t.home.hero.subtitle}
        </p>
        
        <div className="absolute top-0 right-0 flex gap-3">
            <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 text-slate-400 hover:text-white bg-nexus-800 border border-slate-700 hover:border-nexus-accent px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg group"
            >
                <Settings size={16} className="group-hover:rotate-90 transition-transform duration-500" /> 
                {t.home.buttons.globalConfig}
            </button>
            
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".json" 
                className="hidden"
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-slate-500 hover:text-nexus-accent border border-slate-700 hover:border-nexus-accent px-3 py-1.5 rounded text-xs font-bold transition-colors"
            >
                <Upload size={14} /> {t.home.buttons.import}
            </button>
        </div>
      </header>

      {/* WORLDS GRID */}
      <div className="flex-1 animate-fade-in delay-100">
        <div className="flex justify-between items-center mb-6 pb-2 border-b border-slate-700">
            <h2 className="text-2xl font-bold text-slate-200 flex items-center gap-3">
                <BookOpen className="text-nexus-accent" /> {t.home.headers.availableWorlds}
            </h2>
            <div className="flex gap-3">
                <NexusButton 
                    variant="secondary" 
                    onClick={() => setIsForgeOpen(true)} 
                    icon={<Sparkles size={18} className="text-purple-400"/>}
                    className="border-purple-500/30 hover:border-purple-500/60"
                >
                    {t.home.buttons.aiGenesis}
                </NexusButton>
                
                <NexusButton onClick={() => setIsCreatingWorld(true)} icon={<PlusCircle size={18} />}>
                    {t.home.buttons.newWorld}
                </NexusButton>
            </div>
        </div>

        {isLoading ? (
             <div className="text-center py-20 opacity-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nexus-accent mx-auto mb-4"></div>
                <p className="text-slate-500 text-sm font-mono uppercase">{t.common.loading}</p>
             </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {worlds.map(world => (
                    <div key={world.id} className="group bg-nexus-800 border border-slate-700 rounded-xl overflow-hidden hover:border-nexus-accent hover:shadow-2xl transition-all duration-300 flex flex-col relative">
                        <div className="p-6 flex-1 relative z-10">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="text-2xl font-bold text-white group-hover:text-nexus-accent transition-colors truncate pr-8">{world.name}</h3>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleExport(world.id, world.name); }}
                                    className="text-slate-500 hover:text-white p-1.5 rounded hover:bg-slate-700 transition-colors"
                                    title={t.sidebar.export}
                                >
                                    <Download size={16} />
                                </button>
                            </div>
                            <div className="inline-block bg-nexus-900 px-3 py-1 rounded-full text-xs font-bold text-purple-400 border border-purple-500/20 mb-4 font-mono">
                                ID: {world.id.substring(0, 8)}...
                            </div>
                            <p className="text-slate-500 text-sm flex items-center gap-2">
                                <Layers size={14} /> {world.type || 'Rulebook'}
                            </p>
                        </div>
                        
                        <div className="bg-nexus-900/50 p-4 border-t border-slate-700 group-hover:bg-nexus-900 transition-colors">
                            <button 
                                onClick={() => handleEnterWorld(world.id)}
                                className="w-full flex items-center justify-center gap-2 bg-nexus-800 hover:bg-nexus-accent text-slate-300 hover:text-white py-3 rounded-lg border border-slate-600 hover:border-nexus-accent font-bold transition-all shadow-lg"
                            >
                                <Edit2 size={16} /> {t.home.buttons.openEditor}
                            </button>
                        </div>
                        
                        {/* Decorative BG */}
                        <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/40 pointer-events-none"></div>
                    </div>
                ))}
                
                {worlds.length === 0 && (
                    <div className="col-span-3 bg-nexus-800/30 border-2 border-dashed border-slate-700 rounded-xl">
                        <EmptyState
                            icon={FileUp}
                            title={t.home.emptyState.title}
                            description={t.home.emptyState.desc}
                            actionLabel={t.home.buttons.createFirst}
                            onAction={() => setIsCreatingWorld(true)}
                            secondaryLabel={t.home.buttons.aiGenesis}
                            onSecondaryAction={() => setIsForgeOpen(true)}
                            size="lg"
                        />
                    </div>
                )}
            </div>
        )}
      </div>

       {/* GLOBAL SETTINGS MODAL */}
       <NexusModal
           isOpen={isSettingsOpen}
           onClose={() => setIsSettingsOpen(false)}
           title={<><Settings size={18} className="text-nexus-accent"/> {t.home.modals.config.title}</>}
           maxWidth="max-w-4xl"
           footer={
               <div className="flex justify-end w-full">
                   <NexusButton onClick={() => setIsSettingsOpen(false)}>{t.common.close}</NexusButton>
               </div>
           }
       >
           <div className="h-[700px] flex flex-col">
               {/* TABS */}
               <div className="flex gap-1 bg-nexus-900 p-1 rounded-lg mb-6 shrink-0 border border-slate-800">
                   {[
                       { id: 'interface', label: t.home.modals.config.tabs.interface, icon: Monitor },
                       { id: 'narrative', label: t.home.modals.config.tabs.narrative, icon: BookOpen },
                       { id: 'system', label: t.home.modals.config.tabs.system, icon: Settings }
                   ].map(tab => (
                       <button
                           key={tab.id}
                           onClick={() => setSettingsTab(tab.id as any)}
                           className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-all ${
                               settingsTab === tab.id 
                               ? 'bg-nexus-800 text-white shadow shadow-black/20' 
                               : 'text-slate-500 hover:text-slate-300'
                           }`}
                       >
                           <tab.icon size={14} /> {tab.label}
                       </button>
                   ))}
               </div>

               {/* TAB CONTENT */}
               <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                   {settingsTab === 'interface' && renderInterfaceSettings()}
                   {settingsTab === 'narrative' && renderNarrativeSettings()}
                   {settingsTab === 'system' && renderSystemSettings()}
               </div>
           </div>
       </NexusModal>

       {/* MANUAL CREATE MODAL */}
       <NexusModal 
            isOpen={isCreatingWorld} 
            onClose={() => setIsCreatingWorld(false)} 
            title={t.home.modals.create.title}
            footer={
                <div className="flex w-full justify-between gap-4">
                    <NexusButton variant="ghost" onClick={() => setIsCreatingWorld(false)}>{t.common.cancel}</NexusButton>
                    <NexusButton onClick={handleCreateRulebook} icon={<PlusCircle size={16}/>}>{t.home.modals.create.submit}</NexusButton>
                </div>
            }
       >
            <div className="space-y-4">
                <NexusInput 
                  label={t.home.modals.create.nameLabel}
                  value={newName}
                  onChange={handleNameChange}
                  onBlur={handleNameBlur}
                  placeholder="e.g. Neon Tokyo Core"
                  autoFocus
                  required
                  error={nameError}
                />
                <NexusInput 
                  label={t.home.modals.create.genreLabel}
                  value={newGenre}
                  onChange={e => setNewGenre(e.target.value)}
                  placeholder="e.g. Cyberpunk"
                />
                <div className="bg-blue-900/10 border border-blue-500/20 p-3 rounded text-xs text-blue-200 flex gap-2">
                    <BookOpen size={16} className="shrink-0" />
                    <p>{t.home.modals.create.desc}</p>
                </div>
            </div>
       </NexusModal>

       {/* AI FORGE MODAL */}
       <WorldForgeModal 
            isOpen={isForgeOpen} 
            onClose={() => setIsForgeOpen(false)}
            onSuccess={handleEnterWorld}
       />
    </div>
  );
};

export default Home;