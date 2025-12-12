import React, { useState, useEffect } from 'react';
import { useWorld } from '../hooks/useWorld';
import { BookOpen, Save, Plus, Trash2, HelpCircle, Lightbulb, ToggleLeft, ToggleRight, MessageSquare } from 'lucide-react';
import { WorldContextField } from '../types';
import { NexusButton, NexusInput, NexusTextArea, NexusModal } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useAppSettings } from '../contexts/SettingsContext';
import { useStrings } from '../lib/translations';

const WorldSettings: React.FC = () => {
  const { currentWorld, worldManager, refreshWorld } = useWorld();
  const { toast } = useToast();
  const { settings } = useAppSettings();
  const { s } = useStrings();

  const [isGuideOpen, setIsGuideOpen] = useState(false);
  
  // Form State
  const [generalLore, setGeneralLore] = useState('');
  const [customFields, setCustomFields] = useState<WorldContextField[]>([]);
  const [useGlobalPrefix, setUseGlobalPrefix] = useState(false);
  
  // Status State
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!currentWorld) return null;

  // Initial Load
  useEffect(() => {
    setGeneralLore(currentWorld.config.loreContext || '');
    setCustomFields(currentWorld.config.contextFields ? [...currentWorld.config.contextFields] : []);
    setUseGlobalPrefix(currentWorld.config.useGlobalPromptPrefix || false);
    setIsDirty(false);
  }, [currentWorld.id]);

  // ASYNC UPDATE
  const handleSave = async () => {
    setIsSaving(true);
    try {
        const updatedConfig = {
            ...currentWorld.config,
            loreContext: generalLore,
            contextFields: customFields,
            useGlobalPromptPrefix: useGlobalPrefix
        };
        
        await worldManager.updateWorldConfig(currentWorld.id, currentWorld.name, updatedConfig);
        refreshWorld();
        setIsDirty(false);
        toast({ title: s('dashboard.toast.configSaved.title'), message: (settings.defaultLanguage === 'Chinese' ? '世界上下文已更新。' : 'World context updated successfully.'), type: "success" });
    } catch (e) {
        console.error(e);
        toast({ title: s('dashboard.toast.saveFailed.title'), message: (settings.defaultLanguage === 'Chinese' ? '无法将更改保存到数据库。' : 'Could not persist changes to database.'), type: "error" });
    } finally {
        setIsSaving(false);
    }
  };

  // --- Field Handlers ---

  const addField = () => {
      setCustomFields([...customFields, { id: crypto.randomUUID(), key: '', value: '' }]);
      setIsDirty(true);
  };

  const removeField = (id: string) => {
      setCustomFields(customFields.filter(f => f.id !== id));
      setIsDirty(true);
  };

  const updateFieldKey = (id: string, key: string) => {
      setCustomFields(customFields.map(f => f.id === id ? { ...f, key } : f));
      setIsDirty(true);
  };

  const updateFieldValue = (id: string, value: string) => {
      setCustomFields(customFields.map(f => f.id === id ? { ...f, value } : f));
      setIsDirty(true);
  };

  const updateGeneralLore = (val: string) => {
      setGeneralLore(val);
      setIsDirty(true);
  };

  const toggleGlobalPrefix = () => {
      setUseGlobalPrefix(!useGlobalPrefix);
      setIsDirty(true);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 animate-fade-in">
      <header className="border-b border-slate-700 pb-6 flex justify-between items-end">
        <div>
            <h2 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
                <BookOpen className="text-nexus-accent" />
                {s('worldSettings.title')}
            </h2>
            <p className="text-slate-400 mt-2">{s('worldSettings.subtitle')}</p>
        </div>
        <div className="flex gap-3">
            <NexusButton 
                variant="secondary"
                onClick={() => setIsGuideOpen(true)}
                icon={<HelpCircle size={18} />}
            >
                {s('worldSettings.button.guide')}
            </NexusButton>
            <NexusButton 
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                icon={<Save size={18} />}
            >
                {isSaving ? s('worldSettings.saving') : (isDirty ? s('worldSettings.saveChanges') : s('worldSettings.saved'))}
            </NexusButton>
        </div>
      </header>

      {/* System Override Section */}
      <section className="bg-nexus-800 border border-slate-700 rounded-xl p-6 shadow-lg">
          <div className="flex items-start gap-4">
              <div className="p-3 bg-nexus-900 rounded-lg text-nexus-accent border border-slate-700">
                  <MessageSquare size={24} />
              </div>
              <div className="flex-1">
                  <div className="flex justify-between items-center mb-4">
                      <div>
                          <h3 className="text-lg font-bold text-white mb-1">{s('worldSettings.section.systemOverrides')}</h3>
                          <p className="text-xs text-slate-400">{s('worldSettings.section.systemOverrides.desc')}</p>
                      </div>
                      
                      <button 
                          onClick={toggleGlobalPrefix}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-sm font-bold ${
                              useGlobalPrefix
                              ? 'bg-green-500/10 border-green-500 text-green-400' 
                              : 'bg-slate-800 border-slate-600 text-slate-500'
                          }`}
                      >
                          {useGlobalPrefix ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                          {useGlobalPrefix ? s('worldSettings.prefixActive') : s('worldSettings.prefixDisabled')}
                      </button>
                  </div>
                  
                  {useGlobalPrefix && (
                      <div className="bg-nexus-900 border border-slate-700 rounded p-4 text-xs font-mono text-slate-400">
                          <strong className="block text-slate-500 mb-2 uppercase">{s('worldSettings.activeGlobalPrefix')}</strong>
                          {settings.globalPromptPrefix || <span className="italic opacity-50">{s('worldSettings.noGlobalPrefix')}</span>}
                      </div>
                  )}
              </div>
          </div>
      </section>

      {/* Main Context Area */}
      <section className="bg-nexus-800 border border-slate-700 rounded-xl p-6 shadow-lg">
          <div className="flex items-start gap-4">
              <div className="p-3 bg-nexus-900 rounded-lg text-slate-400">
                  <BookOpen size={24} />
              </div>
              <div className="flex-1">
                  <h3 className="text-lg font-bold text-white mb-2">{s('worldSettings.section.generalSetting')}</h3>
                  <p className="text-xs text-slate-400 mb-4">{s('worldSettings.section.generalSetting.desc')}</p>
                  <NexusTextArea 
                    value={generalLore}
                    onChange={e => updateGeneralLore(e.target.value)}
                    className="h-48 font-medium leading-relaxed"
                    placeholder={s('worldSettings.placeholder.sourceOfTruth')}
                  />
              </div>
          </div>
      </section>

      {/* Custom Fields */}
      <section className="space-y-4">
          <div className="flex justify-between items-center border-b border-slate-700 pb-2">
            <div>
                 <h3 className="text-lg font-bold text-white">{s('worldSettings.section.customFields')}</h3>
                 <p className="text-xs text-slate-400">{s('worldSettings.section.customFields.desc')}</p>
            </div>
            <NexusButton 
                variant="secondary"
                onClick={addField}
                icon={<Plus size={14} />}
                className="h-8 text-xs"
            >
                {s('worldSettings.button.addField')}
            </NexusButton>
          </div>

          <div className="space-y-4">
              {customFields.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed border-slate-700 rounded-xl bg-nexus-800/50">
                      <p className="text-slate-500 font-bold mb-1">{s('worldSettings.empty.noCustomFields')}</p>
                      <button onClick={addField} className="text-nexus-accent text-xs hover:underline flex items-center justify-center gap-1 w-full">
                          <Plus size={12} /> {s('worldSettings.empty.addOne')}
                      </button>
                  </div>
              )}

              {customFields.map((field) => (
                  <div key={field.id} className="bg-nexus-800 border border-slate-700 rounded-xl p-4 shadow-lg animate-fade-in group hover:border-nexus-accent/50 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                          <div className="w-1/2">
                                <NexusInput 
                                value={field.key}
                                onChange={e => updateFieldKey(field.id, e.target.value)}
                                className="text-sm font-bold uppercase tracking-wider text-nexus-accent placeholder-slate-600 border-b border-transparent focus:border-nexus-accent w-full py-1 transition-colors"
                                placeholder={s('worldSettings.placeholder.fieldName')}
                              />
                          </div>
                          <button 
                            onClick={() => removeField(field.id)} 
                            className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1.5 hover:bg-red-900/10 rounded"
                            title={settings.defaultLanguage === 'Chinese' ? '移除字段' : 'Remove Field'}
                          >
                              <Trash2 size={16} />
                          </button>
                      </div>
                      <NexusTextArea 
                        value={field.value}
                        onChange={e => updateFieldValue(field.id, e.target.value)}
                        className="h-24 resize-y"
                            placeholder={s('worldSettings.placeholder.description')}
                      />
                  </div>
              ))}
          </div>
      </section>

      {/* Guide Modal */}
      <NexusModal 
        isOpen={isGuideOpen} 
        onClose={() => setIsGuideOpen(false)}
        title={<><Lightbulb size={18} className="text-yellow-400" /> {s('worldSettings.guide.title')}</>}
        maxWidth="max-w-2xl"
        footer={<NexusButton onClick={() => setIsGuideOpen(false)}>{s('worldSettings.guide.close')}</NexusButton>}
      >
        <div className="space-y-6 text-sm text-slate-300">
            <p>
                The text you provide here is injected directly into the <strong>System Prompt</strong> of the AI whenever you use the AI Forge.
                Clearer context leads to better, more consistent generations.
            </p>

            <div className="bg-nexus-900 p-4 rounded border border-slate-700">
                <h4 className="font-bold text-white mb-2">{s('worldSettings.guide.howItWorks')}</h4>
                <p className="mb-2">{s('worldSettings.guide.whenRequest')}</p>
                <ol className="list-decimal pl-5 space-y-1 text-slate-400 font-mono text-xs">
                    <li>{settings.defaultLanguage === 'Chinese' ? '世界名称与类型' : 'World Name & Genre'}</li>
                    <li>{settings.defaultLanguage === 'Chinese' ? '总体设定（你的主要描述）' : 'General Setting (Your main description)'}</li>
                    <li>{settings.defaultLanguage === 'Chinese' ? '自定义字段（带标签的章节）' : 'Custom Fields (Labeled sections)'}</li>
                    <li>{settings.defaultLanguage === 'Chinese' ? '数据池列表（有哪些类别）' : 'Pool List (What categories exist)'}</li>
                </ol>
            </div>

            <div>
                <h4 className="font-bold text-white mb-3">{s('worldSettings.guide.tips')}</h4>
                <ul className="space-y-4">
                    <li className="flex gap-3">
                        <div className="text-nexus-accent font-bold min-w-[100px] text-xs uppercase tracking-wider bg-nexus-950 p-2 rounded text-center h-fit border border-slate-800">{s('worldSettings.guide.magicSystem')}</div>
                        <div>{s('worldSettings.guide.magicDesc')}</div>
                    </li>
                    <li className="flex gap-3">
                        <div className="text-nexus-accent font-bold min-w-[100px] text-xs uppercase tracking-wider bg-nexus-950 p-2 rounded text-center h-fit border border-slate-800">{s('worldSettings.guide.technology')}</div>
                        <div>{s('worldSettings.guide.techDesc')}</div>
                    </li>
                    <li className="flex gap-3">
                        <div className="text-nexus-accent font-bold min-w-[100px] text-xs uppercase tracking-wider bg-nexus-950 p-2 rounded text-center h-fit border border-slate-800">{s('worldSettings.guide.cosmology')}</div>
                        <div>{s('worldSettings.guide.cosmoDesc')}</div>
                    </li>
                </ul>
            </div>
        </div>
      </NexusModal>
    </div>
  );
};

export default WorldSettings;