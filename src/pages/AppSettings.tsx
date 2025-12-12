// nexus-generator/src/pages/AppSettings.tsx
import React, { useContext, useState, useEffect, useRef } from 'react';
import { useWorld } from '../hooks/useWorld';
import { LogContext } from '../contexts/LogContext';
import { useAIService } from '../contexts/AIServiceContext';
import { Settings, Globe, Check, Terminal, Sparkles, Plus, Trash2, Edit2, Save, FlaskConical, ToggleLeft, ToggleRight, AlignLeft, AlertTriangle, Monitor, Download, Upload, Key, Eye, EyeOff, Zap, CheckCircle, XCircle, ChevronDown, Bot } from 'lucide-react';
import { LogViewer } from '../components/SharedForgeComponents';
import { ToneDefinition, LengthConfig } from '../types';
import { NexusTextArea, NexusInput, NexusButton, NexusModal } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useStrings } from '../lib/translations';
import { 
    AIProviderType, 
    PROVIDER_MODELS, 
    PROVIDER_INFO,
    getDefaultModel,
    BADGE_DEFINITIONS,
    TIER_COLORS
} from '../services/ai';

const AppSettings: React.FC = () => {
    const { appSettings, updateAppSettings } = useWorld();
    const { settings: aiSettings, updateSettings: updateAISettings, isConfigured: aiIsConfigured } = useAIService();
    const logContext = useContext(LogContext);
    const { toast } = useToast();
    const { s } = useStrings();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // AI Settings state
    const [showApiKey, setShowApiKey] = useState(false);
    const [tempApiKey, setTempApiKey] = useState(aiSettings.apiKey || '');
    const [tempProvider, setTempProvider] = useState<AIProviderType>(aiSettings.provider);
    const [tempModel, setTempModel] = useState(aiSettings.model);

    // State for Modals
    const [isToneModalOpen, setIsToneModalOpen] = useState(false);
    const [editingTone, setEditingTone] = useState<Partial<ToneDefinition>>({});
    const [deleteToneId, setDeleteToneId] = useState<string | null>(null);

    // Length Definition State
    const [lengths, setLengths] = useState<LengthConfig>({
        short: '', medium: '', long: ''
    });

    if (!logContext) return null;
    const { globalLogs, toggleGlobalLog } = logContext;

    // Sync local state
    useEffect(() => {
        if (appSettings.lengthDefinitions) {
            setLengths(appSettings.lengthDefinitions);
        } else {
            setLengths({
                short: 'Maximum 30 words. Concise.',
                medium: 'Approx 60-80 words. Standard detail.',
                long: 'Minimum 120 words. Rich detail and nuance.'
            });
        }
    }, [appSettings.lengthDefinitions]);

    // Sync AI settings when they change externally
    useEffect(() => {
        setTempApiKey(aiSettings.apiKey || '');
        setTempProvider(aiSettings.provider);
        setTempModel(aiSettings.model);
    }, [aiSettings]);

    // --- Actions ---

    const setLanguage = (lang: 'English' | 'Chinese') => {
        updateAppSettings({ ...appSettings, defaultLanguage: lang });
        toast({ title: s('home.toast.rolesUpdated.title'), message: (lang === 'Chinese' ? '输出语言已设为中文。' : `Output set to ${lang}.`), type: "success" });
    };

    const setDefaultOutputLength = (len: 'Short' | 'Medium' | 'Long') => {
        updateAppSettings({ ...appSettings, defaultOutputLength: len });
        toast({ title: s('dashboard.toast.configSaved.title'), message: (appSettings.defaultLanguage === 'Chinese' ? `默认长度已设为 ${len === 'Short' ? '短' : len === 'Medium' ? '中' : '长'}。` : `Default length set to ${len}.`), type: "success" });
    };
    
    const setUiScale = (scale: 'Small' | 'Medium' | 'Large') => {
        updateAppSettings({ ...appSettings, uiScale: scale });
        toast({ title: s('home.toast.interfaceScaled.title'), message: s('home.toast.interfaceScaled.message', { scale }), type: "success" });
    };

    const toggleImageGen = () => {
        const newState = !appSettings.enableImageGen;
        updateAppSettings({ ...appSettings, enableImageGen: newState });
        toast({ 
            title: newState ? s('appSettings.state.enabled') : s('appSettings.state.disabled'), 
            message: (newState ? (appSettings.defaultLanguage === 'Chinese' ? '图像生成已启用。' : 'Image Generation is now active.') : (appSettings.defaultLanguage === 'Chinese' ? '图像生成已禁用。' : 'Image Generation is now inactive.')),
            type: newState ? "success" : "info" 
        });
    };

    const handleSaveLengths = () => {
        updateAppSettings({
            ...appSettings,
            lengthDefinitions: lengths
        });
        toast({ title: s('dashboard.toast.configSaved.title'), message: (appSettings.defaultLanguage === 'Chinese' ? '长度定义已更新。' : 'Length definitions updated.'), type: "success" });
    };

    // --- AI Configuration Actions ---
    
    const handleProviderChange = (provider: AIProviderType) => {
        setTempProvider(provider);
        // Reset to default model for the new provider
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

    // --- IMPORT / EXPORT HANDLERS ---

    const handleExportConfig = () => {
        const exportData = {
            globalPromptPrefix: appSettings.globalPromptPrefix,
            tones: appSettings.tones
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
        toast({ title: s('home.toast.styleExported.title'), message: (appSettings.defaultLanguage === 'Chinese' ? '风格设置已保存到文件。' : 'Tone settings saved to file.'), type: "success" });
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
                    updateAppSettings({
                        ...appSettings,
                        globalPromptPrefix: data.globalPromptPrefix || appSettings.globalPromptPrefix,
                        tones: data.tones
                    });
                    toast({ title: s('home.toast.styleImported.title'), message: (appSettings.defaultLanguage === 'Chinese' ? `已加载 ${data.tones.length} 个语气预设与前缀。` : `Loaded ${data.tones.length} tones and prefix.`), type: "success" });
                } else {
                    throw new Error("Invalid format");
                }
            } catch (err) {
                toast({ title: s('home.toast.importFailed.title'), message: s('home.toast.invalidConfig.message'), type: "error" });
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input
    };

    // --- Tone Management ---

    const openToneModal = (tone?: ToneDefinition) => {
        if (tone) {
            setEditingTone({ ...tone });
        } else {
            setEditingTone({ name: '', description: '', instruction: '' });
        }
        setIsToneModalOpen(true);
    };

    const handleSaveTone = () => {
        if (!editingTone.name || !editingTone.instruction) {
            toast({ title: s('dashboard.validationError.title'), message: (appSettings.defaultLanguage === 'Chinese' ? '名称与指令为必填项。' : 'Name and Instruction are required.'), type: "warning" });
            return;
        }
        
        const newTones = [...appSettings.tones];
        
        // Remove i18n from manually edited tone to ensure it persists as-is
        const finalTone = {
            ...editingTone,
            i18n: undefined 
        } as ToneDefinition;

        if (finalTone.id) {
            // Edit existing
            const index = newTones.findIndex(t => t.id === finalTone.id);
            if (index !== -1) {
                newTones[index] = finalTone;
            }
        } else {
            // Create new
            newTones.push({
                ...finalTone,
                id: crypto.randomUUID(),
                description: finalTone.description || ''
            });
        }

        updateAppSettings({ ...appSettings, tones: newTones });
        setIsToneModalOpen(false);
        toast({ title: (appSettings.defaultLanguage === 'Chinese' ? '角色已保存' : 'Role Saved'), message: (appSettings.defaultLanguage === 'Chinese' ? `叙事角色“${finalTone.name}”已更新。` : `Narrative role '${finalTone.name}' updated.`), type: "success" });
    };

    const confirmDeleteTone = () => {
        if (!deleteToneId) return;
        const newTones = appSettings.tones.filter(t => t.id !== deleteToneId);
        updateAppSettings({ ...appSettings, tones: newTones });
        setDeleteToneId(null);
        toast({ title: (appSettings.defaultLanguage === 'Chinese' ? '角色已删除' : 'Role Deleted'), message: (appSettings.defaultLanguage === 'Chinese' ? '叙事角色已移除。' : 'Narrative role removed.'), type: "info" });
    };

    // Get available models for current provider
    const availableModels = PROVIDER_MODELS[tempProvider] || [];
    const currentProviderInfo = PROVIDER_INFO[tempProvider];

    return (
        <div className="max-w-4xl mx-auto py-10 pb-20 animate-fade-in">
            <header className="mb-10 border-b border-slate-700 pb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
                        <Settings className="text-nexus-accent" />
                        {s('appSettings.title')}
                    </h2>
                    <p className="text-slate-400">{s('appSettings.subtitle')}</p>
                </div>
                
                {/* NEW UI: Import/Export Buttons */}
                <div className="flex gap-2">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImportConfig} 
                        accept=".json" 
                        className="hidden" 
                    />
                    <NexusButton variant="secondary" onClick={() => fileInputRef.current?.click()} icon={<Upload size={16} />}>
                        {s('appSettings.importStyle')}
                    </NexusButton>
                    <NexusButton variant="secondary" onClick={handleExportConfig} icon={<Download size={16} />}>
                        {s('appSettings.exportStyle')}
                    </NexusButton>
                </div>
            </header>

            <div className="space-y-8">
                
                {/* 1. General Configuration */}
                <div className="bg-nexus-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-nexus-900 rounded-lg text-nexus-accent border border-slate-700">
                            <Globe size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-slate-200 mb-6">{s('appSettings.section.localization')}</h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Language */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-3">{s('appSettings.label.targetLanguage')}</label>
                                    <div className="flex flex-col gap-2">
                                        {(['English', 'Chinese'] as const).map(lang => (
                                            <button 
                                                key={lang}
                                                onClick={() => setLanguage(lang)}
                                                className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all text-sm font-bold ${
                                                    appSettings.defaultLanguage === lang 
                                                    ? 'bg-nexus-accent/20 border-nexus-accent text-white shadow-inner' 
                                                    : 'bg-nexus-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                                                }`}
                                            >
                                                {lang === 'Chinese' ? 'Chinese (中文)' : lang}
                                                {appSettings.defaultLanguage === lang && <Check size={16} className="text-nexus-accent" />}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2 px-1">{s('appSettings.hint.languageSwitch')}</p>
                                </div>

                                {/* UI Scale */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                                        <Monitor size={12} /> {s('appSettings.label.interfaceScale')}
                                    </label>
                                    <div className="flex flex-col gap-2 bg-nexus-900 p-2 rounded-lg border border-slate-700">
                                        {(['Small', 'Medium', 'Large'] as const).map(scale => {
                                            const isActive = (appSettings.uiScale || 'Small') === scale;
                                            return (
                                                <button
                                                    key={scale}
                                                    onClick={() => setUiScale(scale)}
                                                    className={`flex items-center justify-between px-3 py-2 rounded text-xs font-bold transition-all ${
                                                        isActive 
                                                        ? 'bg-nexus-accent text-white shadow' 
                                                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                                    }`}
                                                >
                                                    <span className={scale === 'Medium' ? 'text-base' : scale === 'Large' ? 'text-lg' : 'text-sm'}>
                                                        {scale}
                                                    </span>
                                                    {isActive && <Check size={14} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2 px-1">{s('appSettings.hint.scale')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. AI Provider Configuration */}
                <div className="bg-nexus-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-nexus-900 rounded-lg text-yellow-400 border border-slate-700">
                            <Bot size={24} />
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-200 mb-2">{s('appSettings.aiProvider.title')}</h3>
                                    <p className="text-sm text-slate-400">
                                        {s('appSettings.aiProvider.subtitle')}
                                    </p>
                                </div>
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                                    aiIsConfigured 
                                    ? 'bg-green-500/10 border border-green-500/30 text-green-400' 
                                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                                }`}>
                                    {aiIsConfigured ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                    {aiIsConfigured ? s('appSettings.status.connected') : s('appSettings.status.notConfigured')}
                                </div>
                            </div>

                            <div className="space-y-5">
                                {/* Provider Selection */}
                                <div className="grid grid-cols-2 gap-3">
                                    {(Object.keys(PROVIDER_INFO) as AIProviderType[]).map(provider => {
                                        const info = PROVIDER_INFO[provider];
                                        const isActive = tempProvider === provider;
                                        return (
                                            <button
                                                key={provider}
                                                onClick={() => handleProviderChange(provider)}
                                                className={`flex flex-col items-start p-4 rounded-lg border transition-all text-left ${
                                                    isActive 
                                                    ? 'bg-nexus-accent/10 border-nexus-accent shadow-lg' 
                                                    : 'bg-nexus-900 border-slate-700 hover:border-slate-500'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`font-bold ${isActive ? 'text-nexus-accent' : 'text-slate-300'}`}>
                                                        {info.name}
                                                    </span>
                                                    {isActive && <Check size={14} className="text-nexus-accent" />}
                                                </div>
                                                <span className="text-xs text-slate-500">{info.description}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Model Selection */}
                                <div className="bg-nexus-900 p-4 rounded-lg border border-slate-700">
                                    <label className="block text-xs text-slate-500 uppercase font-bold mb-3 tracking-wide flex items-center gap-2">
                                        <Zap size={12} /> {s('appSettings.label.selectModel')}
                                    </label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {availableModels.map(model => {
                                            const isActive = tempModel === model.id;
                                            return (
                                                <button
                                                    key={model.id}
                                                    onClick={() => setTempModel(model.id)}
                                                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                                        isActive 
                                                        ? 'bg-nexus-accent/10 border-nexus-accent' 
                                                        : 'bg-nexus-950 border-slate-700 hover:border-slate-500'
                                                    }`}
                                                >
                                                    <div className="flex flex-col items-start flex-1 min-w-0">
                                                        <span className={`font-bold text-sm ${isActive ? 'text-nexus-accent' : 'text-slate-300'}`}>
                                                            {model.name}
                                                        </span>
                                                        <span className="text-xs text-slate-500">{model.description}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0 ml-2 flex-wrap justify-end">
                                                        {/* Price tier badge */}
                                                        <span className={`text-xs px-2 py-0.5 rounded-full border font-bold uppercase ${TIER_COLORS[model.tier]}`}>
                                                            {model.tier}
                                                        </span>
                                                        {/* Feature badges */}
                                                        {model.badges?.map(badge => {
                                                            const badgeDef = BADGE_DEFINITIONS[badge];
                                                            if (!badgeDef) return null;
                                                            return (
                                                                <span 
                                                                    key={badge}
                                                                    className={`text-xs px-2 py-0.5 rounded-full border font-bold uppercase ${badgeDef.className}`}
                                                                    title={badgeDef.label}
                                                                >
                                                                    {badgeDef.label}
                                                                </span>
                                                            );
                                                        })}
                                                        {isActive && <Check size={14} className="text-nexus-accent shrink-0" />}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Use Custom Key Toggle */}
                                <div className="flex items-center justify-between bg-nexus-900 p-4 rounded-lg border border-slate-700">
                                    <div>
                                    <h4 className="font-bold text-slate-200 text-sm">{s('appSettings.label.useCustomKey')}</h4>
                                        <p className="text-xs text-slate-500">
                                            {aiSettings.useCustomKey 
                                            ? s('appSettings.hint.usingPersonalKey')
                                            : s('appSettings.hint.usingEnv', { key: currentProviderInfo.envKey })}
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            const newSettings = { ...aiSettings, useCustomKey: !aiSettings.useCustomKey };
                                            updateAISettings(newSettings);
                                            toast({ 
                                                title: "API Mode Changed", 
                                                message: newSettings.useCustomKey 
                                                    ? 'Now using custom API key' 
                                                    : 'Now using environment variable',
                                                type: 'info' 
                                            });
                                        }}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-sm font-bold ${
                                            aiSettings.useCustomKey 
                                            ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' 
                                            : 'bg-slate-800 border-slate-600 text-slate-500'
                                        }`}
                                    >
                                        {aiSettings.useCustomKey ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                        {aiSettings.useCustomKey ? s('appSettings.toggle.customKey') : s('appSettings.toggle.envVar')}
                                    </button>
                                </div>

                                {/* API Key Input (only shown when using custom key) */}
                                {aiSettings.useCustomKey && (
                                    <div className="bg-nexus-900 p-4 rounded-lg border border-slate-700 animate-in slide-in-from-top-2">
                                        <label className="block text-xs text-slate-500 uppercase font-bold mb-2 tracking-wide flex items-center gap-2">
                                            <Key size={12} /> {currentProviderInfo.name} API Key
                                        </label>
                                        <div className="flex gap-2">
                                            <div className="flex-1 relative">
                                                <NexusInput
                                                    type={showApiKey ? 'text' : 'password'}
                                                    value={tempApiKey}
                                                    onChange={e => setTempApiKey(e.target.value)}
                                                    placeholder={tempProvider === 'openai' ? 'sk-...' : 'AIza...'}
                                                    className="text-sm font-mono pr-12"
                                                />
                                                <button 
                                                    onClick={() => setShowApiKey(!showApiKey)}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                                >
                                                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
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
                                            {' '}{s('appSettings.hint.keyStoredLocally')}
                                        </p>
                                    </div>
                                )}

                                {/* Save Button */}
                                <div className="flex justify-end pt-2">
                                    <NexusButton onClick={handleSaveAIConfig} icon={<Save size={14} />}>
                                            {s('appSettings.button.saveAIConfig')}
                                    </NexusButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Output Length Definitions */}
                <div className="bg-nexus-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-nexus-900 rounded-lg text-blue-400 border border-slate-700">
                            <AlignLeft size={24} />
                        </div>
                        <div className="flex-1">
                             <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-200 mb-2">Output Length Definitions</h3>
                                    <p className="text-sm text-slate-400">
                                        Define instruction sets for short, medium, and long generation.
                                    </p>
                                </div>
                                
                                {/* Default Length Selection */}
                                <div className="text-right">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Default Setting</label>
                                    <div className="inline-flex bg-nexus-900 p-1 rounded-lg border border-slate-700">
                                        {['Short', 'Medium', 'Long'].map(len => (
                                            <button
                                                key={len}
                                                onClick={() => setDefaultOutputLength(len as any)}
                                                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                                                    appSettings.defaultOutputLength === len 
                                                    ? 'bg-nexus-accent text-white' 
                                                    : 'text-slate-500 hover:text-slate-300'
                                                }`}
                                            >
                                                {len}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="flex justify-between text-xs text-slate-500 uppercase font-bold mb-1.5">
                                        <span>Short (Concise)</span>
                                        <span className="text-slate-600">e.g. "Max 30 words"</span>
                                    </label>
                                    <NexusTextArea 
                                        value={lengths.short}
                                        onChange={e => setLengths(prev => ({ ...prev, short: e.target.value }))}
                                        className="h-16"
                                        placeholder="Instruction for Short output..."
                                    />
                                </div>
                                <div>
                                    <label className="flex justify-between text-xs text-slate-500 uppercase font-bold mb-1.5">
                                        <span>Medium (Standard)</span>
                                        <span className="text-slate-600">e.g. "Approx 100 words"</span>
                                    </label>
                                    <NexusTextArea 
                                        value={lengths.medium}
                                        onChange={e => setLengths(prev => ({ ...prev, medium: e.target.value }))}
                                        className="h-16"
                                        placeholder="Instruction for Medium output..."
                                    />
                                </div>
                                <div>
                                    <label className="flex justify-between text-xs text-slate-500 uppercase font-bold mb-1.5">
                                        <span>Long (Detailed)</span>
                                        <span className="text-slate-600">e.g. "Min 500 words"</span>
                                    </label>
                                    <NexusTextArea 
                                        value={lengths.long}
                                        onChange={e => setLengths(prev => ({ ...prev, long: e.target.value }))}
                                        className="h-20"
                                        placeholder="Instruction for Long output..."
                                    />
                                </div>
                                
                                <div className="flex justify-end pt-2">
                                    <NexusButton onClick={handleSaveLengths} icon={<Save size={16} />}>
                                        Save Definitions
                                    </NexusButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. Narrative Roles / Personas */}
                <div className="bg-nexus-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                    <div className="flex items-start gap-4">
                         <div className="p-3 bg-nexus-900 rounded-lg text-purple-400 border border-slate-700">
                            <Sparkles size={24} />
                        </div>
                        <div className="flex-1">
                             <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-200 mb-1">Narrative Roles</h3>
                                    <p className="text-sm text-slate-400">
                                        Define the personality and writing style of the AI.
                                    </p>
                                </div>
                                <NexusButton 
                                    variant="secondary"
                                    onClick={() => openToneModal()}
                                    icon={<Plus size={14} />}
                                >
                                    New Role
                                </NexusButton>
                             </div>
                            
                            <div className="space-y-3">
                                {appSettings.tones.map(tone => (
                                    <div key={tone.id} className="bg-nexus-900 border border-slate-700 rounded-lg p-4 flex justify-between items-center group hover:border-nexus-accent/50 transition-colors">
                                        <div>
                                            <div className="font-bold text-slate-200 text-sm flex items-center gap-2">
                                                {tone.name}
                                                {tone.i18n && <span className="text-xs bg-slate-800 text-slate-500 px-1 rounded uppercase tracking-wider">Multilingual</span>}
                                            </div>
                                            <div className="text-xs text-slate-500 mb-1">{tone.description}</div>
                                            <div className="text-xs text-slate-600 font-mono italic truncate max-w-md border-l-2 border-slate-700 pl-2 opacity-70">
                                                "{tone.instruction}"
                                            </div>
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openToneModal(tone)} className="p-2 bg-nexus-800 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all" title="Edit Role">
                                                <Edit2 size={14} />
                                            </button>
                                            <button onClick={() => setDeleteToneId(tone.id)} className="p-2 bg-nexus-800 rounded border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-all" title="Delete Role">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 5. Experimental Features */}
                <div className="bg-nexus-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-nexus-900 rounded-lg text-orange-400 border border-slate-700">
                            <FlaskConical size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-slate-200 mb-1">Experimental Features</h3>
                            <p className="text-sm text-slate-400 mb-4">
                                Enable or disable features that are currently in testing.
                            </p>
                            
                            <div className="flex items-center justify-between bg-nexus-900 p-4 rounded-lg border border-slate-700">
                                <div>
                                    <h4 className="font-bold text-slate-200 text-sm">Image Generation</h4>
                                    <p className="text-xs text-slate-500">Allows generating visual previews for items using AI.</p>
                                </div>
                                <button 
                                    onClick={toggleImageGen}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-sm font-bold ${
                                        appSettings.enableImageGen 
                                        ? 'bg-green-500/10 border-green-500 text-green-400' 
                                        : 'bg-slate-800 border-slate-600 text-slate-500'
                                    }`}
                                >
                                    {appSettings.enableImageGen ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                    {appSettings.enableImageGen ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 6. System Logs */}
                <div className="bg-nexus-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                    <div className="flex items-start gap-4">
                         <div className="p-3 bg-nexus-900 rounded-lg text-slate-400 border border-slate-700">
                            <Terminal size={24} />
                        </div>
                        <div className="flex-1">
                             <h3 className="text-lg font-bold text-slate-200 mb-1">System History</h3>
                             <p className="text-sm text-slate-400 mb-4">
                                Full generation history. Logs are cleared when refreshing the application.
                            </p>
                            
                            <LogViewer logs={globalLogs} toggleLog={toggleGlobalLog} />
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL: Edit/Create Role */}
            <NexusModal
                isOpen={isToneModalOpen}
                onClose={() => setIsToneModalOpen(false)}
                title={<><Sparkles size={18} className="text-purple-400"/> {editingTone.id ? 'Edit Narrative Role' : 'Create New Role'}</>}
                footer={
                    <div className="flex justify-end gap-2">
                        <NexusButton variant="ghost" onClick={() => setIsToneModalOpen(false)}>Cancel</NexusButton>
                        <NexusButton onClick={handleSaveTone}>Save Role</NexusButton>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <NexusInput 
                            label="Role Name"
                            value={editingTone.name || ''}
                            onChange={e => setEditingTone({...editingTone,name: e.target.value})}
                            placeholder="e.g. The Crypt Keeper"
                        />
                        <NexusInput 
                            label="Short Description"
                            value={editingTone.description || ''}
                            onChange={e => setEditingTone({...editingTone, description: e.target.value})}
                            placeholder="e.g. Spooky & Ancient"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 uppercase font-bold mb-1.5 tracking-wide">
                            System Prompt Instruction
                        </label>
                        <NexusTextArea 
                            value={editingTone.instruction || ''}
                            onChange={e => setEditingTone({...editingTone, instruction: e.target.value})}
                            className="h-32 font-mono text-xs leading-relaxed"
                            placeholder="Define who the AI is. E.g., 'You are an ancient scholar writing in a dusty tome...'"
                        />
                        <p className="text-xs text-slate-500 mt-2 bg-nexus-900 p-2 rounded border border-slate-800">
                            <strong className="text-nexus-accent">Tip:</strong> Custom edits apply universally. To support multilingual switching for this role, please use the <strong>Import Config</strong> feature with an <code>i18n</code> block.
                        </p>
                    </div>
                </div>
            </NexusModal>

            {/* MODAL: Delete Confirmation */}
            <NexusModal
                isOpen={!!deleteToneId}
                onClose={() => setDeleteToneId(null)}
                title={<span className="text-red-400 flex items-center gap-2"><AlertTriangle size={20} /> Confirm Deletion</span>}
                footer={
                    <div className="flex justify-end gap-2">
                        <NexusButton variant="ghost" onClick={() => setDeleteToneId(null)}>Cancel</NexusButton>
                        <NexusButton variant="destructive" onClick={confirmDeleteTone}>Delete Role</NexusButton>
                    </div>
                }
            >
                <div className="space-y-4">
                    <p className="text-slate-300">Are you sure you want to delete this narrative role?</p>
                    <div className="bg-red-900/10 border border-red-500/20 p-3 rounded text-xs text-red-300">
                        This action cannot be undone. Any generations using this role will revert to the default.
                    </div>
                </div>
            </NexusModal>
        </div>
    );
};

export default AppSettings;
