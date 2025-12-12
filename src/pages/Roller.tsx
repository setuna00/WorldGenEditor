import React, { useState, useEffect, useMemo } from 'react';
import { useWorld } from '../hooks/useWorld';
import { UniversalEntity } from '../types';
import { Activity, Play, RefreshCw, Plus, Trash2, Filter } from 'lucide-react';
import { NexusButton, NexusInput, NexusSelect } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { EntityUtils } from '../utils/entityUtils';
import { db } from '../services/db'; 
import { RollerEngine, RollCandidate, RollConstraint, ConstraintOperator } from '../services/rollerEngine';
import { useStrings } from '../lib/translations';

const buildOperators = (s: (key: string, vars?: any) => string): { label: string; value: ConstraintOperator }[] => ([
    { label: s('roller.operator.eq'), value: 'eq' }, { label: s('roller.operator.neq'), value: 'neq' },
    { label: s('roller.operator.gt'), value: 'gt' }, { label: s('roller.operator.gte'), value: 'gte' },
    { label: s('roller.operator.lt'), value: 'lt' }, { label: s('roller.operator.lte'), value: 'lte' },
    { label: s('roller.operator.contains'), value: 'contains' }, { label: s('roller.operator.missing'), value: 'missing' }, { label: s('roller.operator.truthy'), value: 'truthy' },
]);

const ConstraintRow = React.memo(({ constraint, onRemove }: { constraint: RollConstraint; onRemove: () => void; }) => (
    <div className="flex gap-2 items-center bg-nexus-900 p-2 rounded border border-slate-700 animate-in fade-in slide-in-from-left-2">
        <div className="flex-1 text-xs font-mono text-nexus-accent truncate" title={constraint.path}>{constraint.path}</div>
        <div className="px-2 py-0.5 bg-slate-800 rounded text-xs font-bold uppercase text-slate-400">{constraint.operator}</div>
        <div className="flex-1 text-xs text-white truncate font-bold">{String(constraint.value)}</div>
        <button onClick={onRemove} className="text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
    </div>
));

