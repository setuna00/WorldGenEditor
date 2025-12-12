/**
 * Centralized color constants for the Nexus application.
 * This file provides a single source of truth for all color values used across the UI.
 */

// Pool type colors - used for categorizing different pool types
export const TYPE_COLORS: Record<string, string> = {
    'World': '#8b5cf6',      // Purple - for world lore pools
    'Character': '#f43f5e',  // Rose - for character pools
    'Asset': '#10b981',      // Emerald - for asset/item pools
    'Default': '#64748b'     // Slate - fallback color
} as const;

// Predefined pool colors for user selection
export const POOL_COLORS = [
    '#ef4444', // Red
    '#f97316', // Orange
    '#f59e0b', // Amber
    '#84cc16', // Lime
    '#10b981', // Emerald
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#6366f1', // Indigo
    '#8b5cf6', // Violet
    '#d946ef', // Fuchsia
    '#f43f5e', // Rose
    '#64748b'  // Slate
] as const;

// Rarity tier colors - used for item rarity displays
export const RARITY_COLORS: Record<string, string> = {
    'Common': '#9ca3af',     // Gray
    'Uncommon': '#22c55e',   // Green
    'Rare': '#3b82f6',       // Blue
    'Epic': '#8b5cf6',       // Purple
    'Legendary': '#f97316',  // Orange
    'Mythic': '#ef4444'      // Red
} as const;

// Status colors - for various UI states
export const STATUS_COLORS = {
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
} as const;

// Helper function to get pool color with fallback
export const getPoolColor = (poolColor?: string, poolType?: string): string => {
    if (poolColor && poolColor !== '#64748b') return poolColor;
    return TYPE_COLORS[poolType || 'Default'] || TYPE_COLORS['Default'];
};

// Helper to check if a color is the default slate color
export const isDefaultColor = (color: string): boolean => {
    return color === '#64748b' || color === TYPE_COLORS['Default'];
};
