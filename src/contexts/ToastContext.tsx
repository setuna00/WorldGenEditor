// src/contexts/ToastContext.tsx
import React, { createContext, useContext } from 'react';
import { toast, Toaster } from 'sonner';

// 1. Maintain the exact interface your app expects
interface ToastContextType {
    toast: (opts: { title: string; message?: string; type?: 'success' | 'error' | 'info' | 'warning'; duration?: number }) => void;
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    
    // 2. The Adapter: Routes legacy calls to Sonner
    const adapter = {
        toast: (opts: { title: string; message?: string; type?: 'success' | 'error' | 'info' | 'warning'; duration?: number }) => {
            const description = opts.message;
            const options = { description, duration: opts.duration };
            
            switch(opts.type) {
                case 'success': return toast.success(opts.title, options);
                case 'error': return toast.error(opts.title, options);
                case 'warning': return toast.warning(opts.title, options);
                case 'info': return toast.info(opts.title, options);
                default: return toast(opts.title, options);
            }
        },
        success: (title: string, message?: string) => toast.success(title, { description: message }),
        error: (title: string, message?: string) => toast.error(title, { description: message }),
    };

    return (
        <ToastContext.Provider value={adapter}>
            {children}
            {/* 3. The Sonner Toaster (Global Render) */}
            <Toaster 
                position="top-right" 
                theme="dark" 
                richColors 
                closeButton
                style={{
                    fontFamily: 'inherit' // Inherit your app's font
                }}
            />
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast must be used within ToastProvider");
    return context;
};