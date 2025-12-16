import React, { useState, useMemo } from 'react';
import { Sparkles, ScrollText, ArrowRight, Check, Hammer, BrainCircuit, RefreshCw, Edit2, Zap, Coins } from 'lucide-react';
import { NexusModal, NexusButton, NexusTextArea, NexusSelect, NexusInput } from './ui';
import { createAIWorldBuilder, BuildProgress, StoryAnalysis, WorldArchitecture, TitleGenreOption } from '../services/aiWorldBuilder';
import { useToast } from '../contexts/ToastContext';
import { useAppSettings } from '../contexts/SettingsContext';
import { useAIService, useOrchestrator } from '../contexts/AIServiceContext';
import { useStrings } from '../lib/translations';

interface WorldForgeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (worldId: string) => void;
}

type Step = 'IDEATION' | 'ANALYSIS' | 'CONFIG' | 'BUILDING';

export const WorldForgeModal: React.FC<WorldForgeModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const { toast } = useToast();
    const { settings } = useAppSettings();
    const { isConfigured: aiIsConfigured } = useAIService();
    const orchestrator = useOrchestrator();
    const { s } = useStrings();
    
    // Create AIWorldBuilder bound to orchestrator (NOT direct provider access)
    const AIWorldBuilder = useMemo(() => createAIWorldBuilder(orchestrator), [orchestrator]);
    
    // State
    const [step, setStep] = useState<Step>('IDEATION');
    const [storyText, setStoryText] = useState('');
    const [language, setLanguage] = useState<'English' | 'Chinese'>('English');
    const [selectedToneId, setSelectedToneId] = useState<string>(''); // NEW: Tone State
    
    // IDEATION DATA
    const [ideationOptions, setIdeationOptions] = useState<TitleGenreOption | null>(null);
    const [selectedTitle, setSelectedTitle] = useState('');
    const [selectedGenre, setSelectedGenre] = useState('');
    const [isIdeationLoading, setIsIdeationLoading] = useState(false);

    // ANALYSIS DATA
    const [analysis, setAnalysis] = useState<StoryAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // CONFIG DATA
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    
    // COMPLEXITY TOGGLE
    const [complexity, setComplexity] = useState<'Standard' | 'Deep Lore'>('Standard');
    
    // BUILD DATA
    const [buildStatus, setBuildStatus] = useState<BuildProgress | null>(null);

    // TOKEN TRACKING
    const [totalTokens, setTotalTokens] = useState(0);

    // --- HELPER: Resolve Tone ---
    const getToneInstruction = () => {
        if (!selectedToneId) return undefined;
        const t = settings.tones.find(tone => tone.id === selectedToneId);
        return t ? t.instruction : undefined;
    };

    // --- ACTIONS ---

    const handleGenerateIdeation = async () => {
        if (!storyText.trim()) return;
        if (!aiIsConfigured) {
            toast({ title: s('worldForge.toast.aiNotConfigured.title'), message: s('worldForge.toast.aiNotConfigured.message'), type: 'error' });
            return;
        }

        setIsIdeationLoading(true);
        try {
            const toneInst = getToneInstruction();
            const { data, tokens } = await AIWorldBuilder.generateTitleGenreOptions(language, storyText, settings.globalPromptPrefix, toneInst);
            setTotalTokens(prev => prev + tokens);
            
            setIdeationOptions(data);
            if (data.titles.length > 0) setSelectedTitle(data.titles[0]);
            if (data.genres.length > 0) setSelectedGenre(data.genres[0]);
        } catch (e) {
            toast({ title: s('worldForge.toast.error.title'), message: s('worldForge.toast.generateOptionsFailed'), type: 'error' });
        } finally {
            setIsIdeationLoading(false);
        }
    };

    const handleAnalyze = async () => {
        if (!storyText.trim()) {
            toast({ title: s('worldForge.toast.inputRequired.title'), message: s('worldForge.toast.inputRequired.message'), type: 'warning' });
            return;
        }
        if (!aiIsConfigured) {
            toast({ title: s('worldForge.toast.aiNotConfigured.title'), message: s('worldForge.toast.aiNotConfigured.message'), type: 'error' });
            return;
        }
        setIsAnalyzing(true);
        try {
            const toneInst = getToneInstruction();
            const { data, tokens } = await AIWorldBuilder.analyzeStory(storyText, language, settings.globalPromptPrefix, toneInst);
            setTotalTokens(prev => prev + tokens);
            
            setAnalysis(data);
            // Default select all categories
            setSelectedCategories(data.dynamicSchema.map(c => c.categoryName));
            setStep('ANALYSIS'); // Move to analysis view
        } catch (e) {
            toast({ title: s('worldForge.toast.analysisFailed.title'), message: s('worldForge.toast.analysisFailed.message'), type: 'error' });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleGenesis = async () => {
        if (!analysis) return;
        setStep('BUILDING');
        setBuildStatus({ stage: 'Architecting', message: 'Designing blueprints...', progress: 0 });
        
        try {
            const toneInst = getToneInstruction();
            
            // 1. Create Architecture
            const { data: architecture, tokens: archTokens } = await AIWorldBuilder.createBlueprint(
                storyText, 
                analysis, 
                selectedCategories, 
                selectedTitle, 
                selectedGenre, 
                language,
                settings.globalPromptPrefix,
                toneInst
            );
            setTotalTokens(prev => prev + archTokens);

            // 2. Execute Build (Pass Complexity & Tone)
            const worldId = await AIWorldBuilder.executeBuild(
                architecture, 
                storyText, 
                language, 
                (p) => setBuildStatus(p),
                complexity,
                settings.globalPromptPrefix,
                (tokens) => setTotalTokens(prev => prev + tokens),
                toneInst
            );

            setTimeout(() => {
                onSuccess(worldId);
                handleClose();
            }, 1000);
        } catch (e) {
            toast({ title: s('worldForge.toast.genesisFailed.title'), message: s('worldForge.toast.genesisFailed.message'), type: 'error' });
        }
    };

    const handleClose = () => {
        setStep('IDEATION');
        setStoryText('');
        setIdeationOptions(null);
        setAnalysis(null);
        setBuildStatus(null);
        setTotalTokens(0);
        setSelectedToneId('');
        onClose();
    };

    // --- RENDERERS ---

    const renderIdeationStep = () => (
        <div className="space-y-6 animate-in fade-in">
             <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-lg flex gap-3">
                <ScrollText className="text-blue-400 shrink-0" size={20} />
                <div className="space-y-1">
                    <h4 className="text-sm font-bold text-blue-200">{s('worldForge.engineTitle')}</h4>
                    <p className="text-xs text-blue-300/70 leading-relaxed">
                        {s('worldForge.step1')}
                    </p>
                </div>
            </div>

            <div className="flex gap-4">
                 <div className="w-1/3">
                    <NexusSelect label={s('worldForge.label.language')} value={language} onChange={e => setLanguage(e.target.value as any)}>
                        <option value="English">English</option>
                        <option value="Chinese">Chinese (中文)</option>
                    </NexusSelect>
                </div>
                <div className="w-1/3">
                    <NexusSelect 
                        label={s('worldForge.label.narrativeTone')}
                        value={selectedToneId} 
                        onChange={e => setSelectedToneId(e.target.value)}
                    >
                        <option value="">{s('worldForge.defaultStyle')}</option>
                        {settings.tones.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </NexusSelect>
                </div>
                 <div className="flex-1 flex items-end">
                    <NexusButton 
                        onClick={handleGenerateIdeation} 
                        disabled={isIdeationLoading || !storyText.trim()} 
                        icon={<RefreshCw className={isIdeationLoading ? "animate-spin" : ""} size={16} />}
                        className={!storyText.trim() ? "opacity-50 cursor-not-allowed" : ""}
                    >
                        {isIdeationLoading ? s('worldForge.brainstorming') : s('worldForge.generateOptions')}
                    </NexusButton>
                 </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* TITLES */}
                <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-slate-500">{s('worldForge.worldTitle')}</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar bg-nexus-900 p-2 rounded border border-slate-700">
                        {ideationOptions?.titles.map(t => (
                            <button 
                                key={t} 
                                onClick={() => setSelectedTitle(t)}
                                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${selectedTitle === t ? 'bg-nexus-accent text-white font-bold' : 'text-slate-400 hover:bg-slate-800'}`}
                            >
                                {t}
                            </button>
                        ))}
                        {!ideationOptions && <div className="text-xs text-slate-600 italic text-center py-4">{s('worldForge.noOptionsGenerated')}</div>}
                    </div>
                    <NexusInput value={selectedTitle} onChange={e => setSelectedTitle(e.target.value)} placeholder={s('worldForge.manualTitle')} />
                </div>

                {/* GENRES */}
                <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-slate-500">{s('worldForge.richGenre')}</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar bg-nexus-900 p-2 rounded border border-slate-700">
                        {ideationOptions?.genres.map(g => (
                            <button 
                                key={g} 
                                onClick={() => setSelectedGenre(g)}
                                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors border-l-2 ${selectedGenre === g ? 'bg-nexus-accent/10 border-nexus-accent text-white' : 'border-transparent text-slate-400 hover:bg-slate-800'}`}
                            >
                                {g}
                            </button>
                        ))}
                        {!ideationOptions && <div className="text-xs text-slate-600 italic text-center py-4">{s('worldForge.noOptionsGenerated')}</div>}
                    </div>
                     <NexusTextArea value={selectedGenre} onChange={e => setSelectedGenre(e.target.value)} placeholder={s('worldForge.manualGenre')} className="h-10 min-h-0" />
                </div>
            </div>

            <div className="relative">
                <div className="flex justify-between items-end mb-1">
                     <label className="text-xs text-slate-500 uppercase font-bold tracking-wide">{s('worldForge.storyPrompt')}</label>
                     <span className={`text-xs font-mono ${storyText.length > 2900 ? 'text-red-400' : 'text-slate-500'}`}>
                         {storyText.length} / 3000
                     </span>
                </div>
                <NexusTextArea 
                    value={storyText}
                    onChange={e => setStoryText(e.target.value.substring(0, 3000))}
                    placeholder={s('worldForge.storyPlaceholder')}
                    className="h-32"
                    maxLength={3000}
                />
            </div>
        </div>
    );

    const renderAnalysisStep = () => (
        <div className="space-y-6 animate-in slide-in-from-right-4">
             <div className="flex items-center gap-2 text-nexus-accent">
                <BrainCircuit size={20} />
                <h3 className="font-bold">{s('worldForge.decomposerResults')}</h3>
            </div>
            
            <div className="bg-nexus-900 p-4 rounded border border-slate-700">
                <div className="text-xs uppercase font-bold text-slate-500 mb-1">{s('worldForge.aiSummary')}</div>
                <p className="text-sm text-slate-300 italic">"{analysis?.genreSummary.summary}"</p>
                <div className="mt-2 flex gap-2">
                    {analysis?.genreSummary.detectedGenres.map(g => (
                        <span key={g} className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">{g}</span>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold uppercase text-slate-500">{s('worldForge.proposedCategories')}</label>
                        <span className="text-xs text-slate-500">{s('worldForge.selectedCount', { count: selectedCategories.length })}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {analysis?.dynamicSchema.map(cat => {
                            const isSelected = selectedCategories.includes(cat.categoryName);
                            return (
                                <div 
                                    key={cat.categoryName}
                                    onClick={() => {
                                        if (isSelected) setSelectedCategories(prev => prev.filter(c => c !== cat.categoryName));
                                        else setSelectedCategories(prev => [...prev, cat.categoryName]);
                                    }}
                                    className={`p-3 rounded border cursor-pointer transition-all ${isSelected ? 'bg-nexus-accent/10 border-nexus-accent' : 'bg-nexus-900 border-slate-700 hover:border-slate-500'}`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-nexus-accent border-nexus-accent' : 'border-slate-500'}`}>
                                            {isSelected && <Check size={12} className="text-white" />}
                                        </div>
                                        <span className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-slate-400'}`}>{cat.categoryName}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 line-clamp-2">{cat.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* NEW COMPLEXITY CONTROLS */}
                <div className="space-y-4 border-l border-slate-700 pl-6">
                    <div className="flex items-center gap-2 text-purple-400 mb-2">
                        <Zap size={16} />
                        <span className="font-bold text-sm uppercase">{s('worldForge.generationEngine')}</span>
                    </div>
                    
                    <div className="space-y-4">
                        <label className="block text-xs text-slate-500 uppercase font-bold">{s('worldForge.complexityLevel')}</label>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setComplexity('Standard')}
                                className={`flex-1 py-3 px-2 rounded border text-xs font-bold transition-all ${complexity === 'Standard' ? 'bg-nexus-accent text-white border-nexus-accent' : 'bg-nexus-900 text-slate-500 border-slate-700 hover:border-slate-500'}`}
                            >
                                {s('worldForge.standard')}
                            </button>
                            <button 
                                onClick={() => setComplexity('Deep Lore')}
                                className={`flex-1 py-3 px-2 rounded border text-xs font-bold transition-all ${complexity === 'Deep Lore' ? 'bg-purple-600 text-white border-purple-500' : 'bg-nexus-900 text-slate-500 border-slate-700 hover:border-slate-500'}`}
                            >
                                {s('worldForge.deepLore')}
                            </button>
                        </div>
                        <p className="text-xs text-slate-400 italic">
                            {complexity === 'Deep Lore' 
                                ? s('worldForge.deepLoreDesc')
                                : s('worldForge.standardDesc')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderBuildingStep = () => (
        <div className="py-12 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95">
             <div className="relative">
                <div className="w-24 h-24 border-4 border-slate-800 rounded-full"></div>
                <div 
                    className="absolute inset-0 w-24 h-24 border-4 border-nexus-accent border-r-transparent rounded-full animate-spin"
                ></div>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
                    {buildStatus?.progress}%
                </div>
            </div>
            
            <div>
                <h3 className="text-xl font-bold text-white mb-2">{buildStatus?.stage}</h3>
                <p className="text-slate-400 text-sm animate-pulse">{buildStatus?.message}</p>
            </div>
        </div>
    );

    return (
        <NexusModal
            isOpen={isOpen}
            onClose={step === 'BUILDING' ? () => {} : handleClose}
            title={<><Sparkles size={18} className="text-nexus-accent" /> {s('worldForge.title')}</>}
            maxWidth="max-w-4xl"
            footer={
                <div className="w-full flex justify-between items-center">
                    <div className="text-xs font-mono text-slate-500 flex items-center gap-2">
                        {totalTokens > 0 && (
                            <>
                                <Coins size={12} className="text-yellow-500" />
                                <span>{s('worldForge.tokenCost', { count: totalTokens.toLocaleString() })}</span>
                            </>
                        )}
                    </div>

                    {step !== 'BUILDING' && (
                        <div className="flex gap-2">
                            <NexusButton variant="ghost" onClick={handleClose}>{s('worldForge.cancel')}</NexusButton>
                            {step === 'IDEATION' && (
                                <NexusButton onClick={handleAnalyze} disabled={isAnalyzing}>
                                    {isAnalyzing ? s('worldForge.decomposing') : <>{s('worldForge.nextAnalyze')} <ArrowRight size={14} /></>}
                                </NexusButton>
                            )}
                            {step === 'ANALYSIS' && (
                                <NexusButton onClick={handleGenesis} disabled={selectedCategories.length === 0}>
                                     <Hammer size={14} /> {s('worldForge.confirmBuild')}
                                </NexusButton>
                            )}
                        </div>
                    )}
                </div>
            }
        >
            <div className="min-h-[400px]">
                {step === 'IDEATION' && renderIdeationStep()}
                {step === 'ANALYSIS' && renderAnalysisStep()}
                {step === 'BUILDING' && renderBuildingStep()}
            </div>
        </NexusModal>
    );
};