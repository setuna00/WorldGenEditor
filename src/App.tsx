import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layouts/MainLayout';

// Pages
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Pools from './pages/Pools';
import GenerationEngine from './pages/GenerationEngine';
import Roller from './pages/Roller';
import Rules from './pages/Rules';
import WorldSettings from './pages/WorldSettings';
import AppSettings from './pages/AppSettings';
import TagManagerPage from './pages/TagManagerPage';
import ComponentManager from './pages/ComponentManager';

// Contexts - New Modular Architecture
import { LogProvider } from './contexts/LogContext';
import { ServiceProvider } from './contexts/ServiceContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ActiveWorldProvider } from './contexts/ActiveWorldContext';
import { WorldDataProvider } from './contexts/WorldDataContext';
import { ForgeStateProvider } from './contexts/ForgeStateContext';
import { AIServiceProvider } from './contexts/AIServiceContext';
import { ToastProvider } from './contexts/ToastContext'; 

/**
 * Provider Architecture (outer to inner):
 * 
 * 1. ServiceProvider - WorldManager singleton
 * 2. SettingsProvider - Global app settings (localStorage)
 * 3. AIServiceProvider - AI provider configuration (user API keys)
 * 4. ActiveWorldProvider - Active world ID + refresh signals
 * 5. WorldDataProvider - Loads full World data based on activeWorldId
 * 6. ForgeStateProvider - Independent forge state management
 * 7. LogProvider - Generation logs
 * 8. ToastProvider - Notifications
 * 
 * Components use the `useWorld` facade hook which combines these contexts
 * to maintain backward compatibility with the legacy API.
 */

const App: React.FC = () => {
  return (
    <ServiceProvider>
        <SettingsProvider>
            <AIServiceProvider>
                <ActiveWorldProvider>
                    <WorldDataProvider>
                        <ForgeStateProvider>
                            <LogProvider>
                                <ToastProvider>
                                <HashRouter>
                                    <Routes>
                                    <Route path="/" element={<Layout />}>
                                        <Route index element={<Home />} />
                                        <Route path="world/:worldId/*">
                                            <Route path="edit" element={<Dashboard />} />
                                            <Route path="settings" element={<WorldSettings />} />
                                            <Route path="app-settings" element={<AppSettings />} />
                                            <Route path="pool/:poolName" element={<Pools />} />
                                            <Route path="rules" element={<Rules />} />
                                            <Route path="tags" element={<TagManagerPage />} />
                                            <Route path="components" element={<ComponentManager />} />
                                            <Route path="forge" element={<GenerationEngine defaultMode="Asset" />} />
                                            <Route path="lore-forge" element={<GenerationEngine defaultMode="Lore" />} />
                                            <Route path="character-forge" element={<GenerationEngine defaultMode="Character" />} />
                                            <Route path="roller" element={<Roller />} />
                                        </Route>
                                        <Route path="*" element={<Navigate to="/" replace />} />
                                    </Route>
                                    </Routes>
                                </HashRouter>
                                </ToastProvider>
                            </LogProvider>
                        </ForgeStateProvider>
                    </WorldDataProvider>
                </ActiveWorldProvider>
            </AIServiceProvider>
        </SettingsProvider>
    </ServiceProvider>
  );
};

export default App;
