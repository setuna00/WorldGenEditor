import React, { useRef, useLayoutEffect, useId } from 'react';

interface NexusTextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    /** Error message to display */
    error?: string;
    /** Maximum auto-resize height in pixels */
    maxAutoHeight?: number;
}

export const NexusTextArea: React.FC<NexusTextAreaProps> = ({ 
    label, 
    className, 
    value, 
    error,
    required,
    id: providedId,
    maxAutoHeight = 400,
    ...props 
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const generatedId = useId();
    const textareaId = providedId || generatedId;
    const errorId = `${textareaId}-error`;

    // Auto-resize logic with max height limit
    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            // Reset height to allow shrinking
            textarea.style.height = 'auto';
            // Set height to scrollHeight + borders, capped at maxAutoHeight
            const newHeight = Math.min(textarea.scrollHeight + 2, maxAutoHeight);
            textarea.style.height = `${newHeight}px`;
            // Enable scrolling if content exceeds max height
            textarea.style.overflowY = textarea.scrollHeight > maxAutoHeight ? 'auto' : 'hidden';
        }
    }, [value, maxAutoHeight]);

    return (
        <div className="w-full">
            {label && (
                <label 
                    htmlFor={textareaId}
                    className="block text-xs text-slate-400 uppercase font-bold mb-1.5 tracking-wide"
                >
                    {label}
                    {required && <span className="text-red-400 ml-1" aria-hidden="true">*</span>}
                </label>
            )}
            <textarea 
                ref={textareaRef}
                id={textareaId}
                value={value}
                className={`w-full bg-nexus-900 border rounded p-2.5 text-sm text-slate-200 outline-none placeholder-slate-500 transition-colors resize-none focus:ring-2 focus:ring-nexus-accent/50 ${
                    error 
                        ? 'border-red-500 focus:border-red-500' 
                        : 'border-slate-600 focus:border-nexus-accent'
                } ${className || ''}`}
                required={required}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? errorId : undefined}
                {...props}
            />
            {error && (
                <p id={errorId} className="mt-1 text-xs text-red-400" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
};