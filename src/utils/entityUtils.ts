import { UniversalEntity } from '../types';

export const EntityUtils = {
  // Safe Accessor for Description (Dynamic Scan)
  getDescription: (e: UniversalEntity) => {
      // 1. Check Standard Paths first for speed
      if (e.components['lore']?.['description']) return e.components['lore']['description'];
      if (e.components['description']?.['text']) return e.components['description']['text'];
      if (e.components['description']?.['value']) return e.components['description']['value'];

      // 2. Dynamic Scan: Look for ANY key like 'description', 'bio', 'history', 'background' in ANY component
      const DESCRIPTION_KEYS = ['description', 'bio', 'biography', 'history', 'background', 'overview', 'summary', 'text'];
      
      for (const compId of Object.keys(e.components)) {
          if (compId === 'metadata' || compId === 'rarity' || compId === 'relations') continue;
          
          const comp = e.components[compId];
          if (!comp || typeof comp !== 'object') continue;

          for (const key of Object.keys(comp)) {
              if (DESCRIPTION_KEYS.includes(key.toLowerCase())) {
                  const val = comp[key];
                  if (typeof val === 'string' && val.length > 5) {
                      return val;
                  }
              }
          }
      }

      return '';
  },
  
  // Safe Accessor for Rarity
  getRarity: (e: UniversalEntity) => {
      return e.components['rarity']?.['value'] || 'Common';
  },

  // Flattener for "Card View"
  getDisplayAttributes: (e: UniversalEntity) => {
      const attrs: Record<string, any> = {};
      
      // FIX: Added 'description' to hidden list to prevent duplicate display
      const HIDDEN_COMPONENTS = ['lore', 'visual', 'metadata', 'rarity', 'legacy', 'description', 'relations'];
      // Also hide fields that are likely "long descriptions" to avoid cluttering the stats card
      const HIDDEN_FIELDS = ['description', 'bio', 'biography', 'history', 'background', 'rumor', 'secret'];

      if (!e.components) return attrs;

      Object.keys(e.components).forEach(compId => {
          if (HIDDEN_COMPONENTS.includes(compId)) return;
          
          const compData = e.components[compId];
          if (!compData || typeof compData !== 'object') return;

          Object.keys(compData).forEach(fieldKey => {
             // Skip long text fields (they are shown in the main description area if caught by getDescription, or just hidden)
             if (HIDDEN_FIELDS.includes(fieldKey.toLowerCase())) return;

             const value = compData[fieldKey];
             
             // FIX: Handle Arrays (like string lists) gracefully
             if (Array.isArray(value)) {
                 const label = fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1);
                 attrs[label] = value.join(', ');
             }
             // FIX: Handle Primitives
             else if (typeof value !== 'object' && value !== null) {
                 const label = fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1);
                 attrs[label] = value;
             }
          });
      });
      
      if (e.components['metadata']?.['role']) {
          attrs['Role'] = e.components['metadata']['role'];
      }
      
      return attrs;
  }
};