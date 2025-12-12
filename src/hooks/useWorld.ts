/**
 * Facade Hook: useWorld
 * 
 * This hook provides backward compatibility with the legacy WorldContext API
 * while using the new modular architecture underneath.
 * 
 * Architecture:
 * - ActiveWorldContext: manages worldId and refresh signals
 * - WorldDataContext: loads and maintains currentWorld
 * - ForgeStateContext: manages forge state independently
 * - SettingsContext: manages app settings
 * - ServiceContext: provides worldManager singleton
 */

import { useActiveWorld } from '../contexts/ActiveWorldContext';
import { useWorldData } from '../contexts/WorldDataContext';
import { useForgeState } from '../contexts/ForgeStateContext';
import { useAppSettings } from '../contexts/SettingsContext';
import { useWorldManager } from '../contexts/ServiceContext';
import { GlobalAppSettings, ForgeState } from '../types';

export interface WorldContextType {
    // From WorldDataContext
    currentWorld: ReturnType<typeof useWorldData>['currentWorld'];
    refreshWorld: () => void;
    
    // From ActiveWorldContext (bridged)
    setWorldId: (id: string | null) => void;
    
    // From ServiceContext
    worldManager: ReturnType<typeof useWorldManager>;
    
    // From SettingsContext
    appSettings: GlobalAppSettings;
    updateAppSettings: (settings: GlobalAppSettings) => void;
    
    // From ForgeStateContext
    forgeState: Record<string, ForgeState>;
    setForgeState: (key: string, state: ForgeState) => void;
}

/**
 * useWorld - Facade hook that combines all world-related contexts
 * 
 * This maintains the same API as the legacy LegacyWorldContext
 * allowing existing components to work without modification.
 */
export const useWorld = (): WorldContextType => {
    const { setActiveWorldId } = useActiveWorld();
    const { currentWorld, refreshWorld } = useWorldData();
    const { forgeState, setForgeState } = useForgeState();
    const { settings: appSettings, updateSettings: updateAppSettings } = useAppSettings();
    const worldManager = useWorldManager();

    return {
        currentWorld,
        refreshWorld,
        setWorldId: setActiveWorldId,
        worldManager,
        appSettings,
        updateAppSettings,
        forgeState,
        setForgeState
    };
};

