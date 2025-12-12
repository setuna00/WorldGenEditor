/**
 * Schema Converter
 * 
 * Converts between Standard JSON Schema and provider-specific formats.
 */

import { Type, Schema as GeminiSchema } from "@google/genai";
import { StandardSchema, StandardSchemaType } from "./types";

// ==========================================
// STANDARD → GEMINI CONVERSION
// ==========================================

const TYPE_MAP: Record<StandardSchemaType, any> = {
    'string': Type.STRING,
    'number': Type.NUMBER,
    'integer': Type.INTEGER,
    'boolean': Type.BOOLEAN,
    'array': Type.ARRAY,
    'object': Type.OBJECT,
    'null': Type.STRING // Gemini doesn't have null type, use string with nullable
};

/**
 * Convert Standard JSON Schema to Gemini Schema format
 */
export function standardToGemini(schema: StandardSchema): GeminiSchema {
    const geminiSchema: GeminiSchema = {
        type: TYPE_MAP[schema.type] || Type.STRING
    };

    if (schema.description) {
        geminiSchema.description = schema.description;
    }

    if (schema.nullable) {
        geminiSchema.nullable = true;
    }

    if (schema.enum && schema.enum.length > 0) {
        geminiSchema.enum = schema.enum;
    }

    // Handle object properties
    if (schema.type === 'object' && schema.properties) {
        geminiSchema.properties = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            geminiSchema.properties[key] = standardToGemini(propSchema);
        }
        
        if (schema.required && schema.required.length > 0) {
            geminiSchema.required = schema.required;
        }
    }

    // Handle array items
    if (schema.type === 'array' && schema.items) {
        geminiSchema.items = standardToGemini(schema.items);
    }

    return geminiSchema;
}

// ==========================================
// GEMINI → STANDARD CONVERSION (for future use)
// ==========================================

const REVERSE_TYPE_MAP: Record<number, StandardSchemaType> = {
    [Type.STRING]: 'string',
    [Type.NUMBER]: 'number',
    [Type.INTEGER]: 'integer',
    [Type.BOOLEAN]: 'boolean',
    [Type.ARRAY]: 'array',
    [Type.OBJECT]: 'object',
};

/**
 * Convert Gemini Schema to Standard JSON Schema format
 */
export function geminiToStandard(geminiSchema: GeminiSchema): StandardSchema {
    const standardSchema: StandardSchema = {
        type: REVERSE_TYPE_MAP[geminiSchema.type as number] || 'string'
    };

    if (geminiSchema.description) {
        standardSchema.description = geminiSchema.description;
    }

    if (geminiSchema.nullable) {
        standardSchema.nullable = true;
    }

    if (geminiSchema.enum && geminiSchema.enum.length > 0) {
        standardSchema.enum = geminiSchema.enum as string[];
    }

    // Handle object properties
    if (geminiSchema.properties) {
        standardSchema.properties = {};
        for (const [key, propSchema] of Object.entries(geminiSchema.properties)) {
            standardSchema.properties[key] = geminiToStandard(propSchema as GeminiSchema);
        }
        
        if (geminiSchema.required) {
            standardSchema.required = geminiSchema.required as string[];
        }
    }

    // Handle array items
    if (geminiSchema.items) {
        standardSchema.items = geminiToStandard(geminiSchema.items as GeminiSchema);
    }

    return standardSchema;
}

// ==========================================
// STANDARD → OPENAI CONVERSION (for future use)
// ==========================================

/**
 * Convert Standard JSON Schema to OpenAI JSON Schema format
 * OpenAI uses standard JSON Schema, so this is mostly a pass-through
 */
export function standardToOpenAI(schema: StandardSchema): object {
    const openaiSchema: any = {
        type: schema.type
    };

    if (schema.description) {
        openaiSchema.description = schema.description;
    }

    if (schema.enum && schema.enum.length > 0) {
        openaiSchema.enum = schema.enum;
    }

    // Handle object properties
    if (schema.type === 'object' && schema.properties) {
        openaiSchema.properties = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            openaiSchema.properties[key] = standardToOpenAI(propSchema);
        }
        
        if (schema.required && schema.required.length > 0) {
            openaiSchema.required = schema.required;
        }
        
        // OpenAI requires additionalProperties: false for strict mode
        openaiSchema.additionalProperties = false;
    }

    // Handle array items
    if (schema.type === 'array' && schema.items) {
        openaiSchema.items = standardToOpenAI(schema.items);
    }

    return openaiSchema;
}

