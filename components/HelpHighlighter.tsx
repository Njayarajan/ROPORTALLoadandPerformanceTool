import React from 'react';

interface HelpHighlighterProps {
    step: number;
    tourId: string;
    activeTourId: string | null;
    activeStep: number | null;
    children: React.ReactNode;
    className?: string;
}

const HelpHighlighter: React.FC<HelpHighlighterProps> = ({ step, tourId, activeTourId, activeStep, children, className }) => {
    const isActive = tourId === activeTourId && step === activeStep;

    // Add a transition to the children's container to make resizing smoother
    const containerClassName = `${className || ''} transition-all duration-300`;

    if (!isActive) {
        return <div className={containerClassName}>{children}</div>;
    }

    return (
        <div className={`relative ${containerClassName}`}>
            {children}
            <div className="absolute inset-0 bg-amber-400/20 border-2 border-amber-400 rounded-lg pointer-events-none animate-pulse z-10">
                <div className="absolute -top-3 -left-3 bg-black text-amber-400 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg ring-4 ring-gray-900">
                    {step}
                </div>
            </div>
        </div>
    );
};

export default HelpHighlighter;