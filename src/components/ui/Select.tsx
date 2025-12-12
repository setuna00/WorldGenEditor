import React, { useId } from 'react';

interface NexusSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    /** Error message to display */
    error?: string;
}

export const NexusSelect: React.FC<NexusSelectProps> = ({ 
    label, 
    children, 
    className, 
    error,
    required,
    id: providedId,
    ...props 
}) => {
    const generatedId = useId();
    const selectId = providedId || generatedId;
    const errorId = `${selectId}-error`;

    return (
        <div className="w-full">
            {label && (
                <label 
                    htmlFor={selectId}
                    className="block text-xs text-slate-400 uppercase font-bold mb-1.5 tracking-wide"
                >
                    {label}
                    {required && <span className="text-red-400 ml-1" aria-hidden="true">*</span>}
                </label>
            )}
            <select 
                id={selectId}
                className={`w-full bg-nexus-900 border text-slate-200 rounded p-2.5 text-sm outline-none cursor-pointer transition-colors focus:ring-2 focus:ring-nexus-accent/50 ${
                    error 
                        ? 'border-red-500 focus:border-red-500' 
                        : 'border-slate-600 focus:border-nexus-accent'
                } ${className || ''}`}
                required={required}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? errorId : undefined}
                {...props}
            >
                {children}
            </select>
            {error && (
                <p id={errorId} className="mt-1 text-xs text-red-400" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
};