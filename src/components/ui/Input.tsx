import React, { useId } from 'react';

interface NexusInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    leftIcon?: React.ReactNode;
    /** Error message to display */
    error?: string;
}

export const NexusInput: React.FC<NexusInputProps> = ({ 
    label, 
    leftIcon, 
    className, 
    error,
    required,
    id: providedId,
    ...props 
}) => {
    const generatedId = useId();
    const inputId = providedId || generatedId;
    const errorId = `${inputId}-error`;

    return (
        <div className="w-full">
            {label && (
                <label 
                    htmlFor={inputId}
                    className="block text-xs text-slate-400 uppercase font-bold mb-1.5 tracking-wide"
                >
                    {label}
                    {required && <span className="text-red-400 ml-1" aria-hidden="true">*</span>}
                </label>
            )}
            <div className="relative">
                {leftIcon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none flex items-center" aria-hidden="true">
                        {leftIcon}
                    </div>
                )}
                <input 
                    id={inputId}
                    className={`w-full bg-nexus-900 border rounded p-2.5 text-sm text-slate-200 outline-none transition-colors placeholder-slate-500 focus:ring-2 focus:ring-nexus-accent/50 ${
                        error 
                            ? 'border-red-500 focus:border-red-500' 
                            : 'border-slate-600 focus:border-nexus-accent'
                    } ${leftIcon ? 'pl-10' : ''} ${className || ''}`}
                    required={required}
                    aria-invalid={error ? 'true' : undefined}
                    aria-describedby={error ? errorId : undefined}
                    {...props}
                />
            </div>
            {error && (
                <p id={errorId} className="mt-1 text-xs text-red-400" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
};