/**
 * Claude AI Provider Implementation
 * 
 * Implements the AIProvider interface for Anthropic's Claude API.
 * 
 * Claude's structured output mechanism differs from OpenAI/Gemini:
 * - Uses prompt-based JSON guidance instead of json_schema
 * - Schema is described in the system prompt
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
import { 
    cleanJsonOutput,
    parseJsonWithSalvage, 
    normalizeEntity, 
    buildCommonPromptSections,
    getTagInstruction
} from "./providerUtils";

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

        try {
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

            const cleanedJson = cleanJsonOutput(rawText);

            return {
                data: parseJsonWithSalvage(cleanedJson),
                tokens,
                raw: rawText
            };
        } catch (error: unknown) {
            // Wrap and throw as LLMError for consistent error handling
            throw wrapError(error, { provider: this.name, model: this.modelName });
        }
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
        const systemPrompt = this.buildBatchSystemPrompt(poolName, count, worldContext, options, effectiveSchema);

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
            const cleanedJson = cleanJsonOutput(rawText);
            
            // Use shared utility for JSON parsing
            let parsedData = parseJsonWithSalvage(cleanedJson);

            if (!Array.isArray(parsedData)) {
                throw new Error("Model returned object instead of array.");
            }

            // Use shared utility for entity normalization
            const validIds = allowedComponentIds ? new Set(allowedComponentIds) : undefined;
            return parsedData.map(item => normalizeEntity(item, validIds));

        } catch (error: unknown) {
            // Wrap and throw as LLMError for consistent error handling
            throw wrapError(error, { provider: this.name, model: this.modelName });
        }
    }

    // ==========================================
    // CLAUDE-SPECIFIC HELPERS
    // ==========================================

    /**
     * Convert StandardSchema to a human-readable description for Claude.
     * Since Claude doesn't support json_schema like OpenAI, we describe it in text.
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

    /**
     * Build the batch generation system prompt for Claude.
     * Claude requires schema description in the prompt since it doesn't support json_schema.
     */
    private buildBatchSystemPrompt(
        poolName: string, 
        count: number, 
        worldContext: string, 
        options: GenerationOptions,
        schema: StandardSchema
    ): string {
        const schemaDescription = this.schemaToDescription(schema);
        const tagInstruction = getTagInstruction(options.language);

        return `You are the 'Nexus Forge' Database Architect.
            
WORLD CONTEXT:
${worldContext}

TASK:
Generate ${count} distinct Entities for the pool '${poolName}'.

${buildCommonPromptSections(options)}

OUTPUT SCHEMA (STRICTLY FOLLOW):
${schemaDescription}

CRITICAL INSTRUCTIONS:
- STRICTLY FOLLOW the provided JSON schema. Do not invent fields.
- Output RAW JSON only. No markdown formatting, no conversational text.
${tagInstruction}
- Ensure all required fields are present.
- Return a JSON array of entities.`;
    }
}
