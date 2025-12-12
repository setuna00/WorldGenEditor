import React from 'react';
import { Search } from 'lucide-react';
import { NexusInput } from './ui';
import { useStrings } from '../lib/translations';

export interface SourceOption {
    id: string;
    label: string;
    icon?: React.ElementType;
    count?: number;
    color?: string;
    type?: 'group' | 'item';
}

interface NexusSourceLayoutProps {
    sources: SourceOption[];
    selectedSource: string;
    onSourceSelect: (id: string) => void;
    children: React.ReactNode;
    searchQuery?: string;
    onSearchChange?: (val: string) => void;
    searchPlaceholder?: string;
    className?: string;
    actions?: React.ReactNode; 
}

export const NexusSourceLayout: React.FC<NexusSourceLayoutProps> = ({
    sources,
    selectedSource,
    onSourceSelect,
    children,
    searchQuery,
    onSearchChange,
    searchPlaceholder,
    className = "h-[500px]",
    actions
}) => {
    const { s } = useStrings();
    return (
        <div className={`flex gap-4 -m-2 ${className}`}>
            {/* Sidebar */}
            <div className="w-48 border-r border-slate-700 p-2 space-y-1 overflow-y-auto custom-scrollbar flex-shrink-0">
                <div className="text-xs font-bold text-slate-500 uppercase mb-2 px-2">{s('sourceLayout.sources')}</div>
                {sources.map(src => (
                    <button
                        key={src.id}
                        onClick={() => onSourceSelect(src.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-colors ${
                            selectedSource === src.id 
                            ? 'bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/30' 
                            : 'text-slate-400 hover:bg-nexus-800 hover:text-slate-200'
                        }`}
                    >
                        {src.icon && <src.icon size={14} />}
                        <span className="truncate flex-1 text-left">{src.label}</span>
                        {src.count !== undefined && (
                            <span className="text-xs bg-black/20 px-1.5 py-0.5 rounded text-slate-500">{src.count}</span>
                        )}
                        {src.color && <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: src.color}} />}
                    </button>
                ))}
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col p-2 min-w-0">
                {/* Header Bar */}
                <div className="flex items-center gap-3 mb-4">
                    {onSearchChange && (
                        <div className="flex-1">
                            <NexusInput 
                                value={searchQuery || ''}
                                onChange={e => onSearchChange(e.target.value)}
                                placeholder={searchPlaceholder || s('sourceLayout.search')}
                                leftIcon={<Search size={16} />}
                                autoFocus
                            />
                        </div>
                    )}
                    {actions}
                </div>

                {/* Grid Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
};