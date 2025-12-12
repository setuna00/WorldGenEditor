import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useStrings } from '../../lib/translations';

export interface BreadcrumbItem {
    label: string;
    href?: string;
    icon?: React.ReactNode;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
    className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
    if (items.length === 0) return null;

    return (
        <nav 
            aria-label="Breadcrumb" 
            className={`flex items-center gap-1 text-sm ${className}`}
        >
            <ol className="flex items-center gap-1 flex-wrap">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;
                    
                    return (
                        <li key={index} className="flex items-center gap-1">
                            {index > 0 && (
                                <ChevronRight 
                                    size={14} 
                                    className="text-slate-600 flex-shrink-0" 
                                    aria-hidden="true"
                                />
                            )}
                            
                            {isLast ? (
                                <span 
                                    className="text-slate-300 font-medium flex items-center gap-1.5 truncate max-w-[200px]"
                                    aria-current="page"
                                >
                                    {item.icon}
                                    {item.label}
                                </span>
                            ) : item.href ? (
                                <Link 
                                    to={item.href}
                                    className="text-slate-500 hover:text-nexus-accent transition-colors flex items-center gap-1.5 truncate max-w-[200px]"
                                >
                                    {item.icon}
                                    {item.label}
                                </Link>
                            ) : (
                                <span className="text-slate-500 flex items-center gap-1.5 truncate max-w-[200px]">
                                    {item.icon}
                                    {item.label}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};

// Hook to generate breadcrumb items from current route
export const useBreadcrumbs = (
    pathname: string,
    worldName?: string,
    poolName?: string
): BreadcrumbItem[] => {
    const { s } = useStrings();
    const items: BreadcrumbItem[] = [];
    
    // Parse path segments
    const segments = pathname.split('/').filter(Boolean);
    
    // Home is always first if not on home
    if (segments.length > 0) {
        items.push({
            label: s('breadcrumb.hub'),
            href: '/',
            icon: <Home size={14} />
        });
    }
    
    // World segment
    if (segments[0] === 'world' && segments[1]) {
        const worldId = segments[1];
        items.push({
            label: worldName || s('breadcrumb.world'),
            href: `/world/${worldId}/edit`
        });
        
        // Sub-pages
        if (segments[2]) {
            switch (segments[2]) {
                case 'edit':
                    items.push({ label: s('breadcrumb.overview') });
                    break;
                case 'settings':
                    items.push({ label: s('breadcrumb.worldContext') });
                    break;
                case 'app-settings':
                    items.push({ label: s('breadcrumb.settings') });
                    break;
                case 'pool':
                    if (segments[3]) {
                        items.push({ 
                            label: poolName || segments[3].charAt(0).toUpperCase() + segments[3].slice(1)
                        });
                    }
                    break;
                case 'tags':
                    items.push({ label: s('breadcrumb.tagManager') });
                    break;
                case 'components':
                    items.push({ label: s('breadcrumb.components') });
                    break;
                case 'forge':
                    items.push({ label: s('breadcrumb.aiForge') });
                    break;
                case 'lore-forge':
                    items.push({ label: s('breadcrumb.loreForge') });
                    break;
                case 'character-forge':
                    items.push({ label: s('breadcrumb.characterForge') });
                    break;
                case 'rules':
                    items.push({ label: s('breadcrumb.rules') });
                    break;
                case 'roller':
                    items.push({ label: s('breadcrumb.rollerTest') });
                    break;
                default:
                    items.push({ label: segments[2] });
            }
        }
    }
    
    return items;
};
