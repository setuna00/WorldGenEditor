export type PoolCategory = 'Asset' | 'World' | 'Character';

// --- CONFIGURATION & RULES ---
export interface RarityDefinition {
    id: string;
    label: string;
    weight: number;
    color: string;
}

export interface WorldConfig {
    genre: string;
    loreContext?: string;
    contextFields?: { id: string; key: string; value: string }[];
    raritySettings?: {
        levels: RarityDefinition[];
        defaultLevel: string;
    };
    // NEW: Toggle to use the global prefix for this world
    useGlobalPromptPrefix?: boolean;
}

// --- SCHEMA SYSTEM ---
export type ComponentFieldType = 'text' | 'number' | 'boolean' | 'select' | 'list' | 'date';

export interface ComponentField {
    key: string;
    type: ComponentFieldType;
    defaultValue: any;
    options?: string[];
}

export interface ComponentDefinition {
    id: string;
    label: string;
    
    description?: string; 

    category: string;
    fields: ComponentField[];
    isCore?: boolean;
}

// --- THE UNIVERSAL ENTITY ---
export interface UniversalEntity {
    id: string;
    name: string;
    tags: string[]; 
    // Key = ComponentDefinition.id, Value = Data Object
    components: Record<string, Record<string, any>>; 
}

// --- POOL SYSTEM ---
export interface Pool {
    name: string;
    type: PoolCategory;
    description?: string;
    color?: string;
    
    // The Blueprint: Just a list of active component IDs and their default values.
    // NO LOCAL SCHEMA DEFINITIONS ALLOWED.
    defaultComponents: Record<string, any>; 

    entities: UniversalEntity[];
    suggestedTags?: string[];
    relationshipTypes?: string[];
}

export type WorldType = 'Rulebook';

export interface TagDefinition {
    id: string;
    label: string;
    description?: string;
    color?: string;
}

export interface World {
    id: string;
    type: WorldType;
    name: string;
    config: WorldConfig;
    tags: Record<string, TagDefinition>;
    componentRegistry: Record<string, ComponentDefinition>; 
    pools: Record<string, Pool>;
    rules: Rule[];
}

// --- DESCRIPTIVE RULES ---
export interface RuleReference {
    id: string;
    label: string;
    type: 'tag' | 'item';
}

export interface Rule {
    id: string;
    name: string;
    content: string; // Free text description
    references: RuleReference[]; // Linked entities/tags
    created: number;
}

// --- AI & GENERATION ---
export interface ReferenceItem {
    id: string;
    name: string;
    relationType: string; 
    tags: string[];
    description?: string;
}

export interface GenerationOptions {
    rarity?: string;
    attributes?: string[];       
    negativeConstraints?: string[]; 
    language?: 'English' | 'Chinese';
    strictTags?: boolean;        
    lengthInstruction?: string;  
    tagDefinitions?: string[];   
    toneInstruction?: string;     
    allowedTags?: string[];      
    contextItems?: ReferenceItem[];
    lengthPerField?: boolean;
}

export interface ToneDefinition {
    id: string;
    name: string;
    description: string;
    instruction: string;
}

export interface LengthConfig {
    short: string;
    medium: string;
    long: string;
}

export interface GlobalAppSettings {
    defaultLanguage: 'English' | 'Chinese';
    defaultOutputLength: 'Short' | 'Medium' | 'Long';
    lengthDefinitions: LengthConfig;
    tones: ToneDefinition[];
    enableImageGen: boolean;
    // The actual prefix string
    globalPromptPrefix?: string;
    // NEW: Interface Scale
    uiScale: 'Small' | 'Medium' | 'Large';
}

export interface ForgeState {
    prompt: string;
    count: number;
    targetPool: string;
    generatedItems: UniversalEntity[];
    contextItems: { item: UniversalEntity, influence: string }[];
    selectedToneId: string;
    outputLength: 'Short' | 'Medium' | 'Long';
    strictTags: boolean;
    selectedRarity: string;
    requiredAttributes: string[];
    negativeConstraints: string[];
}

export interface GenerationLogEntry {
    id: string;
    timestamp: number;
    title: string;
    prompt: string;
    response: string;
    collapsed: boolean;
}

export interface RulebookPackage {
    version: string;
    exportDate: number;
    world: World;
}

export type LogCallback = (prompt: string, response: string, tokenCount?: number) => void;