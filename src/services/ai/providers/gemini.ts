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
import { 
    cleanJsonOutput,
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

        try {
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

        // Use shared utility for system prompt
        const systemPrompt = buildBatchSystemPrompt(poolName, count, worldContext, options, !!schema);
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
            const sanitizedJson = cleanJsonOutput(rawText);

            // Use shared utility for JSON parsing
            let parsedData = parseJsonWithSalvage(sanitizedJson);

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

