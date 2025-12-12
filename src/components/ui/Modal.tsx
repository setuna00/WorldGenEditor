import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface NexusModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: string;
    /** Unique ID for accessibility labelling */
    id?: string;
}

// Focusable element selectors
const FOCUSABLE_SELECTORS = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])'
].join(', ');

export const NexusModal: React.FC<NexusModalProps> = ({ 
    isOpen, 
    onClose, 
    title, 
    children, 
    footer, 
    maxWidth = 'max-w-md',
    id
}) => {
    const [mounted, setMounted] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    // Generate a unique ID for accessibility
    const modalId = id || `nexus-modal-${Math.random().toString(36).substr(2, 9)}`;
    const titleId = `${modalId}-title`;

    // Focus trap implementation
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!isOpen) return;

        // Close on Escape
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
        }

        // Focus trap on Tab
        if (e.key === 'Tab' && modalRef.current) {
            const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (e.shiftKey) {
                // Shift+Tab: If on first element, go to last
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement?.focus();
                }
            } else {
                // Tab: If on last element, go to first
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement?.focus();
                }
            }
        }
    }, [isOpen, onClose]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            // Store current active element to restore later
            previousActiveElement.current = document.activeElement as HTMLElement;
            document.body.style.overflow = 'hidden';
            
            // Add keyboard listener
            document.addEventListener('keydown', handleKeyDown);
            
            // Focus the close button after a short delay (for animation)
            requestAnimationFrame(() => {
                closeButtonRef.current?.focus();
            });
        }

        return () => {
            document.body.style.overflow = 'unset';
            document.removeEventListener('keydown', handleKeyDown);
            
            // Restore focus to previous element
            if (!isOpen && previousActiveElement.current) {
                previousActiveElement.current.focus();
            }
        };
    }, [isOpen, handleKeyDown]);

    if (!mounted || !isOpen) return null;

    const modalContent = (
        <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            role="presentation"
        >
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
                aria-hidden="true"
            />
            
            {/* Modal Card */}
            <div 
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`relative bg-nexus-800 border border-slate-600 w-full ${maxWidth} rounded-xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[90vh] animate-in zoom-in-95 duration-200 mx-4`}
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-nexus-900/50 rounded-t-xl shrink-0">
                    <h2 
                        id={titleId}
                        className="text-lg font-bold text-slate-100 flex items-center gap-2"
                    >
                        {title}
                    </h2>
                    <button 
                        ref={closeButtonRef}
                        onClick={onClose} 
                        className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded focus:outline-none focus:ring-2 focus:ring-nexus-accent focus:ring-offset-2 focus:ring-offset-nexus-800"
                        aria-label="Close modal"
                        type="button"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {children}
                </div>
                
                {footer && (
                    <div className="p-4 border-t border-slate-700 bg-nexus-900/50 rounded-b-xl flex justify-end gap-3 shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};