const Roller: React.FC<{ embedded?: boolean, initialPool?: string, onRollComplete?: (e: UniversalEntity) => void }> = ({ embedded = false, initialPool, onRollComplete }) => {
  const { currentWorld } = useWorld();
  const { toast } = useToast();
  const { s } = useStrings();
  const OPERATORS = useMemo(() => buildOperators(s), [s]);
  
  // State
  const [selectedPool, setSelectedPool] = useState(initialPool || 'locations');
  const [candidates, setCandidates] = useState<RollCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rollResult, setRollResult] = useState<UniversalEntity | null>(null);
  const [rollLog, setRollLog] = useState<string[]>([]);
  const [contextTagsInput, setContextTagsInput] = useState<string>(''); 
  const [constraints, setConstraints] = useState<RollConstraint[]>([]);

  // Constraint Inputs
  // FIXED: Changed default path to match standard component structure
  const [newPath, setNewPath] = useState('components.basic_stats.power');
  const [newOp, setNewOp] = useState<ConstraintOperator>('gt');
  const [newVal, setNewVal] = useState('');

  if (!currentWorld) return null;

  useEffect(() => {
      let active = true;
      const loadCandidates = async () => {
          if (!currentWorld.id || !selectedPool) return;
          setIsLoading(true);
          try {
              const items = await db.getRollCandidates(currentWorld.id, selectedPool);
              if (active) setCandidates(items);
          } catch (e) {
              if (active) toast({ title: s('roller.toast.dbError.title'), message: s('roller.toast.dbError.message'), type: "error" });
          } finally {
              if (active) setIsLoading(false);
          }
      };
      loadCandidates();
      return () => { active = false; };
  }, [currentWorld.id, selectedPool]);

  const addConstraint = () => {
      if (!newPath.trim()) return;
      const isNumeric = !isNaN(parseFloat(newVal)) && isFinite(parseFloat(newVal));
      setConstraints(prev => [...prev, { path: newPath.trim(), operator: newOp, value: isNumeric ? parseFloat(newVal) : newVal }]);
      setNewVal('');
  };

  const handleRoll = () => {
    if (candidates.length === 0) {
      toast({ title: s('roller.toast.emptyPool.title'), message: s('roller.toast.emptyPool.message'), type: "warning" });
      return;
    }
    const contextTagSet = new Set(contextTagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean));
    const { activeEffects } = RollerEngine.compileRules(currentWorld.rules, contextTagSet, selectedPool);
    const { result, log } = RollerEngine.roll(candidates, activeEffects, constraints);
    
    setRollResult(result);
    setRollLog(log);
    
    if (result) {
        toast({ title: (currentWorld.config?.language === 'Chinese' ? `掷骰：${result.name}` : "Rolled: " + result.name), message: EntityUtils.getRarity(result), type: "success" });
        if (onRollComplete) onRollComplete(result);
    } else {
        toast({ title: s('roller.toast.rollFailed.title'), message: s('roller.toast.rollFailed.message'), type: "warning" });
    }
  };

  return (
      <div className={`grid grid-cols-1 ${embedded ? 'gap-4' : 'lg:grid-cols-3 gap-8'} h-[calc(100vh-8rem)] animate-fade-in`}>
        {/* LEFT: Config Panel */}
        <div className={`flex flex-col gap-4 ${embedded ? '' : 'lg:col-span-1'} h-full overflow-hidden`}>
            <div className="bg-nexus-800 border border-slate-700 p-4 rounded-xl shadow-lg shrink-0">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2"><RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> Config</h3>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${candidates.length > 0 ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>{s('roller.panel.candidates', { count: candidates.length })}</span>
                </div>
                <div className="space-y-3">
                    <NexusSelect label={s('roller.label.targetPool')} value={selectedPool} onChange={e => setSelectedPool(e.target.value)}>{Object.keys(currentWorld.pools).map(p => (<option key={p} value={p}>{p}</option>))}</NexusSelect>
                    <NexusInput label={s('roller.label.contextTags')} placeholder={s('roller.placeholder.contextTags')} value={contextTagsInput} onChange={e => setContextTagsInput(e.target.value)} />
                </div>
            </div>

            <div className="bg-nexus-800 border border-slate-700 p-4 rounded-xl shadow-lg flex-1 flex flex-col min-h-0">
                <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider mb-4 flex items-center gap-2"><Filter size={14} className="text-nexus-accent" /> {s('roller.panel.runtimeConstraints')}</h3>
                <div className="bg-nexus-900/50 p-3 rounded border border-slate-700/50 mb-4 space-y-2">
                    <NexusInput value={newPath} onChange={e => setNewPath(e.target.value)} placeholder={s('roller.placeholder.path')} className="text-xs font-mono" />
                    <div className="flex gap-2">
                        <div className="w-1/2"><NexusSelect value={newOp} onChange={e => setNewOp(e.target.value as ConstraintOperator)} className="text-xs">{OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}</NexusSelect></div>
                        <div className="flex-1"><NexusInput value={newVal} onChange={e => setNewVal(e.target.value)} placeholder={s('roller.placeholder.value')} className="text-xs" onKeyDown={e => e.key === 'Enter' && addConstraint()} /></div>
                        <button onClick={addConstraint} className="bg-nexus-700 hover:bg-nexus-600 text-white px-2 rounded border border-slate-600"><Plus size={16} /></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {constraints.length === 0 && <div className="text-center text-slate-500 text-xs italic py-4">{s('roller.empty.noConstraints')}</div>}
                    {constraints.map((c, i) => (<ConstraintRow key={i} constraint={c} onRemove={() => setConstraints(prev => prev.filter((_, idx) => idx !== i))} />))}
                </div>
                <div className="pt-4 mt-auto">
                    <NexusButton onClick={handleRoll} disabled={isLoading || candidates.length === 0} className="w-full py-3 text-lg" icon={<Play size={20} fill="currentColor" />}>{isLoading ? s('roller.loading') : s('roller.roll')}</NexusButton>
                </div>
            </div>
        </div>

        {/* RIGHT: Results */}
        <div className={`${embedded ? '' : 'lg:col-span-2'} flex flex-col gap-4 h-full overflow-hidden`}>
            <div className="flex-1 bg-nexus-800 border-2 border-slate-700 rounded-xl flex items-center justify-center relative overflow-hidden group">
                {rollResult ? (
                    <div className="w-full h-full p-8 flex flex-col items-center justify-center text-center relative z-10 animate-in zoom-in-95 duration-200">
                        <div className="absolute inset-0 bg-gradient-to-br from-nexus-900 via-nexus-800 to-nexus-900 -z-10"></div>
                        <div className={`absolute top-0 w-full h-2 ${EntityUtils.getRarity(rollResult) === 'Legendary' ? 'bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.5)]' : EntityUtils.getRarity(rollResult) === 'Epic' ? 'bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.5)]' : 'bg-nexus-accent'}`}></div>
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase mb-4 border border-white/10 bg-slate-800 text-slate-300 tracking-widest">{EntityUtils.getRarity(rollResult)}</span>
                        <h1 className="text-5xl font-black text-white mb-4 tracking-tight drop-shadow-xl">{rollResult.name}</h1>
                        <p className="text-lg text-slate-400 italic max-w-lg leading-relaxed mb-6">"{EntityUtils.getDescription(rollResult)}"</p>
                        <div className="flex flex-wrap gap-2 justify-center max-w-2xl">{rollResult.tags.map(t => (<span key={t} className="text-xs px-2 py-1 bg-black/40 text-slate-400 rounded border border-slate-700/50 uppercase font-bold">{t}</span>))}</div>
                    </div>
                ) : (
                    <div className="text-slate-600 flex flex-col items-center animate-pulse"><Activity size={48} className="mb-2 opacity-50" /><span className="text-sm font-mono uppercase tracking-widest">{s('roller.awaitingInput')}</span></div>
                )}
            </div>
            {!embedded && (
                <div className="h-48 bg-black/80 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-400 overflow-y-auto custom-scrollbar shadow-inner">
                    <div className="flex items-center gap-2 text-nexus-accent font-bold uppercase mb-2 border-b border-slate-800 pb-2 sticky top-0 bg-black/80 w-full"><Activity size={12} /> {s('roller.executionLog')}</div>
                    {rollLog.map((l, i) => (<div key={i} className={`py-0.5 ${l.startsWith('Winner:') ? 'text-green-400 font-bold' : ''} ${l.includes('Filtered') ? 'text-orange-400' : ''}`}><span className="opacity-30 mr-2">[{i}]</span>{l}</div>))}
                </div>
            )}
        </div>
    </div>
  );
};

export default Roller;