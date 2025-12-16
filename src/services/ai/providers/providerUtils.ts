/**
 * Provider Utilities - Shared functionality for all AI providers
 * 
 * Contains common logic for JSON parsing, entity normalization, and prompt building.
 * This reduces code duplication across provider implementations.
 */

import { GenerationOptions } from "../types";

// ==========================================
// JSON PARSING UTILITIES
// ==========================================

/**
 * Clean JSON output by removing markdown code blocks
 */
export function cleanJsonOutput(text: string): string {
    let clean = text.trim();
    // Remove markdown code blocks if present
    clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    return clean.trim();
}

/**
 * Parse JSON with fallback salvage attempt for truncated responses.
 * Tries to recover partial arrays by closing the JSON structure.
 * 
 * @param json - Raw JSON string
 * @returns Parsed JSON data
 * @throws Error if parsing fails and salvage is not possible
 */
export function parseJsonWithSalvage(json: string): any {
    try {
        return JSON.parse(json);
    } catch (e) {
        console.warn("[ProviderUtils] JSON Parse Failed. Attempting salvage...");
        const salvaged = trySalvageJson(json);
        if (salvaged) return salvaged;
        throw e;
    }
}

/**
 * Attempt to salvage a truncated JSON array.
 * Finds the last complete object and closes the array.
 */
export function trySalvageJson(raw: string): any[] | null {
    try {
        // Try to find the last complete object in an array
        const lastObjectEnd = raw.lastIndexOf('},');
        if (lastObjectEnd === -1) {
            // Maybe it's just missing the closing bracket
            const trimmed = raw.trim();
            if (trimmed.startsWith('[') && !trimmed.endsWith(']')) {
                const lastBrace = trimmed.lastIndexOf('}');
                if (lastBrace > 0) {
                    return JSON.parse(trimmed.substring(0, lastBrace + 1) + ']');
                }
            }
            return null;
        }

        const realLastBrace = raw.lastIndexOf('}');
        if (realLastBrace === -1) return null;
        
        const cutString = raw.substring(0, realLastBrace + 1);
        const closedString = cutString + ']';
        
        return JSON.parse(closedString);
    } catch {
        return null;
    }
}

// ==========================================
// ENTITY NORMALIZATION
// ==========================================

/**
 * Normalize a raw entity from LLM output to standard format.
 * Handles missing fields, component filtering, and metadata generation.
 * 
 * @param raw - Raw entity object from LLM
 * @param validComponentIds - Set of allowed component IDs (optional filter)
 * @returns Normalized entity with ID and metadata
 */
export function normalizeEntity(raw: any, validComponentIds?: Set<string>): any {
    const rawComponents = raw.components || {};
    const cleanComponents: Record<string, any> = {};
    
    // Components that are always allowed regardless of filter
    const SAFE_COMPONENTS = ['metadata', 'lore', 'rarity', 'relations'];

    Object.keys(rawComponents).forEach(key => {
        if (validComponentIds) {
            if (validComponentIds.has(key) || SAFE_COMPONENTS.includes(key)) {
                cleanComponents[key] = rawComponents[key];
            }
        } else {
            cleanComponents[key] = rawComponents[key];
        }
    });

    return {
        id: crypto.randomUUID(),
        name: raw.name || "Unnamed Entity",
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        components: {
            ...cleanComponents,
            metadata: {
                id: crypto.randomUUID(),
                created: Date.now(),
                rarity: rawComponents.rarity?.value || 'Common',
                ...(cleanComponents.metadata || {})
            }
        }
    };
}

// ==========================================
// PROMPT BUILDING
// ==========================================

/**
 * Build common prompt sections shared across all providers.
 * Includes tone, language, tags, length constraints, etc.
 */
export function buildCommonPromptSections(options: GenerationOptions): string {
    const toneLine = options.toneInstruction 
        ? `WRITING STYLE: ${options.toneInstruction}` 
        : `WRITING STYLE: Standard RPG description.`;

    const langInstruction = options.language === 'Chinese' 
        ? 'OUTPUT LANGUAGE: Chinese (Simplified). Names, Descriptions, and Tags must be in Chinese.'
        : 'OUTPUT LANGUAGE: English.';

    const lengthInstruction = options.lengthInstruction
        ? `LENGTH CONSTRAINT: ${options.lengthInstruction} ${options.lengthPerField ? '(Apply to EACH field)' : '(Total budget)'}`
        : '';

    let tagSection = '';
    if (options.allowedTags && options.allowedTags.length > 0) {
        const tagList = options.allowedTags.join(', ');
        tagSection = options.strictTags 
            ? `TAGS: STRICTLY use ONLY these tags: [${tagList}].`
            : `TAGS: Select from: [${tagList}]. You may invent others if necessary.`;
    } else {
        tagSection = `TAGS: Assign relevant semantic tags.`;
    }

    let refSection = '';
    if (options.contextItems && options.contextItems.length > 0) {
        refSection = `RELATIONSHIPS: ${options.contextItems.map(r => `Must match "${r.name}" (${r.relationType})`).join(', ')}`;
    }

    return `
${toneLine}
${lengthInstruction}
${options.rarity && options.rarity !== 'Any' ? `- Rarity: ${options.rarity}` : ''}
${options.attributes?.length ? `- Concepts: ${options.attributes.join(', ')}` : ''}
${options.negativeConstraints?.length ? `- Avoid: ${options.negativeConstraints.join(', ')}` : ''}
${tagSection}
${refSection}
${options.tagDefinitions?.length ? `GLOSSARY:\n${options.tagDefinitions.join('\n')}` : ''}
${langInstruction}
NOTE: Where applicable, populate the 'relations' component with connections to other entities.`;
}

/**
 * Get tag instruction based on language option
 */
export function getTagInstruction(language?: 'English' | 'Chinese'): string {
    if (language === 'Chinese') {
        return "- 'tags': Return tags as an array of strings in SIMPLIFIED CHINESE characters. Do NOT use English.\n" +
               "- TAG FORMAT: You SHOULD include a brief description for new tags using the format 'TagLabel|Description'.";
    }
    return "- 'tags': Normalize tags to Title Case IDs.\n" +
           "- TAG FORMAT: You SHOULD include a brief description for new tags using the format 'TagLabel|Description'.";
}

/**
 * Build the batch generation system prompt.
 */
export function buildBatchSystemPrompt(
    poolName: string, 
    count: number, 
    worldContext: string, 
    options: GenerationOptions,
    hasSchema: boolean
): string {
    const schemaInstruction = hasSchema 
        ? "STRICTLY FOLLOW the provided JSON schema. Do not invent fields."
        : "Follow the standard Entity Component System structure.";

    const tagInstruction = getTagInstruction(options.language);

    return `
You are the 'Nexus Forge' Database Architect.

WORLD CONTEXT:
${worldContext}

TASK:
Generate ${count} distinct Entities for the pool '${poolName}'.

${buildCommonPromptSections(options)}

CRITICAL INSTRUCTIONS:
- ${schemaInstruction}
- Output RAW JSON only. No markdown formatting, no conversational text.
${tagInstruction}
- Ensure all required fields are present.`;
}
