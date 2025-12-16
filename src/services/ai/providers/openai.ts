/**
 * OpenAI AI Provider Implementation
 * 
 * Implements the AIProvider interface for OpenAI's API.
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
import { wrapError } from "../errors";
import { 
    parseJsonWithSalvage, 
    normalizeEntity, 
    buildBatchSystemPrompt 
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

export class OpenAIProvider implements AIProvider {
    readonly name = 'openai' as const;
    
    private client: OpenAI | null = null;
    private modelName: string;
    private apiKey: string;

    constructor(config?: Partial<AIProviderConfig>) {
        const defaults = DEFAULT_PROVIDER_CONFIGS.openai;
        
        // Try to get API key from config, then environment
        this.apiKey = config?.apiKey || 
                      process.env.OPENAI_API_KEY || 
                      '';
        
        this.modelName = config?.model || defaults.model || 'gpt-4o-mini';

        if (this.apiKey) {
            this.client = new OpenAI({ 
                apiKey: this.apiKey,
                dangerouslyAllowBrowser: true // Required for browser usage
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
            throw new Error("OpenAI API not configured. Please provide an API key.");
        }

        // Check if already aborted
        if (signal?.aborted) {
            throw new DOMException('Operation aborted', 'AbortError');
        }

        // NOTE: Rate limiting is handled by the Scheduler, not here.

        try {
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
                { signal }  // Pass AbortSignal to OpenAI SDK
            );

            const rawText = response.choices[0]?.message?.content || "{}";
            const tokens = response.usage?.total_tokens || 0;

            // Use parseJsonWithSalvage for consistent JSON handling
            return {
                data: parseJsonWithSalvage(rawText),
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
            throw new Error("OpenAI API not configured. Please provide an API key.");
        }

        // Use shared utility for system prompt
        const systemPrompt = buildBatchSystemPrompt(poolName, count, worldContext, options, !!schema);
        const openaiSchema = standardToOpenAI(schema || LEGACY_ENTITY_SCHEMA);

        // Check if already aborted
        if (signal?.aborted) {
            throw new DOMException('Operation aborted', 'AbortError');
        }

        // NOTE: Rate limiting is handled by the Scheduler, not here.

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
                { signal }  // Pass AbortSignal to OpenAI SDK
            );

            const rawText = response.choices[0]?.message?.content || "[]";
            // Use shared utility for JSON parsing
            let parsedData = parseJsonWithSalvage(rawText);

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

}

