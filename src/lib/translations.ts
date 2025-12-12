// nexus-generator/src/lib/translations.ts
import { useAppSettings } from '../contexts/SettingsContext';

type Language = 'English' | 'Chinese';
type StringVars = Record<string, string | number>;

function formatTemplate(template: string, vars?: StringVars): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_m, key) => {
        const v = vars[key];
        return v === undefined || v === null ? `{${key}}` : String(v);
    });
}

interface TranslationSet {
    common: {
        search: string;
        cancel: string;
        save: string;
        saved: string;
        saving: string;
        delete: string;
        edit: string;
        confirm: string;
        close: string;
        back: string;
        loading: string;
        validation: {
            required: string;
            minLength: string;
            maxLength: string;
            invalidChars: string;
            alreadyExists: string;
        };
    };
    sidebar: {
        backToHub: string;
        activeWorld: string;
        overview: string;
        settings: string;
        worldContext: string;
        worldLore: string;
        characterLore: string;
        assetsData: string;
        tools: string;
        components: string;
        tagManager: string;
        aiForge: string;
        rules: string;
        rollerTest: string;
        export: string;
        manualSave: string;
    };
    headers: {
        worldEditor: string;
        createPool: string;
    };
    actions: {
        cancel: string;
        create: string;
        save: string;
        saved: string;
        saving: string;
    };
    placeholders: {
        noWorldPools: string;
        noCharPools: string;
        noAssetPools: string;
    };
    home: {
        hero: {
            title: string;
            subtitle: string;
        };
        buttons: {
            globalConfig: string;
            import: string;
            aiGenesis: string;
            newWorld: string;
            openEditor: string;
            createFirst: string;
        };
        headers: {
            availableWorlds: string;
        };
        emptyState: {
            title: string;
            desc: string;
        };
        modals: {
            create: {
                title: string;
                nameLabel: string;
                genreLabel: string;
                desc: string;
                submit: string;
            };
            config: {
                title: string;
                tabs: {
                    interface: string;
                    narrative: string;
                    system: string;
                };
            };
        };
    };
    dashboard: {
        headers: {
            coreRulebook: string;
            subtitle: string;
        };
        stats: {
            pools: string;
            entities: string;
            modules: string;
        };
        cards: {
            genre: string;
            tags: string;
            pools: string;
            manageTags: string;
        };
        danger: {
            title: string;
            desc: string;
            buttons: {
                delete: string;
                cancel: string;
                confirm: string;
                finalConfirm: string;
            };
            warnings: {
                stage1: string;
                stage1Desc: string;
                stage2: string;
                stage2Desc: string;
            };
        };
    };
    forge: {
        header: {
            title: string;
            subtitle: string;
            poweredBy: string;
        };
        modes: {
            asset: { label: string; desc: string; };
            lore: { label: string; desc: string; };
            character: { label: string; desc: string; };
        };
        controls: {
            targetPool: string;
            language: string;
            strictTags: {
                strict: string;
                allow: string;
                tooltip: string;
            };
            tone: string;
            batchSize: string;
            length: {
                label: string;
                scopeField: string;
                tooltip: string;
            };
            advanced: {
                toggle: string;
                mustContain: string;
                mustAvoid: string;
            };
            context: {
                header: string;
                addLink: string;
                empty: string;
            };
            prompt: string;
            buttons: {
                generate: string;
                generating: string;
                saveAll: string;
            };
        };
        results: {
            title: string;
        };
    };
    pools: {
        header: {
            id: string;
        };
        actions: {
            editSettings: string;
            deletePool: string;
            config: string;
            newEntity: string;
        };
        roster: {
            title: string;
            empty: string;
        };
        emptyState: {
            noStats: string;
        };
        modals: {
            editPool: {
                title: string;
                name: string;
                desc: string;
                color: string;
            };
            config: {
                title: string;
                tabs: {
                    blueprint: string;
                    relations: string;
                };
                blueprintDesc: string;
                relationsDesc: string;
                addVerb: string;
            };
            editEntity: {
                title: string;
                name: string;
                tags: string;
            };
            deleteEntity: {
                title: string;
                desc: string;
            };
            deletePool: {
                title: string;
                desc: string;
                warning: string;
            };
        };
    };
}

