/**
 * Gemini AI Provider Implementation
 * 
 * Implements the AIProvider interface for Google's Gemini API.
 */

import { GoogleGenAI, Schema as GeminiSchema } from "@google/genai";
import { 
    AIProvider, 
    AIProviderConfig, 
    StandardSchema, 
    GenerationOptions, 
    GenerationResult,
    DEFAULT_PROVIDER_CONFIGS
} from "../types";
import { standardToGemini } from "../schemaConverter";
import { wrapError } from "../errors";

// NOTE: Rate limiting is now handled exclusively by the Scheduler.
// Providers should NOT implement their own rate limiting to avoid double-limiting.

// Legacy fallback schema for backward compatibility
const LEGACY_ENTITY_SCHEMA: StandardSchema = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            name: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            components: { 
                type: 'object', 
                description: "Map of component IDs to their data objects",
                nullable: true 
            }
        },
        required: ["name", "tags", "components"]
    }
};

export class GeminiProvider implements AIProvider {
    readonly name = 'gemini' as const;
    
    private ai: GoogleGenAI | null = null;
    private modelName: string;
    private apiKey: string;

    constructor(config?: Partial<AIProviderConfig>) {
        const defaults = DEFAULT_PROVIDER_CONFIGS.gemini;
        
        // Try to get API key from config, then environment
        this.apiKey = config?.apiKey || 
                      process.env.API_KEY || 
                      process.env.GEMINI_API_KEY || 
                      '';
        
        this.modelName = config?.model || defaults.model || 'gemini-2.5-flash';

        if (this.apiKey) {
            this.ai = new GoogleGenAI({ apiKey: this.apiKey });
        }
    }

    /**
     * Update configuration (e.g., when user changes API key)
     */
    configure(apiKey: string, model?: string): void {
        this.apiKey = apiKey;
        if (model) this.modelName = model;
        
        if (apiKey) {
            this.ai = new GoogleGenAI({ apiKey });
        } else {
            this.ai = null;
        }
    }

    isConfigured(): boolean {
        return !!this.apiKey && !!this.ai;
    }

    // ==========================================
    // STRUCTURED DATA GENERATION
    // ==========================================

    async generateStructuredData(
        systemPrompt: string,
        userPrompt: string,
        schema: StandardSchema,
        temperature: number = 0.3,
        signal?: AbortSignal
    ): Promise<GenerationResult> {
        if (!this.ai) {
            throw new Error("Gemini API not configured. Please provide an API key.");
        }

        // Check if already aborted
        if (signal?.aborted) {
            throw new DOMException('Operation aborted', 'AbortError');
        }

        // NOTE: Rate limiting is handled by the Scheduler, not here.

        const geminiSchema = standardToGemini(schema);

        // Gemini SDK doesn't natively support AbortSignal.
        // Implement "soft-cancel": race between API call and abort signal.
        // NOTE: This does NOT stop server-side computation or billing.
        // The request continues on Google's servers even after client-side abort.
        const apiPromise = this.ai.models.generateContent({
            model: this.modelName,
            contents: userPrompt,
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: 'application/json',
                responseSchema: geminiSchema,
                temperature
            }
        });

        const response = await this.raceWithAbort(apiPromise, signal);

        const rawText = response.text || "{}";
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        const cleanJson = this.cleanJsonOutput(rawText);

