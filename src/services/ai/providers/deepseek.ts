/**
 * DeepSeek AI Provider Implementation
 * 
 * Implements the AIProvider interface for DeepSeek's API.
 * DeepSeek API is OpenAI-compatible, so we use the OpenAI SDK with a custom baseURL.
 */

import OpenAI from "openai";
import { 
    AIProvider, 
    AIProviderConfig, 
    StandardSchema, 
    GenerationOptions, 
    GenerationResult,
    DEFAULT_PROVIDER_CONFIGS
} from "../types";
import { standardToOpenAI } from "../schemaConverter";
import { getRateLimiter, RateLimiter } from "../rateLimiter";
import { wrapError } from "../errors";

// DeepSeek API base URL
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

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

export class DeepSeekProvider implements AIProvider {
    readonly name = 'deepseek' as const;
    
    private client: OpenAI | null = null;
    private modelName: string;
    private rateLimiter: RateLimiter;
    private apiKey: string;

    constructor(config?: Partial<AIProviderConfig>) {
        const defaults = DEFAULT_PROVIDER_CONFIGS.deepseek;
        
        // Try to get API key from config, then environment
        this.apiKey = config?.apiKey || 
                      process.env.DEEPSEEK_API_KEY || 
                      '';
        
        this.modelName = config?.model || defaults.model || 'deepseek-chat';
        
        const rateConfig = config?.rateLimit || defaults.rateLimit!;
        this.rateLimiter = getRateLimiter('DeepSeek', {
            maxRequests: rateConfig.maxRequests,
            windowMs: rateConfig.windowMs
        });

        if (this.apiKey) {
            this.client = new OpenAI({ 
                apiKey: this.apiKey,
                baseURL: DEEPSEEK_BASE_URL,
                dangerouslyAllowBrowser: true
            });
        }
    }

    /**
     * Update configuration (e.g., when user changes API key)
     */
    configure(apiKey: string, model?: string): void {
        this.apiKey = apiKey;
        if (model) this.modelName = model;
        
        if (apiKey) {
            this.client = new OpenAI({ 
                apiKey,
                baseURL: DEEPSEEK_BASE_URL,
                dangerouslyAllowBrowser: true
            });
        } else {
            this.client = null;
        }
    }

    isConfigured(): boolean {
        return !!this.apiKey && !!this.client;
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
        if (!this.client) {
            throw new Error("DeepSeek API not configured. Please provide an API key.");
        }

        // Check if already aborted before waiting for rate limit
        if (signal?.aborted) {
            throw new DOMException('Operation aborted', 'AbortError');
        }

        await this.rateLimiter.enforce();

        // Check again after rate limit wait
        if (signal?.aborted) {
            throw new DOMException('Operation aborted', 'AbortError');
        }

        const openaiSchema = standardToOpenAI(schema);

        const response = await this.client.chat.completions.create(
            {
                model: this.modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'structured_response',
                        strict: true,
                        schema: openaiSchema
                    }
                },
                temperature
            },
            { signal }  // Pass AbortSignal to SDK
        );

        const rawText = response.choices[0]?.message?.content || "{}";
        const tokens = response.usage?.total_tokens || 0;

        return {
            data: JSON.parse(rawText),
            tokens,
            raw: rawText
        };
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
        if (!this.client) {
            throw new Error("DeepSeek API not configured. Please provide an API key.");
        }

        const systemPrompt = this.buildSystemPrompt(poolName, count, worldContext, options, !!schema);
        const openaiSchema = standardToOpenAI(schema || LEGACY_ENTITY_SCHEMA);

        // Check for abort before waiting for rate limit
        if (signal?.aborted) {
            throw new DOMException('Operation aborted', 'AbortError');
        }

        await this.rateLimiter.enforce();

        // Check again after rate limit wait
        if (signal?.aborted) {
            throw new DOMException('Operation aborted', 'AbortError');
        }

        try {
            const response = await this.client.chat.completions.create(
                {
                    model: this.modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    response_format: {
                        type: 'json_schema',
                        json_schema: {
                            name: 'entity_batch',
                            strict: true,
                            schema: openaiSchema
                        }
                    },
                    temperature
                },
                { signal }  // Pass AbortSignal to SDK
            );

            const rawText = response.choices[0]?.message?.content || "[]";
            let parsedData = this.parseJsonWithSalvage(rawText);

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