const TRANSLATIONS: Record<Language, TranslationSet> = {
    'English': {
        common: {
            search: "Search...",
            cancel: "Cancel",
            save: "Save",
            saved: "Saved",
            saving: "Saving...",
            delete: "Delete",
            edit: "Edit",
            confirm: "Confirm",
            close: "Close",
            back: "Back",
            loading: "Loading...",
            validation: {
                required: "This field is required",
                minLength: "Must be at least 2 characters",
                maxLength: "Must be less than 50 characters",
                invalidChars: "Only letters, numbers, spaces and hyphens allowed",
                alreadyExists: "This name already exists",
            },
        },
        sidebar: {
            backToHub: "Back to Hub",
            activeWorld: "Active World",
            overview: "Overview",
            settings: "Settings",
            worldContext: "World Context",
            worldLore: "World Lore",
            characterLore: "Character Lore",
            assetsData: "Assets & Data",
            tools: "Tools",
            components: "Components",
            tagManager: "Tag Manager",
            aiForge: "AI Forge",
            rules: "Logic / Rules",
            rollerTest: "Roller Test",
            export: "Export",
            manualSave: "Save",
        },
        headers: {
            worldEditor: "World Editor",
            createPool: "Create Pool",
        },
        actions: {
            cancel: "Cancel",
            create: "Create",
            save: "Save",
            saved: "Saved",
            saving: "Saving...",
        },
        placeholders: {
            noWorldPools: "No world pools.",
            noCharPools: "No character pools.",
            noAssetPools: "No asset pools.",
        },
        home: {
            hero: {
                title: "NEXUS CORE",
                subtitle: "Universal Procedural Generation Engine & World Building IDE.\nDesign Worlds, define Logic, and forge entities with AI.",
            },
            buttons: {
                globalConfig: "Global Config",
                import: "Import",
                aiGenesis: "AI World Genesis",
                newWorld: "New World",
                openEditor: "Open Editor",
                createFirst: "Create First World",
            },
            headers: {
                availableWorlds: "Available Worlds",
            },
            emptyState: {
                title: "No Worlds Found",
                desc: "Initialize a new rulebook or import an existing JSON package.",
            },
            modals: {
                create: {
                    title: "Initialize New World",
                    nameLabel: "World Name",
                    genreLabel: "Genre / Theme",
                    desc: "This will create a new database container. You can define rules, tags, and entities inside it.",
                    submit: "Initialize",
                },
                config: {
                    title: "Global Configuration",
                    tabs: {
                        interface: "Interface",
                        narrative: "Narrative Engine",
                        system: "API Settings",
                    }
                }
            }
        },
        dashboard: {
            headers: {
                coreRulebook: "Core Rulebook",
                subtitle: "Master template configuration.",
            },
            stats: {
                pools: "Total Pools",
                entities: "Total Entities",
                modules: "Modules",
            },
            cards: {
                genre: "Genre",
                tags: "Top World Tags",
                pools: "Data Pools",
                manageTags: "Manage",
            },
            danger: {
                title: "Danger Zone",
                desc: "Irreversible actions regarding this Rulebook.",
                buttons: {
                    delete: "Delete Rulebook",
                    cancel: "Cancel",
                    confirm: "Yes, proceed",
                    finalConfirm: "CONFIRM DELETION",
                },
                warnings: {
                    stage1: "Are you absolutely sure?",
                    stage1Desc: "This action cannot be undone. All pools, entities, and rules will be lost.",
                    stage2: "Final Warning",
                    stage2Desc: "Confirming this will permanently destroy",
                }
            }
        },
        forge: {
            header: {
                title: "Forge",
                subtitle: "Generate content using AI context.",
                poweredBy: "Powered by",
            },
            modes: {
                asset: { label: "Asset Forge", desc: "Create items, vehicles, and objects." },
                lore: { label: "Lore Forge", desc: "Generate history, legends, and world details." },
                character: { label: "Character Forge", desc: "Create NPCs, protagonists, and creatures." },
            },
            controls: {
                targetPool: "Target Pool",
                language: "Output Language",
                strictTags: {
                    strict: "Tags: Existing Only",
                    allow: "Tags: Allow New",
                    tooltip: "New Tag Policy: Controls if AI can invent new tags.",
                },
                tone: "Tone Preset",
                batchSize: "Batch Size",
                length: {
                    label: "Output Length",
                    scopeField: "Scope: Field",
                    tooltip: "If checked, the length constraint applies to EACH text field individually rather than the total entity.",
                },
                advanced: {
                    toggle: "Advanced Constraints",
                    mustContain: "Must Contain Tags",
                    mustAvoid: "Must Avoid Tags",
                },
                context: {
                    header: "Context / References",
                    addLink: "Add Link",
                    empty: "No context items linked. The AI will generate based on general world lore only.",
                },
                prompt: "Prompt",
                buttons: {
                    generate: "Generate Batch",
                    generating: "Forging Content...",
                    saveAll: "Save All",
                }
            },
            results: {
                title: "Results",
            }
        },
        pools: {
            header: {
                id: "ID",
            },
            actions: {
                editSettings: "Edit Pool Settings",
                deletePool: "Delete Pool",
                config: "Config",
                newEntity: "New",
            },
            roster: {
                title: "Roster",
                empty: "Select a character to edit details.",
            },
            emptyState: {
                noStats: "No stats generated.",
            },
            modals: {
                editPool: {
                    title: "Edit Pool Settings",
                    name: "Pool Name",
                    desc: "Description",
                    color: "Theme Color",
                },
                config: {
                    title: "Pool Configuration",
                    tabs: {
                        blueprint: "Blueprint",
                        relations: "Relationships",
                    },
                    blueprintDesc: "Selected components define the structure of entities in this pool.",
                    relationsDesc: "Define relationship verbs (e.g. 'Is Enemy Of').",
                    addVerb: "Add Verb",
                },
                editEntity: {
                    title: "Edit Entity",
                    name: "Entity Name",
                    tags: "Active Tags",
                },
                deleteEntity: {
                    title: "Delete Entity",
                    desc: "Permanently remove this item? This cannot be undone.",
                },
                deletePool: {
                    title: "Delete Entire Pool",
                    desc: "Are you sure you want to delete",
                    warning: "CRITICAL: This will permanently delete all items. This action cannot be undone.",
                }
            }
        }
    },
  'Chinese': {
        common: {
            search: "搜索...",
            cancel: "取消",
            save: "保存",
            saved: "已保存",
            saving: "保存中...",
            delete: "删除",
            edit: "编辑",
            confirm: "确认",
            close: "关闭",
            back: "返回",
            loading: "加载中...",
            validation: {
                required: "此字段为必填项",
                minLength: "至少需要2个字符",
                maxLength: "不能超过50个字符",
                invalidChars: "只允许使用字母、数字、空格和连字符",
                alreadyExists: "此名称已存在",
            },
        },
        sidebar: {
            backToHub: "返回主界面",
            activeWorld: "当前世界",
            overview: "总览",
            settings: "设置",
            worldContext: "世界背景",
            worldLore: "世界设定",
            characterLore: "角色设定",
            assetsData: "资源与数据",
            tools: "工具",
            components: "组件",
            tagManager: "标签管理",
            aiForge: "AI 锻造",
            rules: "逻辑规则",
            rollerTest: "掷骰测试",
            export: "导出",
            manualSave: "保存",
        },
        headers: {
            worldEditor: "世界编辑器",
            createPool: "创建数据池",
        },
        actions: {
            cancel: "取消",
            create: "创建",
            save: "保存",
            saved: "已保存",
            saving: "保存中...",
        },
        placeholders: {
            noWorldPools: "暂无世界数据池",
            noCharPools: "暂无角色数据池",
            noAssetPools: "暂无资源数据池",
        },
        home: {
            hero: {
                title: "NEXUS CORE",
                subtitle: "通用世界生成引擎与世界构建 IDE。\n设计世界，定义逻辑，并利用 AI 锻造实体。",
            },
            buttons: {
                globalConfig: "全局配置",
                import: "导入",
                aiGenesis: "AI 世界生成",
                newWorld: "新建世界",
                openEditor: "打开编辑器",
                createFirst: "创建第一个世界",
            },
            headers: {
                availableWorlds: "可用世界",
            },
            emptyState: {
                title: "未找到世界",
                desc: "初始化一个新的规则书或导入现有的 JSON 包。",
            },
            modals: {
                create: {
                    title: "初始化新世界",
                    nameLabel: "世界名称",
                    genreLabel: "类型 / 主题",
                    desc: "这将创建一个新的数据库容器，你可以在其中定义规则、标签和实体。",
                    submit: "初始化",
                },
                config: {
                    title: "全局配置",
                    tabs: {
                        interface: "界面",
                        narrative: "叙事引擎",
                        system: "API 设置",
                    }
                }
            }
        },
        dashboard: {
            headers: {
                coreRulebook: "核心规则书",
                subtitle: "主模板配置。",
            },
            stats: {
                pools: "数据池总数",
                entities: "实体总数",
                modules: "模块数",
            },
            cards: {
                genre: "类型",
                tags: "世界热门标签",
                pools: "数据池",
                manageTags: "管理",
            },
            danger: {
                title: "危险区域",
                desc: "与此规则书相关的不可逆操作。",
                buttons: {
                    delete: "删除规则书",
                    cancel: "取消",
                    confirm: "是的，继续",
                    finalConfirm: "确认删除",
                },
                warnings: {
                    stage1: "你绝对确定吗？",
                    stage1Desc: "此操作无法撤销。所有数据池、实体和规则都将丢失。",
                    stage2: "最终警告",
                    stage2Desc: "确认此操作将永久销毁",
                }
            }
        },
        forge: {
            header: {
                title: "锻造",
                subtitle: "利用 AI 上下文生成内容。",
                poweredBy: "使用模型",
            },
            modes: {
                asset: {
                    label: "资源锻造",
                    desc: "创建物品、载具和各类对象。",
                },
                lore: {
                    label: "设定锻造",
                    desc: "生成历史、传说和世界细节。",
                },
                character: {
                    label: "角色锻造",
                    desc: "创建 NPC、主角和生物。",
                },
            },
            controls: {
                targetPool: "目标数据池",
                language: "输出语言",
                strictTags: {
                    strict: "标签：仅使用现有",
                    allow: "标签：允许新建",
                    tooltip: "新标签策略：控制 AI 是否可以自动创建新标签。",
                },
                tone: "语气预设",
                batchSize: "生成数量",
                length: {
                    label: "输出长度",
                    scopeField: "范围",
                    tooltip: "若勾选，长度限制将分别应用于每个文本字段，而非整条通用。",
                },
                advanced: {
                    toggle: "高级限制",
                    mustContain: "必须包含标签",
                    mustAvoid: "必须避免标签",
                },
                context: {
                    header: "上下文 / 参考",
                    addLink: "添加链接",
                    empty: "未链接上下文项。AI 将仅基于世界的通用设定进行生成。",
                },
                prompt: "提示词",
                buttons: {
                    generate: "批量生成",
                    generating: "正在锻造内容...",
                    saveAll: "保存全部",
                }
            },
            results: {
                title: "结果",
            }
        },
        pools: {
            header: {
                id: "ID",
            },
            actions: {
                editSettings: "编辑数据池设置",
                deletePool: "删除数据池",
                config: "配置",
                newEntity: "新建",
            },
            roster: {
                title: "实体列表",
                empty: "选择一个实体以编辑详情。",
            },
            emptyState: {
                noStats: "未生成属性。",
            },
            modals: {
                editPool: {
                    title: "编辑数据池设置",
                    name: "数据池名称",
                    desc: "描述",
                    color: "主题颜色",
                },
                config: {
                    title: "数据池配置",
                    tabs: {
                        blueprint: "蓝图",
                        relations: "关系",
                    },
                    blueprintDesc: "选定的组件定义了此数据池中实体的结构。",
                    relationsDesc: "定义关系动词（例如“是……的敌人”）。",
                    addVerb: "添加动词",
                },
                editEntity: {
                    title: "编辑实体",
                    name: "实体名称",
                    tags: "已选标签",
                },
                deleteEntity: {
                    title: "删除实体",
                    desc: "永久移除此项目？此操作无法撤销。",
                },
                deletePool: {
                    title: "删除整个数据池",
                    desc: "你确定要删除",
                    warning: "严重警告：这将永久删除所有项目，此操作无法撤销。",
                }
            }
        }
    }
};

export const useTranslation = () => {
    const { settings } = useAppSettings();
    const lang = settings.defaultLanguage || 'English';
    return TRANSLATIONS[lang] || TRANSLATIONS['English'];
};

/**
 * Lightweight string dictionary for UI texts that aren't covered by the structured TranslationSet yet.
 * Usage:
 *   const { s } = useStrings();
 *   s('toast.systemError.title')
 *   s('toast.welcome.message', { name })
 */
