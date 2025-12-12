
import React, { useMemo } from 'react';

interface WeightPieChartProps {
    data: { label: string; weight: number; color?: string }[];
    size?: number;
}

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

export const WeightPieChart: React.FC<WeightPieChartProps> = ({ data, size = 100 }) => {
    const totalWeight = useMemo(() => data.reduce((acc, d) => acc + d.weight, 0), [data]);
    
    // Calculate slices
    let currentAngle = 0;
    const slices = data.map((d, i) => {
        if (totalWeight === 0) return null;
        const angle = (d.weight / totalWeight) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;
        currentAngle = endAngle;

        // Convert polar to cartesian
        const x1 = 50 + 50 * Math.cos((Math.PI * startAngle) / 180);
        const y1 = 50 + 50 * Math.sin((Math.PI * startAngle) / 180);
        const x2 = 50 + 50 * Math.cos((Math.PI * endAngle) / 180);
        const y2 = 50 + 50 * Math.sin((Math.PI * endAngle) / 180);

        // SVG Path command
        // M center L startPoint A radius radius 0 largeArc sweep endPoint Z
        const largeArc = angle > 180 ? 1 : 0;
        const pathData = `M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`;

        return {
            path: pathData,
            color: d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
            label: d.label,
            percentage: Math.round((d.weight / totalWeight) * 100)
        };
    }).filter(Boolean);

    if (totalWeight === 0) {
        return (
            <div className="rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-500" style={{ width: size, height: size }}>
                No Data
            </div>
        )
    }

    return (
        <div className="relative group" style={{ width: size, height: size }}>
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {slices.map((slice: any, i) => (
                    <path 
                        key={i} 
                        d={slice.path} 
                        fill={slice.color} 
                        stroke="#0f172a" 
                        strokeWidth="2"
                        className="hover:opacity-80 transition-opacity cursor-pointer"
                    >
                        <title>{`${slice.label}: ${slice.percentage}%`}</title>
                    </path>
                ))}
                <circle cx="50" cy="50" r="20" fill="#0f172a" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xs font-bold text-slate-500">Total<br/>{totalWeight}</span>
            </div>
        </div>
    );
};
