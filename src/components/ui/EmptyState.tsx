import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';
import { NexusButton } from './Button';

interface EmptyStateProps {
    /** Icon to display */
    icon?: LucideIcon;
    /** Main title */
    title: string;
    /** Description text */
    description?: string;
    /** Primary action button text */
    actionLabel?: string;
    /** Primary action callback */
    onAction?: () => void;
    /** Secondary action button text */
    secondaryLabel?: string;
    /** Secondary action callback */
    onSecondaryAction?: () => void;
    /** Additional className */
    className?: string;
    /** Size variant */
    size?: 'sm' | 'md' | 'lg';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon: Icon = Inbox,
    title,
    description,
    actionLabel,
    onAction,
    secondaryLabel,
    onSecondaryAction,
    className = '',
    size = 'md'
}) => {
    const sizeStyles = {
        sm: {
            container: 'py-6 px-4',
            icon: 32,
            title: 'text-sm',
            desc: 'text-xs'
        },
        md: {
            container: 'py-12 px-6',
            icon: 48,
            title: 'text-lg',
            desc: 'text-sm'
        },
        lg: {
            container: 'py-16 px-8',
            icon: 64,
            title: 'text-xl',
            desc: 'text-base'
        }
    };

    const styles = sizeStyles[size];

    return (
        <div 
            className={`flex flex-col items-center justify-center text-center ${styles.container} ${className}`}
            role="status"
            aria-label={title}
        >
            <div className="bg-nexus-900 p-4 rounded-full mb-4 border border-slate-700">
                <Icon 
                    size={styles.icon} 
                    className="text-slate-600" 
                    aria-hidden="true"
                />
            </div>
            
            <h3 className={`font-bold text-slate-300 mb-2 ${styles.title}`}>
                {title}
            </h3>
            
            {description && (
                <p className={`text-slate-500 max-w-sm mb-6 ${styles.desc}`}>
                    {description}
                </p>
            )}

            {(actionLabel || secondaryLabel) && (
                <div className="flex gap-3 flex-wrap justify-center">
                    {secondaryLabel && onSecondaryAction && (
                        <NexusButton 
                            variant="ghost" 
                            onClick={onSecondaryAction}
                            size={size === 'sm' ? 'sm' : 'default'}
                        >
                            {secondaryLabel}
                        </NexusButton>
                    )}
                    {actionLabel && onAction && (
                        <NexusButton 
                            onClick={onAction}
                            size={size === 'sm' ? 'sm' : 'default'}
                        >
                            {actionLabel}
                        </NexusButton>
                    )}
                </div>
            )}
        </div>
    );
};
