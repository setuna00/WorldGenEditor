/**
 * Schema Builder
 * 
 * Builds Standard JSON Schema from Pool configuration.
 * The schema can then be converted to provider-specific formats.
 */

import { Pool, ComponentDefinition, ComponentField } from "../types";
import { StandardSchema, StandardSchemaType } from "./ai/types";

// Helper to map Nexus Field Types to Standard Schema Types
const mapFieldToSchema = (field: ComponentField): StandardSchema => {
    switch (field.type) {
        case 'text':
            return { type: 'string', description: field.key };
        
        case 'number':
            return { type: 'number', description: field.key };
        
        case 'boolean':
            return { type: 'boolean', description: field.key };
        
        case 'select':
            if (field.options && field.options.length > 0) {
                return { 
                    type: 'string', 
                    enum: field.options,
                    description: `Select one: ${field.options.join(', ')}`
                };
            }
            return { type: 'string' };

        case 'list':
            return { 
                type: 'array', 
                items: { type: 'string' },
                description: `List of ${field.key}`
            };

        default:
            return { type: 'string' };
    }
};

/**
 * Build a Standard JSON Schema for a pool's entities
 */
export const buildSchemaForPool = (
    pool: Pool, 
    registry: Record<string, ComponentDefinition>
): StandardSchema => {
    const componentSchemas: Record<string, StandardSchema> = {};
    const requiredComponents: string[] = [];

    // 1. Build Components
    const activeComponentIds = Object.keys(pool.defaultComponents);

    activeComponentIds.forEach(compId => {
        const def = registry[compId];
        if (!def) return;

        const fieldProperties: Record<string, StandardSchema> = {};
        const requiredFields: string[] = [];

        def.fields.forEach(field => {
            fieldProperties[field.key] = mapFieldToSchema(field);
            requiredFields.push(field.key);
        });

        // Skip empty components in schema
        if (Object.keys(fieldProperties).length > 0) {
            componentSchemas[compId] = {
                type: 'object',
                properties: fieldProperties,
                required: requiredFields,
                description: def.description ? `${def.label}: ${def.description}` : def.label 
            };
            requiredComponents.push(compId);
        }
    });

    // 2. Inject Relationship Schema (If relations exist in pool config)
    if (pool.relationshipTypes && pool.relationshipTypes.length > 0) {
        const relationProps: Record<string, StandardSchema> = {};
        pool.relationshipTypes.forEach(rel => {
            relationProps[rel] = {
                type: 'array',
                items: { type: 'string' },
                description: `List of names/IDs of entities that match relation: '${rel}'`
            };
        });

        componentSchemas['relations'] = {
            type: 'object',
            properties: relationProps,
            description: "Entity relationships to other concepts",
            nullable: true
        };
    }

    // 3. Handle empty components case
    if (Object.keys(componentSchemas).length === 0) {
        componentSchemas['_placeholder'] = { 
            type: 'string', 
            description: "Ignore", 
            nullable: true 
        };
    }

    // 4. Construct the Root Entity Schema
    const entitySchema: StandardSchema = {
        type: 'object',
        properties: {
            name: { type: 'string', description: "Name of the entity" },
            tags: { 
                type: 'array', 
                items: { type: 'string' }, 
                description: "Semantic tags (ids)" 
            },
            components: {
                type: 'object',
                properties: componentSchemas,
                required: requiredComponents 
            }
        },
        required: ["name", "tags", "components"]
    };

    return {
        type: 'array',
        items: entitySchema,
        description: `Array of ${pool.name} entities`
    };
};
