// src/components/PortalTooltip.tsx
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PortalTooltipProps {
    content: React.ReactNode;
    children: React.ReactNode;
}

export const PortalTooltip: React.FC<PortalTooltipProps> = ({ content, children }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setCoords({
                top: rect.top - 8, // Just above
                left: rect.left + (rect.width / 2)
            });
            setIsVisible(true);
        }
    };

    const handleMouseLeave = () => {
        setIsVisible(false);
    };

    return (
        <div 
            ref={triggerRef} 
            onMouseEnter={handleMouseEnter} 
            onMouseLeave={handleMouseLeave}
            className="inline-block"
        >
            {children}
            {isVisible && createPortal(
                <div 
                    className="fixed z-[9999] pointer-events-none transform -translate-x-1/2 -translate-y-full px-2 py-1 bg-black/95 text-white text-xs rounded shadow-xl border border-slate-700 max-w-xs whitespace-normal break-words"
                    style={{ top: coords.top, left: coords.left }}
                >
                    {content}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black/90"></div>
                </div>,
                document.body
            )}
        </div>
    );
};