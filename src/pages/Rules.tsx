import React, { useState } from 'react';
import { useWorld } from '../hooks/useWorld';
import { Rule, RuleReference } from '../types';
import { Workflow, Plus, Trash2, Save, X, BookOpen, Link2, AlertTriangle, FileText } from 'lucide-react';
import { NexusButton, NexusInput, NexusModal, NexusTextArea } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { NexusEntityPicker } from '../components/NexusEntityPicker';
import { useStrings } from '../lib/translations';

const Rules: React.FC = () => {
  const { currentWorld, worldManager, refreshWorld } = useWorld();
  const { toast } = useToast();
  const { s } = useStrings();
  
  // Selection & Editor State
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  
  if (!currentWorld) return null;

  // Handlers
  const handleSelectRule = (rule: Rule) => {
      setSelectedRuleId(rule.id);
      setEditingRule(JSON.parse(JSON.stringify(rule)));
  };

  const handleNewRule = () => {
      const newRule: Rule = {
          id: '', 
          name: 'New Narrative Rule',
          content: '',
          references: [],
          created: Date.now()
      };
      setEditingRule(newRule);
      setSelectedRuleId('new');
  };

  const handleSave = () => {
      if (!editingRule || !editingRule.name.trim()) {
          toast({ title: s('rules.toast.validationError.title'), message: s('rules.toast.validationError.message'), type: "warning" });
          return;
      }
      try {
          worldManager.saveRule(currentWorld.id, editingRule);
          refreshWorld();
          setSelectedRuleId(null);
          setEditingRule(null);
          toast({ title: s('rules.toast.saved.title'), message: s('rules.toast.saved.message'), type: "success" });
      } catch (e) {
          toast({ title: s('rules.toast.saveFailed.title'), message: s('rules.toast.saveFailed.message'), type: "error" });
      }
  };

  const confirmDelete = () => {
      if (!deleteRuleId) return;
      try {
          worldManager.deleteRule(currentWorld.id, deleteRuleId);
          refreshWorld();
          if (selectedRuleId === deleteRuleId) {
              setSelectedRuleId(null);
              setEditingRule(null);
          }
          toast({ title: s('rules.toast.deleted.title'), message: s('rules.toast.deleted.message'), type: "info" });
      } catch (e) {
          toast({ title: s('rules.toast.deleteFailed.title'), message: s('rules.toast.deleteFailed.message'), type: "error" });
      } finally {
          setDeleteRuleId(null);
      }
  };

  const insertReference = (ids: string[]) => {
      if (!editingRule || ids.length === 0) return;
      
      const newRefs = [...editingRule.references];
      let newContent = editingRule.content;

      ids.forEach(id => {
          // Resolve metadata
          const tagMeta = currentWorld.tags[id];
          const isTag = !!tagMeta;
          const label = isTag ? tagMeta.label : id; // If not tag, use ID (likely entity Name from picker)
          
          const refObj: RuleReference = {
              id: id,
              label: label,
              type: isTag ? 'tag' : 'item'
          };
          
          // Avoid duplicates in reference list
          if (!newRefs.find(r => r.id === id)) {
              newRefs.push(refObj);
          }

          // Append to text area
          newContent += ` [${isTag ? 'Tag' : 'Entity'}: ${label}]`;
      });

      setEditingRule({ ...editingRule, references: newRefs, content: newContent });
  };

  const removeReference = (refId: string) => {
      if (!editingRule) return;
      setEditingRule({
          ...editingRule,
          references: editingRule.references.filter(r => r.id !== refId)
      });
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col animate-fade-in">
       <header className="mb-6 flex justify-between items-end shrink-0">
            <div>
                <h2 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
                    <Workflow className="text-nexus-accent" /> {s('rules.title')}
                </h2>
                <p className="text-slate-400">{s('rules.subtitle')}</p>
            </div>
            <div className="flex gap-3">
                <div className="text-xs text-slate-500 bg-nexus-900 border border-slate-700 px-3 py-1.5 rounded flex items-center gap-2">
                    <FileText size={14} /> Descriptive Mode Active
                </div>
            </div>
        </header>

        <div className="flex flex-1 gap-8 overflow-hidden min-h-0">
            {/* LEFT: Rule List */}
            <div className="w-80 bg-nexus-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col shadow-lg shrink-0">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-nexus-900">
                    <span className="text-xs font-bold uppercase text-slate-500">{s('rules.listTitle')}</span>
                    <button onClick={handleNewRule} className="text-nexus-accent hover:text-white p-1 rounded hover:bg-slate-700"><Plus size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {currentWorld.rules.length === 0 && <div className="text-center p-8 text-slate-500 text-sm italic">{s('rules.none')}</div>}
                    {currentWorld.rules.map(rule => (
                        <div key={rule.id} onClick={() => handleSelectRule(rule)} className={`p-3 rounded-lg cursor-pointer border transition-all group relative ${selectedRuleId === rule.id ? 'bg-nexus-accent/10 border-nexus-accent shadow-md' : 'bg-nexus-900 border-slate-700 hover:border-slate-500'}`}>
                            <div className="flex justify-between items-start mb-1 pr-6">
                                <h4 className={`font-bold text-sm truncate w-full ${selectedRuleId === rule.id ? 'text-nexus-accent' : 'text-slate-300'}`}>{rule.name}</h4>
                            </div>
                            <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-mono">
                                {rule.references?.length || 0} Links
                            </span>
                            <button onClick={(e) => { e.stopPropagation(); setDeleteRuleId(rule.id); }} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1 rounded hover:bg-black/20 transition-all"><Trash2 size={14} /></button>
                        </div>
                    ))}
                </div>
            </div>

            {/* RIGHT: Editor */}
            <div className="flex-1 bg-nexus-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
                {editingRule ? (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="p-6 border-b border-slate-700 bg-nexus-900 shrink-0">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{s('rules.field.ruleName')}</label>
                            <NexusInput 
                                value={editingRule.name} 
                                onChange={e => setEditingRule({...editingRule, name: e.target.value})} 
                                placeholder={s('rules.placeholder.ruleName')}
                                className="text-2xl font-bold"
                            />
                        </div>
                        
                        <div className="flex-1 p-6 flex flex-col gap-4 overflow-hidden">
                             {/* References Toolbar */}
                            <div className="flex flex-wrap gap-2 items-center min-h-[42px]">
                                {editingRule.references?.map((ref, idx) => (
                                    <div key={idx} className="bg-nexus-950 border border-slate-700 rounded-full px-3 py-1 text-xs flex items-center gap-2 group hover:border-nexus-accent transition-colors">
                                        <Link2 size={12} className={ref.type === 'tag' ? 'text-blue-400' : 'text-orange-400'} />
                                        <span className="text-slate-200 font-bold">{ref.label}</span>
                                        <button onClick={() => removeReference(ref.id)} className="text-slate-600 hover:text-red-400 ml-1"><X size={12}/></button>
                                    </div>
                                ))}
                                
                                <NexusEntityPicker 
                                    value={[]}
                                    onChange={insertReference}
                                    limitToPool={undefined} 
                                    single={false}
                                    trigger={
                                        <button className="flex items-center gap-2 px-3 py-1 rounded-full border border-dashed border-nexus-accent/50 text-nexus-accent text-xs font-bold hover:bg-nexus-accent/10 transition-colors">
                                            <Plus size={12} /> {s('rules.button.addReference')}
                                        </button>
                                    }
                                />
                            </div>

                            <div className="flex-1 relative">
                                <NexusTextArea 
                                    value={editingRule.content}
                                    onChange={e => setEditingRule({...editingRule, content: e.target.value})}
                                    className="h-full w-full font-mono text-sm leading-relaxed p-4 resize-none"
                                    placeholder={s('rules.placeholder.content')}
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-700 bg-nexus-900 flex justify-end gap-3 shrink-0">
                            <NexusButton variant="ghost" onClick={() => { setSelectedRuleId(null); setEditingRule(null); }}>Cancel</NexusButton>
                            <NexusButton onClick={handleSave} icon={<Save size={18} />}>Save Rule</NexusButton>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-50">
                        <BookOpen size={64} className="mb-4" />
                        <p>{s('rules.empty.selectHint')}</p>
                    </div>
                )}
            </div>
        </div>

        {/* MODALS */}
        <NexusModal isOpen={!!deleteRuleId} onClose={() => setDeleteRuleId(null)} title={<span className="text-red-400 flex items-center gap-2"><AlertTriangle size={20}/> {s('rules.modal.deleteTitle')}</span>}>
            <div className="space-y-4">
                <p className="text-slate-300">{s('rules.modal.deleteQuestion')}</p>
                <div className="flex justify-end gap-2"><NexusButton variant="ghost" onClick={() => setDeleteRuleId(null)}>Cancel</NexusButton><NexusButton variant="destructive" onClick={confirmDelete}>Delete</NexusButton></div>
            </div>
        </NexusModal>
    </div>
  );
};

export default Rules;