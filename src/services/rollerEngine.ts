// src/services/rollerEngine.ts
import { Rule, UniversalEntity } from '../types';
import { EntityUtils } from '../utils/entityUtils';

// --- TYPES ---

export interface RollCandidate {
    id: string;
    name: string;
    tags: string[];
    rarity: string; 
    original: UniversalEntity; // Access to full component data
}

export type ConstraintOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'missing' | 'truthy';

export interface RollConstraint {
    path: string; // e.g. "components.stats.values.cost"
    operator: ConstraintOperator;
    value?: any;
}

interface ActiveEffects {
    bans: { global: boolean; tags: Set<string>; items: Set<string> };
    boosts: { tags: Map<string, number>; items: Map<string, number> };
    forcedRarity: { tags: Map<string, string>; items: Map<string, string> };
}

// --- UTILS ---

/**
 * Safely resolves a dot-notation path on an entity.
 * e.g. "components.stats.values.gold" -> 50
 */
const resolvePath = (obj: any, path: string): any => {
    if (!path || !obj) return undefined;
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined) ? acc[part] : undefined, obj);
};

const checkConstraint = (entity: UniversalEntity, constraint: RollConstraint): boolean => {
    const val = resolvePath(entity, constraint.path);
    const target = constraint.value;

    switch (constraint.operator) {
        case 'eq': return val == target; // Loose equality allowed for "50" vs 50
        case 'neq': return val != target;
        case 'gt': return Number(val) > Number(target);
        case 'gte': return Number(val) >= Number(target);
        case 'lt': return Number(val) < Number(target);
        case 'lte': return Number(val) <= Number(target);
        case 'contains': 
            if (Array.isArray(val)) return val.includes(target);
            if (typeof val === 'string') return val.toLowerCase().includes(String(target).toLowerCase());
            return false;
        case 'missing':
             if (Array.isArray(val)) return !val.includes(target);
             return !val; // Checks undefined/null/false
        case 'truthy': return !!val;
        default: return false;
    }
};

// --- ENGINE ---

export const RollerEngine = {
    // 1. Compile Rules (Legacy Support - Disabled)
    // The Rules System is now descriptive only and does not influence probability.
    compileRules: (rules: Rule[], contextTags: Set<string>, poolName: string) => {
        const activeEffects: ActiveEffects = {
            bans: { global: false, tags: new Set(), items: new Set() },
            boosts: { tags: new Map(), items: new Map() },
            forcedRarity: { tags: new Map(), items: new Map() }
        };
        return { activeRules: [], activeEffects };
    },

    // 2. The Roll Algorithm (Standard Weight Only)
    roll: (
        candidates: RollCandidate[], 
        activeEffects: ActiveEffects, 
        runtimeConstraints: RollConstraint[] = []
    ): { result: UniversalEntity | null, log: string[] } => {
        const log: string[] = [];
        
        // Note: activeEffects are currently always empty as rules are descriptive
        
        const weightedCandidates: { item: UniversalEntity, weight: number }[] = [];
        let totalWeight = 0;
        let rejectedCount = 0;

        for (const candidate of candidates) {
            const original = candidate.original;

            // 2A. Hard Constraints (Logic Filters)
            // "Cost < 50", "Has Icon", etc.
            let failsConstraint = false;
            for (const constraint of runtimeConstraints) {
                if (!checkConstraint(original, constraint)) {
                    failsConstraint = true;
                    break;
                }
            }
            if (failsConstraint) {
                rejectedCount++;
                continue;
            }

            // 2C. Weight Calculation
            let baseWeight = 10; 
            const finalRarity = candidate.rarity;
            
            switch (finalRarity) {
                case 'Common': baseWeight = 50; break;
                case 'Uncommon': baseWeight = 30; break;
                case 'Rare': baseWeight = 15; break;
                case 'Epic': baseWeight = 4; break;
                case 'Legendary': baseWeight = 1; break;
            }

            // Apply multiplier from effects (currently 1.0)
            const finalWeight = baseWeight * 1.0;
            weightedCandidates.push({ item: original, weight: finalWeight });
            totalWeight += finalWeight;
        }

        if (weightedCandidates.length === 0) {
            const msg = rejectedCount > 0 
                ? `All ${candidates.length} candidates were filtered out (${rejectedCount} by constraints).`
                : 'Pool is empty.';
            return { result: null, log: [...log, msg] };
        }

        // 3. Selection (Weighted Random)
        let random = Math.random() * totalWeight;
        let selected = weightedCandidates[weightedCandidates.length - 1].item;

        for (const entry of weightedCandidates) {
            random -= entry.weight;
            if (random <= 0) {
                selected = entry.item;
                break;
            }
        }

        log.push(`Rolled from ${weightedCandidates.length} valid candidates (Filtered ${rejectedCount}).`);
        log.push(`Winner: ${selected.name} (${EntityUtils.getRarity(selected)})`);
        if (runtimeConstraints.length > 0) {
            log.push(`Constraints Applied: ${runtimeConstraints.length}`);
        }
        
        return { result: selected, log };
    }
};