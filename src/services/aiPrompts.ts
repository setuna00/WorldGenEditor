import { Schema, Type } from "@google/genai";

const injectTone = (system: string, tone?: string) => {
    if (!tone) return system;
    return `${system}\n\nNARRATIVE TONE/STYLE GUIDELINES:\n${tone}`;
}

const JSON_ONLY_INSTRUCTION = `CRITICAL FORMATTING INSTRUCTION:
- You MUST return ONLY a single JSON object matching the expected schema.
- Do NOT include any explanation, markdown, code blocks (like \`\`\`json), or prose outside the JSON.
- The output must be valid, parseable JSON.
`;

export const AIPrompts = {
    // --- IDEATION PHASE ---
    
    ideation: (language: string, storyText: string, tone?: string) => ({
        system: injectTone(`You are a creative writing assistant. Your task is to brainstorm titles and genres based on user input. Language: ${language}.`, tone),
        user: `
        Story Context: "${storyText.substring(0, 3000)}"
        
        Generate 5 creative Titles.
        Generate 5 RICH, DETAILED Genre descriptions.

        STYLE CONSTRAINTS:
        - Use vivid, sophisticated language with varied sentence lengths.
        - Avoid generic phrases and clichés ("gritty underbelly", "dark secrets", "technology has advanced").
        - Each genre description should feel like a miniature mood piece, not a tag.
        
        CRITICAL CONSTRAINTS: 
        1. The "genres" must NOT be single words like "Sci-Fi". 
        2. They MUST be evocative paragraphs (2-3 sentences) describing the flavor, atmosphere, and tech level.
        3. DO NOT start descriptions with "This genre is", "A setting involving", or meta-commentary. Write directly about the world (e.g., "Neon-soaked streets reflect the chrome sky...").
        4. OUTPUT LANGUAGE: ${language}. All titles and descriptions MUST be in ${language}.
      `
    }),

    // --- ANALYSIS PHASE ---

    analysis: (language: string, storyText: string, tone?: string) => ({
        system: injectTone(`You are a Senior Data Architect. Analyze the story and determine the best DATABASE STRUCTURE. Language: ${language}.`, tone),
        user: `
        1. Summarize the core themes (genreSummary).
        2. Suggest specific Data Pools (Categories) to organize this world (e.g. "Factions", "Artifacts").
        
        CRITICAL INSTRUCTION:
        - Use ATOMIC CATEGORIES. Split concepts (e.g. "Weapons", "Armor", not "Gear").
        - ENSURE BALANCE: Unless the story is extremely specific, you MUST suggest at least one pool for EACH category: 'World' (Lore/Locations), 'Character' (People/Creatures), and 'Asset' (Items/Tech). Do not ignore the World or Character categories.
        - OUTPUT LANGUAGE: ${language}. The 'summary' and 'categoryName' must be in ${language}.
        
        3. For backward compatibility, also sort these into world/character/asset arrays.

        Story: "${storyText.substring(0, 3000)}"

        ${JSON_ONLY_INSTRUCTION}
      `
    }),

    // --- ARCHITECTURE PHASE ---

    blueprint: (title: string, genre: string, language: string, activePools: any[], storyText: string, tone?: string) => ({
        system: injectTone("You are a World Building Architect. Create a final Blueprint JSON.", tone),
        user: `
        Title: ${title}
        Genre: ${genre}
        Language: ${language}

        ORIGINAL USER STORY:
        "${storyText.substring(0, 3000)}"

        TASK:
        1. Synthesize the user's original story into a comprehensive "World Introduction" (description). 
           - Write 3–6 substantial paragraphs.
           - Use layered, sophisticated prose: mix history, present tensions, everyday details, and hints of future conflict.
           - Avoid plot summary; focus on mood, social structures, and what it *feels* like to live there.
        2. Map the selected categories to the internal types: "World", "Character", or "Asset".
        
        CRITICAL LOCALIZATION INSTRUCTION:
        The 'description' field MUST be written in ${language}.
        IF LANGUAGE IS CHINESE (Simplified Chinese), you MUST use Chinese characters for the description. Do NOT use English.
        
        Selected Categories to Map: ${JSON.stringify(activePools)}

        ${JSON_ONLY_INSTRUCTION}
      `
    }),

    // --- BUILD PHASE ---

    componentDesign: (poolName: string, language: string) => ({
        system: "You are a Database Engineer.",
        user: `
        Design a unique Data Component for '${poolName}' entities. (e.g. if 'Vehicles', create 'vehicle_stats' with speed/armor). 
        Return a ComponentDefinition.

        CRITICAL REQUIREMENT 1 (FIELDS):
        - Include at least one 'description' field or equivalent (e.g., 'biography', 'history', 'visual_appearance') within this component to hold the main narrative text for this entity type.
        - Add 3-5 other relevant fields (stats, traits, etc.).
        - DO NOT create a 'rarity' field. That is a system field.

        CRITICAL REQUIREMENT 2 (RELATIONSHIPS):
        - Suggest 3-5 distinct "Relationship Verbs" relevant to this pool. 
        - For 'Factions', use verbs like "Allied With", "War With", "Trading With".
        - For 'Items', use "Owned By", "Forged By", "Stolen From".
        - Do NOT use generic "Related To". Be specific.

        LANGUAGE INSTRUCTION:
        The 'language' is: ${language}.
        
        IF LANGUAGE IS CHINESE:
        - The 'label' and 'description' MUST be in Simplified Chinese.
        - The field 'key' MUST remain in English snake_case (e.g., 'attack_power') to ensure code compatibility. Do NOT use Chinese for keys.
        - The 'suggestedRelationshipVerbs' MUST be in Chinese.

        IF LANGUAGE IS ENGLISH:
        - Use Title Case for labels (e.g. "Attack Power").
        - Use snake_case for IDs.

        ${JSON_ONLY_INSTRUCTION}
        `
    }),

    /**
     * UPDATED: Now accepts relationshipTypes
     */
    seedContent: (
        poolName: string, 
        poolType: "World" | "Character" | "Asset",
        language: string, 
        storyText: string, 
        complexity: 'Standard' | 'Deep Lore',
        fieldContext: string,
        relationshipTypes: string[],
        tone?: string
    ) => {
        const complexityInstruction = complexity === 'Deep Lore' 
            ? [
                "Generate DEEP LORE.",
                "For each entity, write 2–4 rich paragraphs in the main description-like field.",
                "Weave in history, secrets, sensory details, social context, and hidden motives.",
                "All entities should feel like they could exist in the same broader world or setting.",
                "Vary the connections: sometimes they are independent, sometimes deeply linked."
              ].join(' ') 
            : [
                "Generate robust, game-ready descriptions.",
                "For each entity, write at least one full, sophisticated paragraph in the main description-like field.",
                "Avoid one-line or generic text; include concrete details, flavor, and at least one story hook."
              ].join(' ');
        
        const relInstruction = relationshipTypes.length > 0 
            ? [
                  `USE THESE RELATIONSHIP VERBS WHEN IT MAKES SENSE: ${relationshipTypes.join(', ')}.`,
                  "It is OPTIONAL to give an entity relationships.",
                  "Only add relationships that feel natural and interesting; some entities can have none."
              ].join(' ')
            : [
                  "You MAY define relationships between entities or to concepts in the story, but this is OPTIONAL.",
                  "Only add relationships that feel natural and interesting; some entities can have none."
              ].join(' ');

        return {
            system: injectTone(`You are a creative writer. Generate 3 initial entities for the '${poolName}' pool (Type: ${poolType}). Language: ${language}.`, tone),
            user: `
            Story Context: "${storyText.substring(0, 3000)}".
            
            POOL CONTEXT (${poolType}):
            ${poolType === 'World' ? '- Focus on Lore, Geography, and History.' : ''}
            ${poolType === 'Character' ? '- Focus on Personality, Motives, and Background.' : ''}
            ${poolType === 'Asset' ? '- Focus on Utility, Value, and Mechanics.' : ''}

            DATA FIELD DEFINITIONS:
            ${fieldContext}
            
            COMPLEXITY GUIDELINES:
            ${complexityInstruction}

            RELATIONSHIP LOGIC:
            ${relInstruction}

            CRITICAL DATA INSTRUCTION:
            - For any field defined with specific 'options' (select/enum), you MUST choose ONE exact string from that provided list. Do not leave it empty.
            - Fill all fields based on the definitions above.
            
            LANGUAGE ENFORCEMENT:
            - All Name, Description, and String values MUST be in ${language}.

            ${JSON_ONLY_INSTRUCTION}
            `
        };
    },
};