const UI_STRINGS: Record<string, Record<Language, string>> = {
    // --- Common / Generic ---
    'common.delete': { English: 'Delete', Chinese: '删除' },
    'common.noWorldSelected': { English: 'No World Selected', Chinese: '未选择世界' },
    'common.loadFailure.title': { English: 'Load Failure', Chinese: '加载失败' },
    'common.abort': { English: 'Abort', Chinese: '中止' },

    // --- Home (toasts + misc) ---
    'home.toast.systemError.title': { English: 'System Error', Chinese: '系统错误' },
    'home.toast.systemError.message': { English: 'Failed to load sector data.', Chinese: '加载数据失败。' },
    'home.toast.worldInitialized.title': { English: 'World Initialized', Chinese: '世界已初始化' },
    'home.toast.worldInitialized.message': { English: 'Welcome to {name}.', Chinese: '欢迎来到 {name}。' },
    'home.toast.creationFailed.title': { English: 'Creation Failed', Chinese: '创建失败' },
    'home.toast.creationFailed.message': { English: 'Could not initialize new world.', Chinese: '无法初始化新世界。' },
    'home.toast.exportComplete.title': { English: 'Export Complete', Chinese: '导出完成' },
    'home.toast.exportComplete.message': { English: 'Rulebook package downloaded.', Chinese: '规则书包已下载。' },
    'home.toast.exportFailed.title': { English: 'Export Failed', Chinese: '导出失败' },
    'home.toast.exportFailed.message': { English: 'Could not generate package.', Chinese: '无法生成导出包。' },
    'home.toast.importSuccessful.title': { English: 'Import Successful', Chinese: '导入成功' },
    'home.toast.importSuccessful.message': { English: 'Restored "{name}" from archive.', Chinese: '已从归档恢复“{name}”。' },
    'home.toast.importFailed.title': { English: 'Import Failed', Chinese: '导入失败' },
    'home.toast.importFailed.message': { English: 'Corrupted or invalid Rulebook file.', Chinese: '规则书文件损坏或格式无效。' },
    'home.toast.styleExported.title': { English: 'Style Exported', Chinese: '风格已导出' },
    'home.toast.styleExported.message': { English: 'Global narrative settings saved.', Chinese: '全局叙事设置已保存。' },
    'home.toast.styleImported.title': { English: 'Style Imported', Chinese: '风格已导入' },
    'home.toast.styleImported.message': { English: 'Loaded {count} narrative roles.', Chinese: '已加载 {count} 个叙事角色。' },
    'home.toast.invalidConfig.title': { English: 'Import Failed', Chinese: '导入失败' },
    'home.toast.invalidConfig.message': { English: 'Invalid configuration file.', Chinese: '配置文件无效。' },
    'home.toast.interfaceScaled.title': { English: 'Interface Scaled', Chinese: '界面缩放已应用' },
    'home.toast.interfaceScaled.message': { English: 'UI set to {scale}.', Chinese: '界面缩放已设为 {scale}。' },
    'home.toast.rolesUpdated.title': { English: 'Roles Updated', Chinese: '角色已更新' },
    'home.toast.rolesUpdated.message': { English: 'Narrative roles saved.', Chinese: '叙事角色已保存。' },
    'home.toast.aiConfigSaved.title': { English: 'AI Configuration Saved', Chinese: 'AI 配置已保存' },
    'home.toast.aiConfigSaved.message': { English: 'Using {provider} - {model}', Chinese: '正在使用 {provider} - {model}' },
    'home.toast.apiModeChanged.title': { English: 'API Mode Changed', Chinese: 'API 模式已切换' },
    'home.toast.apiModeChanged.custom': { English: 'Now using custom API key', Chinese: '已切换为使用自定义 API Key' },
    'home.toast.apiModeChanged.env': { English: 'Now using environment variable', Chinese: '已切换为使用环境变量' },

    // --- Dashboard ---
    'dashboard.loadFailure.desc': { English: 'Could not retrieve world data for ID: {id}', Chinese: '无法获取该 ID 的世界数据：{id}' },
    'dashboard.validationError.title': { English: 'Validation Error', Chinese: '校验错误' },
    'dashboard.validationError.worldNameEmpty': { English: 'World name cannot be empty.', Chinese: '世界名称不能为空。' },
    'dashboard.toast.configSaved.title': { English: 'Configuration Saved', Chinese: '配置已保存' },
    'dashboard.toast.configSaved.message': { English: 'World settings updated successfully.', Chinese: '世界设置已更新。' },
    'dashboard.toast.saveFailed.title': { English: 'Save Failed', Chinese: '保存失败' },
    'dashboard.toast.saveFailed.message': { English: 'Could not persist changes.', Chinese: '无法持久化保存更改。' },
    'dashboard.toast.worldDeleted.title': { English: 'World Deleted', Chinese: '世界已删除' },
    'dashboard.toast.worldDeleted.message': { English: '{name} has been removed.', Chinese: '已移除 {name}。' },
    'dashboard.toast.deletionFailed.title': { English: 'Deletion Failed', Chinese: '删除失败' },
    'dashboard.toast.deletionFailed.message': { English: 'Database error occurred.', Chinese: '发生数据库错误。' },
    'dashboard.noTagsYet': { English: 'No tags defined yet.', Chinese: '暂无标签。' },
    'dashboard.noDescriptionProvided': { English: 'No description provided.', Chinese: '暂无描述。' },
    'dashboard.itemsCount': { English: '{count} items', Chinese: '{count} 项' },

    // --- Generation Engine ---
    'forge.toast.contextAdded.title': { English: 'Context Added', Chinese: '已添加上下文' },
    'forge.toast.contextAdded.message': { English: 'Linked {name}', Chinese: '已关联 {name}' },
    'forge.toast.configError.title': { English: 'Configuration Error', Chinese: '配置错误' },
    'forge.toast.configError.message': { English: 'AI is not configured. Please set up your API key in Settings.', Chinese: 'AI 未配置，请在设置中配置 API Key。' },
    'forge.toast.missingSelection.title': { English: 'Missing Selection', Chinese: '缺少选择' },
    'forge.toast.missingSelection.message': { English: 'Please select a Target Pool before forging.', Chinese: '锻造前请选择目标数据池。' },
    'forge.toast.emptyPrompt.title': { English: 'Empty Prompt', Chinese: '提示词为空' },
    'forge.toast.emptyPrompt.message': { English: 'Please describe what you want to create.', Chinese: '请描述你想要创建的内容。' },
    'forge.toast.complete.title': { English: 'Forge Complete', Chinese: '锻造完成' },
    'forge.toast.complete.message': { English: 'Successfully generated {count} items.', Chinese: '成功生成 {count} 项。' },
    'forge.toast.generationFailed.title': { English: 'Generation Failed', Chinese: '生成失败' },
    'forge.toast.saved.title': { English: 'Saved', Chinese: '已保存' },
    'forge.toast.saved.message': { English: '{name} added to {pool}.', Chinese: '{name} 已添加到 {pool}。' },
    'forge.toast.batchSaved.title': { English: 'Batch Saved', Chinese: '批量已保存' },
    'forge.toast.batchSaved.message': { English: 'All generated items have been persisted.', Chinese: '所有生成项均已写入保存。' },
    'forge.relationship.relatedTo': { English: 'Related to', Chinese: '关联到' },
    'forge.relationship.allyOf': { English: 'Ally of', Chinese: '盟友' },
    'forge.relationship.enemyOf': { English: 'Enemy of', Chinese: '敌对' },
    'forge.length.short': { English: 'Short', Chinese: '短' },
    'forge.length.medium': { English: 'Medium', Chinese: '中' },
    'forge.length.long': { English: 'Long', Chinese: '长' },
    'forge.noStatsGenerated': { English: 'No stats generated.', Chinese: '未生成属性。' },

    // --- Pools ---
    'pools.toast.success.title': { English: 'Success', Chinese: '成功' },
    'pools.toast.success.message': { English: 'Pool settings updated.', Chinese: '数据池设置已更新。' },
    'pools.toast.error.title': { English: 'Error', Chinese: '错误' },
    'pools.toast.deleted.title': { English: 'Deleted', Chinese: '已删除' },
    'pools.toast.poolRemoved.message': { English: 'Pool removed.', Chinese: '数据池已移除。' },
    'pools.toast.actionDenied.title': { English: 'Action Denied', Chinese: '操作被拒绝' },
    'pools.toast.actionDenied.message': { English: 'Metadata component is required for system integrity.', Chinese: '为保证系统完整性，Metadata 组件是必需的。' },
    'pools.toast.characterCreated.title': { English: 'Character Created', Chinese: '角色已创建' },
    'pools.toast.characterCreated.message': { English: 'Added to roster.', Chinese: '已加入列表。' },
    'pools.toast.saved.title': { English: 'Saved', Chinese: '已保存' },
    'pools.toast.saveFailed.message': { English: 'Save failed.', Chinese: '保存失败。' },
    'pools.toast.entityRemoved.message': { English: 'Entity removed.', Chinese: '实体已移除。' },
    'pools.newCharacter': { English: 'New Character', Chinese: '新角色' },
    'pools.newItem': { English: 'New Item', Chinese: '新物品' },
    'pools.emptyCharacter.title': { English: 'No Character Selected', Chinese: '未选择角色' },
    'pools.emptyCharacter.desc': { English: 'Select a character from the roster on the left, or create a new one to get started.', Chinese: '从左侧列表选择一个角色，或创建一个新角色开始。' },
    'pools.emptyCharacter.action': { English: 'Create Character', Chinese: '创建角色' },
    'pools.relationship.selectTargets': { English: 'Select targets...', Chinese: '选择目标…' },
    'pools.relationship.noActive': { English: 'No active relationships.', Chinese: '暂无关系。' },
    'pools.relationship.addConnectionType': { English: 'Add Connection Type', Chinese: '添加关系类型' },
    'pools.relationship.selectOrTypeNew': { English: 'Select or Type New...', Chinese: '选择或输入新类型…' },
    'pools.boolean.false': { English: 'False', Chinese: '否' },
    'pools.boolean.true': { English: 'True', Chinese: '是' },
    'pools.select.placeholder': { English: '-- Select --', Chinese: '-- 请选择 --' },
    'pools.characterName': { English: 'Character Name', Chinese: '角色名称' },
    'pools.customColor': { English: 'Custom Color', Chinese: '自定义颜色' },
    'pools.noRelationshipTypes': { English: 'No relationship types defined.', Chinese: '未定义关系类型。' },
    'pools.addTags': { English: 'Add tags...', Chinese: '添加标签…' },

    // --- App Settings page ---
    'appSettings.title': { English: 'System Configuration', Chinese: '系统配置' },
    'appSettings.subtitle': { English: 'Manage global AI behavior, output preferences, and experimental tools.', Chinese: '管理全局 AI 行为、输出偏好与实验性功能。' },
    'appSettings.importStyle': { English: 'Import Style', Chinese: '导入风格' },
    'appSettings.exportStyle': { English: 'Export Style', Chinese: '导出风格' },
    'appSettings.section.localization': { English: 'Localization & Interface', Chinese: '本地化与界面' },
    'appSettings.label.targetLanguage': { English: 'Target Language', Chinese: '目标语言' },
    'appSettings.hint.languageSwitch': { English: 'Switching language will automatically update default narrative roles if translations are available.', Chinese: '切换语言后，如有对应翻译，将自动更新默认叙事角色。' },
    'appSettings.label.interfaceScale': { English: 'Interface Scale', Chinese: '界面缩放' },
    'appSettings.hint.scale': { English: 'Adjusts font size and layout density.', Chinese: '调整字体大小与布局密度。' },
    'appSettings.aiProvider.title': { English: 'AI Provider Configuration', Chinese: 'AI 提供方配置' },
    'appSettings.aiProvider.subtitle': { English: 'Choose your AI provider and model for content generation.', Chinese: '选择用于内容生成的 AI 提供方与模型。' },
    'appSettings.status.connected': { English: 'Connected', Chinese: '已连接' },
    'appSettings.status.notConfigured': { English: 'Not Configured', Chinese: '未配置' },
    'appSettings.label.selectModel': { English: 'Select Model', Chinese: '选择模型' },
    'appSettings.label.useCustomKey': { English: 'Use Custom API Key', Chinese: '使用自定义 API Key' },
    'appSettings.hint.usingPersonalKey': { English: 'Using your personal API key (stored locally)', Chinese: '使用你的个人 API Key（本地存储）' },
    'appSettings.hint.usingEnv': { English: 'Using environment variable ({key})', Chinese: '使用环境变量（{key}）' },
    'appSettings.toggle.customKey': { English: 'Custom Key', Chinese: '自定义 Key' },
    'appSettings.toggle.envVar': { English: 'Env Variable', Chinese: '环境变量' },
    'appSettings.hint.keyStoredLocally': { English: 'Your key is stored locally and never sent to any server.', Chinese: '你的 Key 仅存储在本地，不会被发送到任何服务器。' },
    'appSettings.button.saveAIConfig': { English: 'Save AI Configuration', Chinese: '保存 AI 配置' },
    'appSettings.length.title': { English: 'Output Length Definitions', Chinese: '输出长度定义' },
    'appSettings.length.subtitle': { English: 'Define instruction sets for short, medium, and long generation.', Chinese: '定义短/中/长输出的指令集。' },
    'appSettings.length.defaultSetting': { English: 'Default Setting', Chinese: '默认设置' },
    'appSettings.length.shortConcise': { English: 'Short (Concise)', Chinese: '短（精简）' },
    'appSettings.length.mediumStandard': { English: 'Medium (Standard)', Chinese: '中（标准）' },
    'appSettings.length.longDetailed': { English: 'Long (Detailed)', Chinese: '长（详细）' },
    'appSettings.length.placeholder.short': { English: 'Instruction for Short output...', Chinese: '短输出的指令…' },
    'appSettings.length.placeholder.medium': { English: 'Instruction for Medium output...', Chinese: '中输出的指令…' },
    'appSettings.length.placeholder.long': { English: 'Instruction for Long output...', Chinese: '长输出的指令…' },
    'appSettings.button.saveDefinitions': { English: 'Save Definitions', Chinese: '保存定义' },
    'appSettings.roles.title': { English: 'Narrative Roles', Chinese: '叙事角色' },
    'appSettings.roles.subtitle': { English: 'Define the personality and writing style of the AI.', Chinese: '定义 AI 的人格与写作风格。' },
    'appSettings.roles.newRole': { English: 'New Role', Chinese: '新建角色' },
    'appSettings.badge.multilingual': { English: 'Multilingual', Chinese: '多语言' },
    'appSettings.tooltip.editRole': { English: 'Edit Role', Chinese: '编辑角色' },
    'appSettings.tooltip.deleteRole': { English: 'Delete Role', Chinese: '删除角色' },
    'appSettings.modal.editRoleTitle': { English: 'Edit Narrative Role', Chinese: '编辑叙事角色' },
    'appSettings.modal.createRoleTitle': { English: 'Create New Role', Chinese: '创建新角色' },
    'appSettings.field.roleName': { English: 'Role Name', Chinese: '角色名称' },
    'appSettings.field.shortDescription': { English: 'Short Description', Chinese: '简短描述' },
    'appSettings.field.systemPrompt': { English: 'System Prompt Instruction', Chinese: '系统提示指令' },
    'appSettings.modal.cancel': { English: 'Cancel', Chinese: '取消' },
    'appSettings.modal.saveRole': { English: 'Save Role', Chinese: '保存角色' },
    'appSettings.modal.confirmDeletion': { English: 'Confirm Deletion', Chinese: '确认删除' },
    'appSettings.modal.deleteRole': { English: 'Delete Role', Chinese: '删除角色' },
    'appSettings.modal.deleteRole.question': { English: 'Are you sure you want to delete this narrative role?', Chinese: '确定要删除该叙事角色吗？' },
    'appSettings.modal.deleteRole.warning': { English: 'This action cannot be undone. Any generations using this role will revert to the default.', Chinese: '此操作无法撤销。使用该角色的生成将回退到默认值。' },
    'appSettings.experimental.title': { English: 'Experimental Features', Chinese: '实验性功能' },
    'appSettings.experimental.subtitle': { English: 'Enable or disable features that are currently in testing.', Chinese: '启用或禁用正在测试中的功能。' },
    'appSettings.imageGen.title': { English: 'Image Generation', Chinese: '图像生成' },
    'appSettings.imageGen.subtitle': { English: 'Allows generating visual previews for items using AI.', Chinese: '允许用 AI 生成物品的视觉预览。' },
    'appSettings.state.enabled': { English: 'Enabled', Chinese: '已启用' },
    'appSettings.state.disabled': { English: 'Disabled', Chinese: '已禁用' },
    'appSettings.logs.title': { English: 'System History', Chinese: '系统历史' },
    'appSettings.logs.subtitle': { English: 'Full generation history. Logs are cleared when refreshing the application.', Chinese: '完整生成历史。刷新应用后日志会被清空。' },
    'appSettings.scale.small': { English: 'Small', Chinese: '小' },
    'appSettings.scale.medium': { English: 'Medium', Chinese: '中' },
    'appSettings.scale.large': { English: 'Large', Chinese: '大' },
    'appSettings.length.short': { English: 'Short', Chinese: '短' },
    'appSettings.length.medium': { English: 'Medium', Chinese: '中' },
    'appSettings.length.long': { English: 'Long', Chinese: '长' },
    'appSettings.length.shortExample': { English: 'e.g. "Max 30 words"', Chinese: '例如"最多30字"' },
    'appSettings.length.mediumExample': { English: 'e.g. "Approx 100 words"', Chinese: '例如"约100字"' },
    'appSettings.length.longExample': { English: 'e.g. "Min 500 words"', Chinese: '例如"至少500字"' },
    'appSettings.modal.roleNamePlaceholder': { English: 'e.g. The Crypt Keeper', Chinese: '例如：守墓人' },
    'appSettings.modal.roleDescPlaceholder': { English: 'e.g. Spooky & Ancient', Chinese: '例如：阴森古老' },
    'appSettings.modal.systemPromptPlaceholder': { English: "Define who the AI is. E.g., 'You are an ancient scholar writing in a dusty tome...'", Chinese: '定义 AI 的身份。例如："你是一位在尘封古籍中书写的远古学者……"' },
    'appSettings.modal.tip': { English: 'Tip:', Chinese: '提示：' },
    'appSettings.modal.tipContent': { English: 'Custom edits apply universally. To support multilingual switching for this role, please use the Import Config feature with an i18n block.', Chinese: '自定义编辑会全局应用。如需支持多语言切换，请使用带有 i18n 块的导入配置功能。' },

    // --- World Settings page ---
    'worldSettings.title': { English: 'World Settings & Context', Chinese: '世界设置与上下文' },
    'worldSettings.subtitle': { English: 'Define the background lore, physics, and rules that guide the AI.', Chinese: '定义引导 AI 的背景设定、物理规则与世界规则。' },
    'worldSettings.button.guide': { English: 'Guide', Chinese: '指南' },
    'worldSettings.saving': { English: 'Saving...', Chinese: '保存中…' },
    'worldSettings.saveChanges': { English: 'Save Changes', Chinese: '保存更改' },
    'worldSettings.saved': { English: 'Saved', Chinese: '已保存' },
    'worldSettings.section.systemOverrides': { English: 'System Overrides', Chinese: '系统覆盖' },
    'worldSettings.section.systemOverrides.desc': { English: 'Control global AI behaviors for this specific world.', Chinese: '控制该世界的全局 AI 行为。' },
    'worldSettings.prefixActive': { English: 'Prefix Active', Chinese: '前缀已启用' },
    'worldSettings.prefixDisabled': { English: 'Prefix Disabled', Chinese: '前缀已禁用' },
    'worldSettings.activeGlobalPrefix': { English: 'Active Global Prefix:', Chinese: '当前全局前缀：' },
    'worldSettings.noGlobalPrefix': { English: 'No global prefix defined in Home settings.', Chinese: '主界面设置中未定义全局前缀。' },
    'worldSettings.section.generalSetting': { English: 'General Setting', Chinese: '总体设定' },
    'worldSettings.section.generalSetting.desc': { English: 'The primary background information for your world. Include genre specifics, atmosphere, and major historical events.', Chinese: '世界的主要背景信息：包含类型特征、氛围与重大历史事件等。' },
    'worldSettings.placeholder.sourceOfTruth': { English: 'Define the Source of Truth: The physics, the tone, the major factions, the magic system, or the level of technology. This is the bedrock of your world.', Chinese: '定义“事实基底”：物理规则、整体基调、主要派系、魔法体系或科技水平等，这是世界设定的基石。' },
    'worldSettings.section.customFields': { English: 'Custom Context Fields', Chinese: '自定义上下文字段' },
    'worldSettings.section.customFields.desc': { English: 'Add specific sections to clarify the prompt (e.g. Magic System, Technology, Physics).', Chinese: '添加具体章节以澄清提示词（如：魔法体系、科技、物理规则）。' },
    'worldSettings.button.addField': { English: 'Add Field', Chinese: '添加字段' },
    'worldSettings.empty.noCustomFields': { English: 'No custom context fields defined.', Chinese: '未定义自定义上下文字段。' },
    'worldSettings.empty.addOne': { English: 'Add one to guide the AI', Chinese: '添加一个来引导 AI' },
    'worldSettings.placeholder.fieldName': { English: 'FIELD NAME (e.g. MAGIC)', Chinese: '字段名（例如：MAGIC）' },
    'worldSettings.placeholder.description': { English: 'Description...', Chinese: '描述…' },
    'worldSettings.guide.title': { English: 'Prompt Context Guide', Chinese: '提示词上下文指南' },
    'worldSettings.guide.close': { English: 'Close Guide', Chinese: '关闭指南' },
    'worldSettings.guide.mainDesc': { English: 'The text you provide here is injected directly into the System Prompt of the AI whenever you use the AI Forge. Clearer context leads to better, more consistent generations.', Chinese: '你在此提供的文本会在你使用 AI 锻造时直接注入到 AI 的系统提示词中。更清晰的上下文能带来更好、更一致的生成结果。' },
    'worldSettings.guide.howItWorks': { English: 'How it works', Chinese: '工作原理' },
    'worldSettings.guide.list.worldNameGenre': { English: 'World Name & Genre', Chinese: '世界名称与类型' },
    'worldSettings.guide.list.generalSetting': { English: 'General Setting (Your main description)', Chinese: '总体设定（你的主要描述）' },
    'worldSettings.guide.list.customFields': { English: 'Custom Fields (Labeled sections)', Chinese: '自定义字段（带标签的章节）' },
    'worldSettings.guide.list.poolList': { English: 'Pool List (What categories exist)', Chinese: '数据池列表（有哪些类别）' },
    'worldSettings.guide.whenRequest': { English: 'When you request an item, the AI receives:', Chinese: '当你请求生成内容时，AI 会接收：' },
    'worldSettings.guide.tips': { English: 'Tips for Custom Fields', Chinese: '自定义字段建议' },
    'worldSettings.guide.magicSystem': { English: 'Magic System', Chinese: '魔法体系' },
    'worldSettings.guide.technology': { English: 'Technology', Chinese: '科技水平' },
    'worldSettings.guide.cosmology': { English: 'Cosmology', Chinese: '宇宙观' },
    'worldSettings.guide.magicDesc': { English: 'Define the rules of magic. Is it rare? Dangerous? Elemental? This stops the AI from generating generic "Fireballs" if your world uses "Soul Arts".', Chinese: '定义魔法规则：稀有与否？是否危险？元素体系？这可以避免在你的世界使用“灵魂术”时，AI 仍然生成泛化的“火球术”。' },
    'worldSettings.guide.techDesc': { English: 'Clarify the tech level. Steampunk? Cyberpunk? Stone Age?', Chinese: '明确科技水平：蒸汽朋克？赛博朋克？石器时代？' },
    'worldSettings.guide.cosmoDesc': { English: 'Are there gods? Multiple moons? Flat earth?', Chinese: '是否存在神明？多月？平面世界？' },

    // --- Roller ---
    'roller.toast.dbError.title': { English: 'DB Error', Chinese: '数据库错误' },
    'roller.toast.dbError.message': { English: 'Failed to load candidates.', Chinese: '加载候选项失败。' },
    'roller.toast.emptyPool.title': { English: 'Empty Pool', Chinese: '数据池为空' },
    'roller.toast.emptyPool.message': { English: 'No items available to roll.', Chinese: '没有可供掷骰的条目。' },
    'roller.toast.rollFailed.title': { English: 'Roll Failed', Chinese: '掷骰失败' },
    'roller.toast.rollFailed.message': { English: 'All items filtered out.', Chinese: '所有条目都被筛掉了。' },
    'roller.panel.config': { English: 'Config', Chinese: '配置' },
    'roller.panel.candidates': { English: '{count} Candidates', Chinese: '{count} 候选项' },
    'roller.label.targetPool': { English: 'Target Pool', Chinese: '目标数据池' },
    'roller.label.contextTags': { English: 'Context Tags', Chinese: '上下文标签' },
    'roller.placeholder.contextTags': { English: 'e.g. night, forest', Chinese: '例如：night, forest' },
    'roller.panel.runtimeConstraints': { English: 'Runtime Constraints', Chinese: '运行时约束' },
    'roller.placeholder.path': { English: 'Path (e.g. components.basic_stats.power)', Chinese: '路径（例如：components.basic_stats.power）' },
    'roller.placeholder.value': { English: 'Value', Chinese: '值' },
    'roller.empty.noConstraints': { English: 'No active constraints.', Chinese: '暂无约束。' },
    'roller.loading': { English: 'Loading...', Chinese: '加载中…' },
    'roller.roll': { English: 'ROLL', Chinese: '掷骰' },
    'roller.awaitingInput': { English: 'Awaiting Input', Chinese: '等待输入' },
    'roller.executionLog': { English: 'Execution Log', Chinese: '执行日志' },
    'roller.operator.eq': { English: 'Equals (=)', Chinese: '等于 (=)' },
    'roller.operator.neq': { English: 'Not Equals (!=)', Chinese: '不等于 (!=)' },
    'roller.operator.gt': { English: 'Greater Than (>)', Chinese: '大于 (>)' },
    'roller.operator.gte': { English: 'Greater/Equal (>=)', Chinese: '大于等于 (>=)' },
    'roller.operator.lt': { English: 'Less Than (<)', Chinese: '小于 (<)' },
    'roller.operator.lte': { English: 'Less/Equal (<=)', Chinese: '小于等于 (<=)' },
    'roller.operator.contains': { English: 'Contains', Chinese: '包含' },
    'roller.operator.missing': { English: 'Missing', Chinese: '缺失' },
    'roller.operator.truthy': { English: 'Exists', Chinese: '存在' },

    // --- Tag Manager ---
    'tagManager.newTag': { English: 'New Tag', Chinese: '新建标签' },
    'tagManager.searchPlaceholder': { English: 'Search tags...', Chinese: '搜索标签…' },
    'tagManager.allTags': { English: 'All Tags', Chinese: '全部标签' },
    'tagManager.noDescription': { English: 'No description', Chinese: '无描述' },
    'tagManager.noMatches': { English: 'No matching tags found.', Chinese: '未找到匹配的标签。' },
    'tagManager.modal.confirmRenaming': { English: 'Confirm Renaming', Chinese: '确认重命名' },
    'tagManager.modal.deleteTag': { English: 'Delete Tag', Chinese: '删除标签' },
    'tagManager.modal.createNewTag': { English: 'Create New Tag', Chinese: '创建新标签' },
    'tagManager.button.createTag': { English: 'Create Tag', Chinese: '创建标签' },
    'tagManager.field.label': { English: 'Label', Chinese: '名称' },
    'tagManager.field.description': { English: 'Description', Chinese: '描述' },
    'tagManager.button.cancel': { English: 'Cancel', Chinese: '取消' },
    'tagManager.button.save': { English: 'Save', Chinese: '保存' },
    'tagManager.toast.validationError.title': { English: 'Validation Error', Chinese: '校验错误' },
    'tagManager.toast.validationError.message': { English: 'Tag label is required.', Chinese: '标签名称为必填项。' },
    'tagManager.toast.tagCreated.title': { English: 'Tag Created', Chinese: '标签已创建' },
    'tagManager.toast.tagCreated.message': { English: "Added '{label}' to registry.", Chinese: '已将“{label}”添加到注册表。' },
    'tagManager.toast.persistFailed.title': { English: 'Error', Chinese: '错误' },
    'tagManager.toast.persistFailed.message': { English: 'Failed to persist new tag.', Chinese: '保存新标签失败。' },
    'tagManager.toast.scanFailed.title': { English: 'Error', Chinese: '错误' },
    'tagManager.toast.scanFailed.message': { English: 'Failed to scan database index.', Chinese: '扫描数据库索引失败。' },
    'tagManager.toast.tagDeleted.title': { English: 'Tag Deleted', Chinese: '标签已删除' },
    'tagManager.toast.tagDeleted.message': { English: 'Definition removed from registry.', Chinese: '定义已从注册表移除。' },
    'tagManager.toast.deleteFailed.title': { English: 'Error', Chinese: '错误' },
    'tagManager.toast.deleteFailed.message': { English: 'Failed to delete tag.', Chinese: '删除标签失败。' },
    'tagManager.toast.saved.title': { English: 'Saved', Chinese: '已保存' },
    'tagManager.toast.saved.message': { English: 'Tag metadata updated.', Chinese: '标签元数据已更新。' },
    'tagManager.toast.saveFailed.title': { English: 'Save Failed', Chinese: '保存失败' },
    'tagManager.toast.saveFailed.message': { English: 'Could not update tag.', Chinese: '无法更新标签。' },
    'tagManager.toast.migrationComplete.title': { English: 'Migration Complete', Chinese: '迁移完成' },
    'tagManager.toast.migrationComplete.message': { English: "Updated {count} entities to use '{label}'.", Chinese: '已更新 {count} 个实体使用“{label}”。' },
    'tagManager.toast.migrationFailed.title': { English: 'Migration Failed', Chinese: '迁移失败' },
    'tagManager.toast.migrationFailed.message': { English: 'Database transaction error.', Chinese: '数据库事务错误。' },
    'tagManager.modal.deleteQuestion': { English: 'Are you sure you want to delete this tag definition?', Chinese: '确定要删除该标签定义吗？' },
    'tagManager.modal.checkingUsage': { English: 'Checking usage...', Chinese: '正在检查使用情况…' },
    'tagManager.modal.warningPrefix': { English: 'Warning:', Chinese: '警告：' },
    'tagManager.modal.usageWarning': { English: 'This tag is currently used by {count} entities. Deleting the definition will not remove the tag from entities, but they will lose metadata (color/description).', Chinese: '该标签当前被 {count} 个实体使用。删除定义不会从实体中移除标签，但会丢失元数据（颜色/描述）。' },
    'tagManager.modal.renameBody': { English: 'Renaming {old} to {new} will update all entities in the database.', Chinese: '将 {old} 重命名为 {new} 会更新数据库中的所有实体。' },
    'tagManager.modal.renameHint': { English: 'This operation might take a moment depending on database size.', Chinese: '该操作耗时取决于数据库规模，可能需要一点时间。' },
    'tagManager.button.confirmRename': { English: 'Confirm Rename', Chinese: '确认重命名' },
    'tagManager.button.migrating': { English: 'Migrating...', Chinese: '迁移中…' },
    'tagManager.placeholder.exampleLabel': { English: 'e.g. Arcane', Chinese: '例如：奥术' },
    'tagManager.placeholder.contextUsage': { English: 'Context usage...', Chinese: '使用场景…' },

    // --- Component Manager ---
    'componentManager.registry': { English: 'Registry', Chinese: '注册表' },
    'componentManager.createComponent': { English: 'Create Component', Chinese: '创建组件' },
    'componentManager.saveDefinition': { English: 'Save Definition', Chinese: '保存定义' },
    'componentManager.deleteComponent': { English: 'Delete Component', Chinese: '删除组件' },
    'componentManager.toast.validationError.title': { English: 'Validation Error', Chinese: '校验错误' },
    'componentManager.toast.validationError.message': { English: 'Component label is required.', Chinese: '组件名称为必填项。' },
    'componentManager.toast.accessDenied.title': { English: 'Access Denied', Chinese: '拒绝访问' },
    'componentManager.toast.accessDenied.message': { English: 'Metadata definition is immutable.', Chinese: 'Metadata 定义不可修改。' },
    'componentManager.toast.schemaUpdated.title': { English: 'Schema Updated', Chinese: '架构已更新' },
    'componentManager.toast.schemaUpdated.message': { English: "Saved definition for '{label}'.", Chinese: '已保存“{label}”的定义。' },
    'componentManager.toast.saveFailed.title': { English: 'Save Failed', Chinese: '保存失败' },
    'componentManager.toast.systemProtected.title': { English: 'System Protected', Chinese: '系统保护' },
    'componentManager.toast.systemProtected.message': { English: 'Core components cannot be deleted.', Chinese: '核心组件不可删除。' },
    'componentManager.toast.deleted.title': { English: 'Deleted', Chinese: '已删除' },
    'componentManager.toast.deleted.message': { English: 'Component removed from registry.', Chinese: '组件已从注册表移除。' },
    'componentManager.toast.deletionFailed.title': { English: 'Deletion Failed', Chinese: '删除失败' },
    'componentManager.label.category': { English: 'Category', Chinese: '分类' },
    'componentManager.probabilityEngine': { English: 'Probability Engine', Chinese: '概率引擎' },
    'componentManager.totalWeight': { English: 'Total Weight:', Chinese: '总权重：' },
    'componentManager.systemComponent': { English: 'System Component', Chinese: '系统组件' },
    'componentManager.key': { English: 'Key', Chinese: '键' },
    'componentManager.type': { English: 'Type', Chinese: '类型' },
    'componentManager.defaultState': { English: 'Default State', Chinese: '默认状态' },
    'componentManager.defaultSelection': { English: 'Default Selection', Chinese: '默认选项' },
    'componentManager.default': { English: 'Default', Chinese: '默认值' },
    'componentManager.constraint': { English: 'Constraint', Chinese: '约束' },
    'componentManager.float': { English: 'Float', Chinese: '浮点' },
    'componentManager.integer': { English: 'Integer', Chinese: '整数' },
    'componentManager.defaultDate': { English: 'Default Date', Chinese: '默认日期' },
    'componentManager.defaultText': { English: 'Default Text', Chinese: '默认文本' },
    'componentManager.schemaFields': { English: 'Schema Fields', Chinese: '架构字段' },
    'componentManager.addField': { English: 'Add Field', Chinese: '添加字段' },
    'componentManager.fieldKey': { English: 'Field Key', Chinese: '字段键' },
    'componentManager.dataType': { English: 'Data Type', Chinese: '数据类型' },
    'componentManager.dropdownOptions': { English: 'Dropdown Options', Chinese: '下拉选项' },

    // --- Rules ---
    'rules.title': { English: 'Narrative Logic', Chinese: '叙事逻辑' },
    'rules.subtitle': { English: 'Define descriptive rules and link them to world entities for reference.', Chinese: '定义描述性规则，并将其关联到世界实体以便引用。' },
    'rules.listTitle': { English: 'Rules', Chinese: '规则' },
    'rules.none': { English: 'No rules defined.', Chinese: '暂无规则。' },
    'rules.field.ruleName': { English: 'Rule Name', Chinese: '规则名称' },
    'rules.button.addReference': { English: 'Add Reference', Chinese: '添加引用' },
    'rules.placeholder.ruleName': { English: 'Rule Name', Chinese: '规则名称' },
    'rules.placeholder.content': { English: "Describe the rule logic here. E.g. 'If [Enemy: Pope] is killed, then [Location: Church] is locked.'", Chinese: '在此描述规则逻辑。例如：“如果[敌人：教皇]被击杀，则[地点：教堂]被锁定。”' },
    'rules.toast.validationError.title': { English: 'Validation Error', Chinese: '校验错误' },
    'rules.toast.validationError.message': { English: 'Rule name is required.', Chinese: '规则名称为必填项。' },
    'rules.toast.saved.title': { English: 'Rule Saved', Chinese: '规则已保存' },
    'rules.toast.saved.message': { English: 'Narrative rule updated.', Chinese: '叙事规则已更新。' },
    'rules.toast.saveFailed.title': { English: 'Error', Chinese: '错误' },
    'rules.toast.saveFailed.message': { English: 'Failed to save rule.', Chinese: '保存规则失败。' },
    'rules.toast.deleted.title': { English: 'Deleted', Chinese: '已删除' },
    'rules.toast.deleted.message': { English: 'Rule removed.', Chinese: '规则已移除。' },
    'rules.toast.deleteFailed.title': { English: 'Error', Chinese: '错误' },
    'rules.toast.deleteFailed.message': { English: 'Failed to delete rule.', Chinese: '删除规则失败。' },
    'rules.modal.deleteTitle': { English: 'Delete Rule', Chinese: '删除规则' },
    'rules.modal.deleteQuestion': { English: 'Permanently delete this narrative rule?', Chinese: '永久删除该叙事规则？' },
    'rules.empty.selectHint': { English: 'Select a rule to edit or create a new one.', Chinese: '选择一条规则进行编辑，或创建新规则。' },

    // --- Shared Forge Components ---
    'shared.systemLogs': { English: 'System Logs', Chinese: '系统日志' },
    'shared.selectReferenceEntity': { English: 'Select Reference Entity', Chinese: '选择引用实体' },
    'shared.allPools': { English: 'All Pools', Chinese: '全部数据池' },
    'shared.searchByNameOrTag': { English: 'Search by name or tag...', Chinese: '按名称或标签搜索…' },
    'shared.searching': { English: 'Searching...', Chinese: '搜索中…' },
    'shared.noMatchingEntities': { English: 'No matching entities found.', Chinese: '未找到匹配的实体。' },
    'shared.tryDifferentSearch': { English: 'Try a different search term or pool.', Chinese: '尝试更换搜索词或数据池。' },
    'shared.foundMatches': { English: 'Found {count} matches', Chinese: '找到 {count} 条匹配' },
    'shared.hoverForDetails': { English: 'Hover for details', Chinese: '悬停查看详情' },
    'shared.noDescriptionProvided': { English: 'No description provided.', Chinese: '暂无描述。' },
    'shared.systemPromptPayload': { English: 'System Prompt payload:', Chinese: '系统提示词负载：' },
    'shared.rawJsonResponse': { English: 'Raw JSON Response:', Chinese: '原始 JSON 响应：' },

    // --- NexusSourceLayout ---
    'sourceLayout.sources': { English: 'Sources', Chinese: '来源' },
    'sourceLayout.search': { English: 'Search...', Chinese: '搜索…' },

    // --- Breadcrumb ---
    'breadcrumb.hub': { English: 'Hub', Chinese: '主页' },
    'breadcrumb.world': { English: 'World', Chinese: '世界' },
    'breadcrumb.overview': { English: 'Overview', Chinese: '总览' },
    'breadcrumb.worldContext': { English: 'World Context', Chinese: '世界背景' },
    'breadcrumb.settings': { English: 'Settings', Chinese: '设置' },
    'breadcrumb.tagManager': { English: 'Tag Manager', Chinese: '标签管理' },
    'breadcrumb.components': { English: 'Components', Chinese: '组件' },
    'breadcrumb.aiForge': { English: 'AI Forge', Chinese: 'AI 锻造' },
    'breadcrumb.loreForge': { English: 'Lore Forge', Chinese: '设定锻造' },
    'breadcrumb.characterForge': { English: 'Character Forge', Chinese: '角色锻造' },
    'breadcrumb.rules': { English: 'Rules', Chinese: '规则' },
    'breadcrumb.rollerTest': { English: 'Roller Test', Chinese: '掷骰测试' },

    // --- NexusEntityPicker ---
    'entityPicker.title': { English: 'Select Entity / Tag', Chinese: '选择实体/标签' },
    'entityPicker.titleTag': { English: 'Select Tag', Chinese: '选择标签' },
    'entityPicker.titleEntity': { English: 'Select Entity', Chinese: '选择实体' },
    'entityPicker.allSources': { English: 'All Sources', Chinese: '全部来源' },
    'entityPicker.commonTags': { English: 'Common Tags', Chinese: '通用标签' },
    'entityPicker.tags': { English: 'Tags', Chinese: '标签' },
    'entityPicker.entities': { English: 'Entities', Chinese: '实体' },
    'entityPicker.startTyping': { English: 'Start typing to search...', Chinese: '输入以开始搜索…' },
    'entityPicker.selected': { English: '{count} selected', Chinese: '已选 {count} 项' },
    'entityPicker.done': { English: 'Done', Chinese: '完成' },
    'entityPicker.searchIn': { English: 'Search in {source}...', Chinese: '在 {source} 中搜索…' },
    'entityPicker.create': { English: 'Create "{text}"', Chinese: '创建 "{text}"' },

    // --- Component Manager Extended ---
    'componentManager.id': { English: 'ID', Chinese: 'ID' },
    'componentManager.componentLabel': { English: 'Component Label', Chinese: '组件名称' },
    'componentManager.componentLabelPlaceholder': { English: 'e.g. Combat Stats', Chinese: '例如：战斗属性' },
    'componentManager.aiContextDescription': { English: 'AI Context Description', Chinese: 'AI 上下文描述' },
    'componentManager.aiContextPlaceholder': { English: "Explain to the AI what this component represents (e.g. 'Physical attributes determining damage output')...", Chinese: '向 AI 解释此组件代表什么（例如"决定伤害输出的物理属性"）…' },
    'componentManager.newFieldDefault': { English: 'new_field', Chinese: 'new_field' },
    'componentManager.developerNote': { English: 'Developer Note:', Chinese: '开发者备注：' },
    'componentManager.developerNoteText': { English: 'This is a low-level schema editor. Changes made here affect how the database stores data. To change how entities interact, use the Pool Configuration or Rules engine.', Chinese: '这是一个低级架构编辑器。此处的更改会影响数据库存储数据的方式。要更改实体交互方式，请使用数据池配置或规则引擎。' },
    'componentManager.editSchema': { English: 'Edit Schema:', Chinese: '编辑架构：' },
    'componentManager.newComponent': { English: 'new_component', Chinese: 'new_component' },
    'componentManager.systemCore': { English: 'System Core', Chinese: '系统核心' },
    'componentManager.system': { English: 'System', Chinese: '系统' },
    'componentManager.addRarityTier': { English: 'Add Rarity Tier', Chinese: '添加稀有度层级' },
    'componentManager.probabilityDesc': { English: 'Define tiers. Weights determine roll probability automatically.', Chinese: '定义层级。权重自动决定掷骰概率。' },
    'componentManager.systemComponentDesc': { English: 'This component defines critical entity identity. Schema fields are visible for reference but cannot be modified to prevent database corruption.', Chinese: '此组件定义了关键的实体身份。架构字段可见供参考，但无法修改以防止数据库损坏。' },
    'componentManager.propertyNamePlaceholder': { English: 'property_name', Chinese: 'property_name' },
    'componentManager.selectDefault': { English: '-- Select Default --', Chinese: '-- 选择默认值 --' },
    'componentManager.textString': { English: 'Text (String)', Chinese: '文本 (字符串)' },
    'componentManager.number': { English: 'Number', Chinese: '数字' },
    'componentManager.boolean': { English: 'Boolean', Chinese: '布尔值' },
    'componentManager.date': { English: 'Date', Chinese: '日期' },
    'componentManager.selectMenu': { English: 'Select Menu', Chinese: '下拉菜单' },
    'componentManager.addOption': { English: 'Add Option', Chinese: '添加选项' },
    'componentManager.newOption': { English: 'New Option', Chinese: '新选项' },
    'componentManager.newTier': { English: 'New Tier', Chinese: '新层级' },
    'componentManager.label': { English: 'Label', Chinese: '标签' },
    'componentManager.deleteConfirm': { English: 'Permanently delete', Chinese: '永久删除' },
    'componentManager.usageWarning': { English: 'Usage Warning', Chinese: '使用警告' },
    'componentManager.usedByEntities': { English: 'Used by {count} entities across {pools} pools.', Chinese: '在 {pools} 个数据池中被 {count} 个实体使用。' },
    'componentManager.confirmDeletion': { English: 'Confirm Deletion', Chinese: '确认删除' },
    'componentManager.false': { English: 'False', Chinese: '否' },
    'componentManager.true': { English: 'True', Chinese: '是' },
    'componentManager.category.general': { English: 'General', Chinese: '通用' },
    'componentManager.category.system': { English: 'System', Chinese: '系统' },
    'componentManager.category.core': { English: 'Core', Chinese: '核心' },
    'componentManager.category.systemTag': { English: 'System', Chinese: '系统' },
    'componentManager.rarity.common': { English: 'Common', Chinese: '普通' },
    'componentManager.rarity.uncommon': { English: 'Uncommon', Chinese: '罕见' },
    'componentManager.rarity.rare': { English: 'Rare', Chinese: '稀有' },
    'componentManager.rarity.epic': { English: 'Epic', Chinese: '史诗' },
    'componentManager.rarity.legendary': { English: 'Legendary', Chinese: '传说' },

    // --- Forge Extended ---
    'forge.usingModel': { English: 'Using Model', Chinese: '使用模型' },
    'forge.placeholder.mustContain': { English: 'e.g. fire, ancient', Chinese: '例如：fire, ancient' },
    'forge.placeholder.mustAvoid': { English: 'e.g. futuristic', Chinese: '例如：futuristic' },

    // --- Roller Disabled ---
    'roller.disabled': { English: 'Under Maintenance', Chinese: '维护中' },
    'roller.disabledDesc': { English: 'This feature is temporarily unavailable.', Chinese: '此功能暂时不可用。' },

    // --- Home Global Config Modal ---
    'home.config.uiScaling': { English: 'UI Scaling', Chinese: '界面缩放' },
    'home.config.uiScalingHint': { English: 'Adjusts the global font size and density of the Nexus interface.', Chinese: '调整全局字体大小与界面密度。' },
    'home.config.defaultLanguage': { English: 'Default Language', Chinese: '默认语言' },
    'home.config.outputLanguageHint': { English: 'Output language for AI generation.', Chinese: 'AI 生成的输出语言。' },
    'home.config.styleConfig': { English: 'Style Config', Chinese: '风格配置' },
    'home.config.importStyle': { English: 'Import Style', Chinese: '导入风格' },
    'home.config.exportStyle': { English: 'Export Style', Chinese: '导出风格' },
    'home.config.globalAIPrefix': { English: 'Global AI Prefix', Chinese: '全局 AI 前缀' },
    'home.config.globalAIPrefixPlaceholder': { English: "System instructions injected into every AI call (e.g. 'Be succinct', 'No modern tech')...", Chinese: '注入到每个 AI 调用的系统指令（例如"简洁明了"、"禁用现代科技"）...' },
    'home.config.narrativeRoles': { English: 'Narrative Roles', Chinese: '叙事角色' },
    'home.config.addRole': { English: 'Add Role', Chinese: '添加角色' },
    'home.config.editingRole': { English: 'Editing Role', Chinese: '编辑角色' },
    'home.config.roleName': { English: 'Role Name', Chinese: '角色名称' },
    'home.config.shortDesc': { English: 'Short Desc', Chinese: '简短描述' },
    'home.config.systemInstruction': { English: "System Instruction (e.g. 'You are a gritty narrator...')", Chinese: '系统指令（例如"你是一位硬派叙述者..."）' },
    'home.config.aiProviderConfig': { English: 'AI Provider Configuration', Chinese: 'AI 提供方配置' },
    'home.config.aiProviderDesc': { English: 'Choose your AI provider and model for content generation.', Chinese: '选择用于内容生成的 AI 提供方与模型。' },
    'home.config.selectModel': { English: 'Select Model', Chinese: '选择模型' },
    'home.config.useCustomKey': { English: 'Use Custom API Key', Chinese: '使用自定义 API Key' },
    'home.config.usingPersonalKey': { English: 'Using your personal API key (stored locally)', Chinese: '使用你的个人 API Key（本地存储）' },
    'home.config.usingEnvVar': { English: 'Using environment variable ({key})', Chinese: '使用环境变量（{key}）' },
    'home.config.customKey': { English: 'Custom', Chinese: '自定义' },
    'home.config.envKey': { English: 'Env', Chinese: '环境变量' },
    'home.config.keyStoredLocally': { English: 'Your key is stored locally and never sent to any server.', Chinese: '你的 Key 仅存储在本地，不会被发送到任何服务器。' },
    'home.config.saveAIConfig': { English: 'Save AI Configuration', Chinese: '保存 AI 配置' },
    'home.config.connected': { English: 'Connected', Chinese: '已连接' },
    'home.config.notConfigured': { English: 'Not Configured', Chinese: '未配置' },
    'home.config.imageGeneration': { English: 'Image Generation', Chinese: '图像生成' },
    'home.config.imageGenDesc': { English: 'Visual asset generation is currently disabled.', Chinese: '视觉资源生成当前已禁用。' },
    'home.config.comingSoon': { English: 'Coming Soon', Chinese: '即将推出' },
    'home.config.unavailable': { English: 'Unavailable', Chinese: '不可用' },

    // --- WorldForgeModal ---
    'worldForge.title': { English: 'AI World Genesis V2', Chinese: 'AI 世界生成 V2' },
    'worldForge.toast.aiNotConfigured.title': { English: 'AI Not Configured', Chinese: 'AI 未配置' },
    'worldForge.toast.aiNotConfigured.message': { English: 'Please set up your API key in Settings.', Chinese: '请在设置中配置你的 API Key。' },
    'worldForge.toast.error.title': { English: 'Error', Chinese: '错误' },
    'worldForge.toast.generateOptionsFailed': { English: 'Failed to generate options.', Chinese: '生成选项失败。' },
    'worldForge.toast.inputRequired.title': { English: 'Input Required', Chinese: '需要输入' },
    'worldForge.toast.inputRequired.message': { English: 'Please enter a story prompt.', Chinese: '请输入故事提示词。' },
    'worldForge.toast.analysisFailed.title': { English: 'Analysis Failed', Chinese: '解析失败' },
    'worldForge.toast.analysisFailed.message': { English: 'AI could not parse story.', Chinese: 'AI 无法解析该故事。' },
    'worldForge.toast.genesisFailed.title': { English: 'Genesis Failed', Chinese: '生成失败' },
    'worldForge.toast.genesisFailed.message': { English: 'Build process encountered an error.', Chinese: '构建过程发生错误。' },
    'worldForge.engineTitle': { English: 'Story-to-World Engine V2', Chinese: '故事转世界引擎 V2' },
    'worldForge.step1': { English: 'Step 1: Define the core identity. Use the AI to brainstorm or enter your own.', Chinese: '第 1 步：定义核心身份。可用 AI 头脑风暴，或手动输入。' },
    'worldForge.label.language': { English: 'Language', Chinese: '语言' },
    'worldForge.label.narrativeTone': { English: 'Narrative Tone', Chinese: '叙事语气' },
    'worldForge.defaultStyle': { English: '-- Default Style --', Chinese: '-- 默认风格 --' },
    'worldForge.brainstorming': { English: 'Brainstorming...', Chinese: '头脑风暴中…' },
    'worldForge.generateOptions': { English: 'Generate Options', Chinese: '生成选项' },
    'worldForge.worldTitle': { English: 'World Title', Chinese: '世界标题' },
    'worldForge.noOptionsGenerated': { English: 'No options generated', Chinese: '尚未生成选项' },
    'worldForge.manualTitle': { English: 'Manual Title...', Chinese: '手动标题…' },
    'worldForge.richGenre': { English: 'Rich Genre Description', Chinese: '类型描述（丰富版）' },
    'worldForge.manualGenre': { English: 'Manual Genre...', Chinese: '手动类型…' },
    'worldForge.storyPrompt': { English: 'Story Context / Prompt', Chinese: '故事上下文 / 提示词' },
    'worldForge.storyPlaceholder': { English: 'Paste your story outline, notes, or blurb here...', Chinese: '在此粘贴故事大纲、笔记或简介…' },
    'worldForge.decomposerResults': { English: 'Story Decomposer Results', Chinese: '故事解析结果' },
    'worldForge.aiSummary': { English: 'AI Summary', Chinese: 'AI 摘要' },
    'worldForge.proposedCategories': { English: 'Proposed Categories (Select Pools)', Chinese: '建议类别（选择数据池）' },
    'worldForge.selectedCount': { English: '{count} selected', Chinese: '已选 {count} 项' },
    'worldForge.generationEngine': { English: 'Generation Engine', Chinese: '生成引擎' },
    'worldForge.complexityLevel': { English: 'Complexity Level', Chinese: '复杂度' },
    'worldForge.standard': { English: 'Standard', Chinese: '标准' },
    'worldForge.deepLore': { English: 'Deep Lore', Chinese: '深度设定' },
    'worldForge.deepLoreDesc': { English: 'Enables multi-paragraph descriptions, hidden secrets, and complex relationship mapping. Slower generation.', Chinese: '启用多段描述、隐藏秘密与复杂关系映射。生成更慢。' },
    'worldForge.standardDesc': { English: 'Balanced descriptions suitable for standard gameplay reference. Faster generation.', Chinese: '平衡描述，适合常规玩法参考。生成更快。' },
    'worldForge.tokenCost': { English: 'Token Cost: {count}', Chinese: 'Token 消耗：{count}' },
    'worldForge.cancel': { English: 'Cancel', Chinese: '取消' },
    'worldForge.decomposing': { English: 'Decomposing Story...', Chinese: '解析故事中…' },
    'worldForge.nextAnalyze': { English: 'Next: Analyze', Chinese: '下一步：分析' },
    'worldForge.confirmBuild': { English: 'Confirm & Build', Chinese: '确认并构建' },
};

export const useStrings = () => {
    const { settings } = useAppSettings();
    const lang = (settings.defaultLanguage || 'English') as Language;

    const s = (key: string, vars?: StringVars) => {
        const entry = UI_STRINGS[key];
        if (!entry) return key; // fail-safe: show key instead of silent empty
        const template = entry[lang] ?? entry.English;
        return formatTemplate(template, vars);
    };

    return { lang, s };
};