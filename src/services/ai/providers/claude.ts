/**
 * Claude AI Provider Implementation
 * 
 * Implements the AIProvider interface for Anthropic's Claude API.
 * 
 * NOTE: This provider is currently EXPERIMENTAL and not enabled in the app.
 * Claude's structured output mechanism differs from OpenAI/Gemini:
 * - Uses tool_use or JSON mode instead of json_schema
 * - May require additional schema adaptation
 */

import Anthropic from "@anthropic-ai/sdk";
import { 
    AIProvider, 
    AIProviderConfig, 
    StandardSchema, 
    GenerationOptions, 
    GenerationResult,
    DEFAULT_PROVIDER_CONFIGS
} from "../types";
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

export class ClaudeProvider implements AIProvider {
    readonly name = 'claude' as const;
    
    private client: Anthropic | null = null;
    private modelName: string;
    private apiKey: string;

    constructor(config?: Partial<AIProviderConfig>) {
        const defaults = DEFAULT_PROVIDER_CONFIGS.claude;
        
        // Try to get API key from config, then environment
        this.apiKey = config?.apiKey || 
                      process.env.ANTHROPIC_API_KEY || 
                      '';
        
        this.modelName = config?.model || defaults.model || 'claude-sonnet-4-5';

        if (this.apiKey) {
            this.client = new Anthropic({ 
                apiKey: this.apiKey,
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
            this.client = new Anthropic({ 
                apiKey,
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
            throw new Error("Claude API not configured. Please provide an API key.");
        }

        // Check if already aborted
        if (signal?.aborted) {
            throw new DOMException('Operation aborted', 'AbortError');
        }

        // NOTE: Rate limiting is handled by the Scheduler, not here.

        // Claude uses a different approach for structured output
        // We include the schema in the prompt and request JSON output
        const schemaDescription = this.schemaToDescription(schema);
        const enhancedSystemPrompt = `${systemPrompt}

You MUST respond with valid JSON that matches this schema:
${schemaDescription}

IMPORTANT: Output ONLY the JSON, no markdown formatting, no explanations.`;

        const response = await this.client.messages.create(
            {
                model: this.modelName,
                max_tokens: 8192,
                system: enhancedSystemPrompt,
                messages: [
                    { role: 'user', content: userPrompt }
                ],
                temperature
            },
            { signal }  // Pass AbortSignal to Anthropic SDK
        );

        // Extract text from response
        const textContent = response.content.find(c => c.type === 'text');
        const rawText = textContent?.type === 'text' ? textContent.text : "{}";
        const tokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

        const cleanJson = this.cleanJsonOutput(rawText);

        return {
            data: JSON.parse(cleanJson),
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
            throw new Error("Claude API not configured. Please provide an API key.");
        }

        const effectiveSchema = schema || LEGACY_ENTITY_SCHEMA;
        const systemPrompt = this.buildSystemPrompt(poolName, count, worldContext, options, effectiveSchema);

        // Check if already aborted
        if (signal?.aborted) {
            throw new DOMException('Operation aborted', 'AbortError');
        }

        // NOTE: Rate limiting is handled by the Scheduler, not here.

        try {
            const response = await this.client.messages.create(
                {
                    model: this.modelName,
                    max_tokens: 16384,
                    system: systemPrompt,
                    messages: [
                        { role: 'user', content: userPrompt }
                    ],
                    temperature
                },
                { signal }  // Pass AbortSignal to Anthropic SDK
            );

            // Extract text from response
            const textContent = response.content.find(c => c.type === 'text');
            const rawText = textContent?.type === 'text' ? textContent.text : "[]";
            const cleanJson = this.cleanJsonOutput(rawText);
            let parsedData = this.parseJsonWithSalvage(cleanJson);

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

    /**
     * Convert StandardSchema to a human-readable description for Claude
     * Since Claude doesn't support json_schema like OpenAI, we describe it in text
     */
    private schemaToDescription(schema: StandardSchema, indent: string = ''): string {
        let desc = '';
        
        if (schema.type === 'object' && schema.properties) {
            desc += '{\n';
            const props = Object.entries(schema.properties);
            for (const [key, propSchema] of props) {
                const required = schema.required?.includes(key) ? ' (required)' : ' (optional)';
                desc += `${indent}  "${key}"${required}: ${this.schemaToDescription(propSchema, indent + '  ')}\n`;
            }
            desc += `${indent}}`;
        } else if (schema.type === 'array' && schema.items) {
            desc += `Array of ${this.schemaToDescription(schema.items, indent)}`;
        } else if (schema.enum) {
            desc += `one of [${schema.enum.join(', ')}]`;
        } else {
            desc += schema.type;
            if (schema.description) {
                desc += ` // ${schema.description}`;
            }
        }
        
        return desc;
    }

    private cleanJsonOutput(text: string): string {
        let clean = text.trim();
        // Remove markdown code blocks if present
        clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
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
        schema: StandardSchema
    ): string {
        const schemaDescription = this.schemaToDescription(schema);
        
        let tagInstruction = "";
        if (options.language === 'Chinese') {
            tagInstruction = "- 'tags': Return tags as an array of strings in SIMPLIFIED CHINESE characters. Do NOT use English.\n";
            tagInstruction += "- TAG FORMAT: You SHOULD include a brief description for new tags using the format 'TagLabel|Description'.";
        } else {
            tagInstruction = "- 'tags': Normalize tags to Title Case IDs.\n";
            tagInstruction += "- TAG FORMAT: You SHOULD include a brief description for new tags using the format 'TagLabel|Description'.";
        }

        return `You are the 'Nexus Forge' Database Architect.
            
WORLD CONTEXT:
${worldContext}

TASK:
Generate ${count} distinct Entities for the pool '${poolName}'.

${this.buildCommonPromptSections(options)}

OUTPUT SCHEMA (STRICTLY FOLLOW):
${schemaDescription}

CRITICAL INSTRUCTIONS:
- STRICTLY FOLLOW the provided JSON schema. Do not invent fields.
- Output RAW JSON only. No markdown formatting, no conversational text.
${tagInstruction}
- Ensure all required fields are present.
- Return a JSON array of entities.`;
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
NOTE: Where applicable, populate the 'relations' component with connections to other entities.`;
    }
}