        return {
            data: JSON.parse(cleanJson),
            tokens,
            raw: rawText
        };
    }

    /**
     * Race a promise against an AbortSignal.
     * Used for soft-cancel when SDK doesn't support AbortSignal natively.
     * WARNING: This does NOT cancel the underlying API request - it only
     * allows the client to stop waiting. Server computation/billing continues.
     */
    private raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
        if (!signal) return promise;
        
        return new Promise<T>((resolve, reject) => {
            // Check if already aborted
            if (signal.aborted) {
                reject(new DOMException('Operation aborted', 'AbortError'));
                return;
            }

            // Handle abort event
            const onAbort = () => {
                reject(new DOMException('Operation aborted', 'AbortError'));
            };
            signal.addEventListener('abort', onAbort, { once: true });

            // Race the promise
            promise
                .then((result) => {
                    signal.removeEventListener('abort', onAbort);
                    resolve(result);
                })
                .catch((error) => {
                    signal.removeEventListener('abort', onAbort);
                    reject(error);
                });
        });
    }

    // ==========================================
    // BATCH ENTITY GENERATION
    // ==========================================

    async generateBatch(
        poolName: string,
        userPrompt: string,
        count: number,
        worldContext: string,
        options: GenerationOptions,
        schema?: StandardSchema,
        allowedComponentIds?: string[],
        temperature: number = 0.9,
        signal?: AbortSignal
    ): Promise<any[]> {
        if (!this.ai) {
            throw new Error("Gemini API not configured. Please provide an API key.");
        }

        const systemPrompt = this.buildSystemPrompt(poolName, count, worldContext, options, !!schema);
        const geminiSchema = standardToGemini(schema || LEGACY_ENTITY_SCHEMA);

        // Check if already aborted
        if (signal?.aborted) {
            throw new DOMException('Operation aborted', 'AbortError');
        }

        // NOTE: Rate limiting is handled by the Scheduler, not here.

        try {
            // Use soft-cancel for Gemini (see raceWithAbort docs)
            const apiPromise = this.ai.models.generateContent({
                model: this.modelName,
                contents: userPrompt,
                config: {
                    systemInstruction: systemPrompt,
                    responseMimeType: 'application/json',
                    responseSchema: geminiSchema,
                    temperature
                }
            });

            const response = await this.raceWithAbort(apiPromise, signal);

            const rawText = response.text || "[]";
            const sanitizedJson = this.cleanJsonOutput(rawText);

            let parsedData = this.parseJsonWithSalvage(sanitizedJson);

            if (!Array.isArray(parsedData)) {
                throw new Error("Model returned object instead of array.");
            }

            const validIds = allowedComponentIds ? new Set(allowedComponentIds) : undefined;
            return parsedData.map(item => this.normalizeEntity(item, validIds));

        } catch (error: unknown) {
            // Wrap and throw as LLMError for consistent error handling
            throw wrapError(error, { provider: this.name, model: this.modelName });
        }
    }

    // ==========================================
    // HELPER METHODS
    // ==========================================

    private cleanJsonOutput(text: string): string {
        let clean = text.trim();
        clean = clean.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/, '');
        return clean.trim();
    }

    private parseJsonWithSalvage(json: string): any {
        try {
            return JSON.parse(json);
        } catch (e) {
            console.warn("JSON Parse Failed. Attempting salvage...");
            const salvaged = this.trySalvageJson(json);
            if (salvaged) return salvaged;
            throw e;
        }
    }

    private trySalvageJson(raw: string): any[] | null {
        try {
            const lastObjectEnd = raw.lastIndexOf('},');
            if (lastObjectEnd === -1) return null;

            const realLastBrace = raw.lastIndexOf('}');
            if (realLastBrace === -1) return null;
            
            const cutString = raw.substring(0, realLastBrace + 1);
            const closedString = cutString + ']';
            
            return JSON.parse(closedString);
        } catch {
            return null;
        }
    }

    private normalizeEntity(raw: any, validComponentIds?: Set<string>): any {
        const rawComponents = raw.components || {};
        const cleanComponents: Record<string, any> = {};
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

    private buildSystemPrompt(
        poolName: string, 
        count: number, 
        worldContext: string, 
        options: GenerationOptions,
        hasSchema: boolean
    ): string {
        const schemaInstruction = hasSchema 
            ? "STRICTLY FOLLOW the provided JSON schema. Do not invent fields."
            : "Follow the standard Entity Component System structure.";

        let tagInstruction = "";
        if (options.language === 'Chinese') {
            tagInstruction = "- 'tags': Return tags as an array of strings in SIMPLIFIED CHINESE characters. Do NOT use English.\n";
            tagInstruction += "- TAG FORMAT: You SHOULD include a brief description for new tags using the format 'TagLabel|Description'.";
        } else {
            tagInstruction = "- 'tags': Normalize tags to Title Case IDs.\n";
            tagInstruction += "- TAG FORMAT: You SHOULD include a brief description for new tags using the format 'TagLabel|Description'.";
        }

        return `
            You are the 'Nexus Forge' Database Architect.
            
            WORLD CONTEXT:
            ${worldContext}
            
            TASK:
            Generate ${count} distinct Entities for the pool '${poolName}'.
            
            ${this.buildCommonPromptSections(options)}
            
            CRITICAL INSTRUCTIONS:
            - ${schemaInstruction}
            - Output RAW JSON only. No markdown formatting, no conversational text.
            ${tagInstruction}
            - Ensure all required fields are present.
        `;
    }

    private buildCommonPromptSections(options: GenerationOptions): string {
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
            NOTE: Where applicable, populate the 'relations' component with connections to other entities.
        `;
    }
}

