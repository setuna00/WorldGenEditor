import React, { useEffect, useState, useRef } from 'react';
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

// Track if modal was just opened to focus close button only once
let justOpened = false;

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

    useEffect(() => {
        setMounted(true);
    }, []);

    // Separate effect for initial focus - only runs when isOpen changes
    useEffect(() => {
        if (isOpen) {
            justOpened = true;
            // Store current active element to restore later
            previousActiveElement.current = document.activeElement as HTMLElement;
            document.body.style.overflow = 'hidden';
            
            // Focus the close button only when modal first opens
            requestAnimationFrame(() => {
                if (justOpened) {
                    closeButtonRef.current?.focus();
                    justOpened = false;
                }
            });
        } else {
            document.body.style.overflow = 'unset';
            // Restore focus to previous element when closing
            if (previousActiveElement.current) {
                previousActiveElement.current.focus();
            }
        }
    }, [isOpen]);

    // Separate effect for keyboard listener - stable reference using onClose ref
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDownStable = (e: KeyboardEvent) => {
            // Close on Escape
            if (e.key === 'Escape') {
                e.preventDefault();
                onCloseRef.current();
                return;
            }

            // Focus trap on Tab
            if (e.key === 'Tab' && modalRef.current) {
                const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement?.focus();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement?.focus();
                    }
                }
            }
        };

        document.addEventListener('keydown', handleKeyDownStable);

        return () => {
            document.removeEventListener('keydown', handleKeyDownStable);
        };
    }, [isOpen]);

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