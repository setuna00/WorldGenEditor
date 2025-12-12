import React from 'react';
import { Edit2, Trash2, Globe, Tag, X, Database, Link2 } from 'lucide-react';
import { PortalTooltip } from './PortalTooltip';

interface TagChipProps {
    tagName: string;
    count?: number;
    color: string;
    description?: string;
    sources?: string[];
    definedIn?: string[];
    usedIn?: string[];
    isGlobal?: boolean;
    icon?: React.ElementType;
    selected?: boolean;
    onEdit?: (e: React.MouseEvent) => void;
    onDelete?: (e: React.MouseEvent) => void;
    onRemove?: (e: React.MouseEvent) => void;
    onClick?: () => void;
    className?: string;
}

const hexToRgba = (hex: string, alpha: number) => {
    if (!hex) return `rgba(100, 116, 139, ${alpha})`;
    if (hex.length === 4) {
        hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const TagChip: React.FC<TagChipProps> = ({ 
    tagName, 
    count, 
    color, 
    description, 
    sources, 
    definedIn,
    usedIn,
    isGlobal,
    icon: IconOverride,
    selected,
    onEdit, 
    onDelete,
    onRemove,
    onClick,
    className 
}) => {
    const baseStyle = {
        backgroundColor: selected ? color : hexToRgba(color, 0.15),
        borderColor: selected ? color : hexToRgba(color, 0.4),
        borderLeftColor: color,
        borderLeftWidth: selected ? '1px' : '3px',
        color: selected ? '#fff' : '#e2e8f0'
    };

    let Icon = IconOverride;
    if (!Icon) {
        Icon = isGlobal ? Globe : Tag;
    }

    const content = (
        <div 
            onClick={onClick}
            className={`
                group relative flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border transition-all duration-200
                hover:brightness-110 hover:shadow-md cursor-default select-none
                ${onClick ? 'cursor-pointer' : ''}
                ${selected ? 'shadow-md' : ''}
                ${className || ''}
            `}
            style={baseStyle}
        >
            <div className="flex items-center gap-2 min-w-0">
                <Icon size={12} style={{ color: selected ? '#fff' : color }} className={`shrink-0 ${selected ? '' : 'opacity-80'}`} />
                <span className={`text-xs font-bold truncate ${selected ? 'text-white' : 'text-slate-200'}`}>{tagName}</span>
            </div>

            <div className="flex items-center gap-2">
                {count !== undefined && (
                    <span 
                        className={`
                            text-xs font-mono px-1.5 py-0.5 rounded font-bold
                            ${selected ? 'bg-black/20 text-white' : 'text-white/80'}
                            ${(onEdit || onDelete || onRemove) ? 'group-hover:hidden' : ''}
                        `}
                        style={!selected ? { backgroundColor: hexToRgba(color, 0.3) } : {}}
                    >
                        {count}
                    </span>
                )}

                {(onEdit || onDelete || onRemove) && (
                    <div className={`flex items-center gap-1 ${onRemove ? '' : 'hidden group-hover:flex animate-in fade-in slide-in-from-right-2 duration-200'}`}>
                        {onEdit && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onEdit(e); }}
                                className="p-1 hover:bg-black/20 rounded text-slate-300 hover:text-white transition-colors"
                                title="Edit Tag"
                            >
                                <Edit2 size={10} />
                            </button>
                        )}
                        {onDelete && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(e); }}
                                className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 transition-colors"
                                title="Delete Tag"
                            >
                                <Trash2 size={10} />
                            </button>
                        )}
                        {onRemove && (
                             <button 
                                onClick={(e) => { e.stopPropagation(); onRemove(e); }}
                                className={`p-0.5 rounded transition-colors ${selected ? 'hover:bg-white/20 text-white' : 'hover:bg-red-500/20 text-slate-400 hover:text-red-400'}`}
                                title="Remove Selection"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
    
    const hasMetadata = description || 
                        (definedIn && definedIn.length > 0) || 
                        (usedIn && usedIn.length > 0) || 
                        (sources && sources.length > 0);

    if (hasMetadata) {
        return (
            <PortalTooltip content={
                <div className="max-w-xs">
                    <div className="font-bold mb-2 border-b border-white/20 pb-1 flex justify-between gap-4">
                        <span>{tagName}</span>
                        {count !== undefined && <span className="opacity-70">{count} uses</span>}
                    </div>
                    {description && <div className="mb-3 italic leading-relaxed opacity-90">{description}</div>}
                    
                    {(definedIn || usedIn) ? (
                        <div className="space-y-2">
                            {definedIn && definedIn.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-1 text-xs text-slate-400 mb-1 font-bold uppercase">
                                        <Database size={10} /> Defined In
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {definedIn.map(src => (
                                            <span key={src} className="text-xs px-1.5 py-0.5 bg-nexus-accent/20 border border-nexus-accent/30 rounded uppercase tracking-wide text-white">
                                                {src}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {usedIn && usedIn.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-1 text-xs text-slate-500 mb-1 font-bold uppercase">
                                        <Link2 size={10} /> Also Used In
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {usedIn.map(src => (
                                            <span key={src} className="text-xs px-1.5 py-0.5 bg-white/5 border border-white/10 rounded uppercase tracking-wide text-slate-400">
                                                {src}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        sources && sources.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {sources.map(src => (
                                    <span key={src} className="text-xs px-1.5 py-0.5 bg-white/10 rounded uppercase tracking-wide">
                                        {src}
                                    </span>
                                ))}
                            </div>
                        )
                    )}
                </div>
            }>
                {content}
            </PortalTooltip>
        );
    }

    return content;
};