import React, { useState } from 'react';
import type { FailureAnalysisReport } from '../types';
import { ExclamationTriangleIcon, WrenchIcon, ClipboardDocumentCheckIcon, SpinnerIcon, BeakerIcon, ChevronDownIcon } from './icons';

interface FailureAnalysisReportComponentProps {
    analysis?: FailureAnalysisReport;
    isLoading?: boolean;
    onRunDiagnosticTest?: () => void;
    onRunRampUpTest?: () => void;
}

const FailureAnalysisReportComponent: React.FC<FailureAnalysisReportComponentProps> = ({ analysis, isLoading, onRunDiagnosticTest, onRunRampUpTest }) => {
    const [isOpen, setIsOpen] = useState(true);

    if (isLoading) {
        return (
            <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg flex items-center justify-center space-x-3 animate-pulse text-gray-400">
                <SpinnerIcon className="w-5 h-5 flex-shrink-0 text-blue-500" />
                <p className="text-sm font-medium">Analyzing failures to find root cause...</p>
            </div>
        );
    }
    
    if (!analysis) return null;

    const SINGLE_USER_TEST_KEYWORD = 'single-user test';
    const RAMP_UP_KEYWORD = 'gradual ramp-up';

    return (
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
             <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex justify-between items-center p-4 text-left"
                aria-expanded={isOpen}
            >
                <div className="flex items-start space-x-4">
                    <ExclamationTriangleIcon className="w-8 h-8 flex-shrink-0 text-yellow-400" />
                    <div>
                        <h3 className="text-lg font-bold text-yellow-300">Test Failure Analysis</h3>
                        <p className="text-sm text-yellow-200 mt-1">
                            {analysis.rootCauseAnalysis}
                        </p>
                    </div>
                </div>
                <ChevronDownIcon className={`w-6 h-6 text-yellow-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isOpen && (
                <div className="p-6 pt-4 border-t border-yellow-500/30 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="flex items-center text-md font-semibold text-white mb-2">
                                <WrenchIcon className="w-5 h-5 mr-2 text-gray-300"/>
                                Configuration Feedback
                            </h4>
                            <ul className="space-y-4 list-disc list-inside text-sm text-gray-300">
                                {analysis.configurationFeedback.map((item, index) => {
                                    const isSingleUserSuggestion = item.toLowerCase().includes(SINGLE_USER_TEST_KEYWORD);
                                    const isRampUpSuggestion = item.toLowerCase().includes(RAMP_UP_KEYWORD);
                                    return (
                                        <li key={index}>
                                            {item}
                                            {isSingleUserSuggestion && onRunDiagnosticTest && (
                                                <div className="mt-2 pl-2">
                                                    <button 
                                                        onClick={onRunDiagnosticTest}
                                                        className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition"
                                                    >
                                                        <BeakerIcon className="w-4 h-4" />
                                                        <span>Run Single-User Diagnostic Test</span>
                                                    </button>
                                                </div>
                                            )}
                                            {isRampUpSuggestion && onRunRampUpTest && (
                                                <div className="mt-2 pl-2">
                                                    <button 
                                                        onClick={onRunRampUpTest}
                                                        className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition"
                                                    >
                                                        <BeakerIcon className="w-4 h-4" />
                                                        <span>Rerun with Gradual Ramp-Up</span>
                                                    </button>
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                        <div>
                            <h4 className="flex items-center text-md font-semibold text-white mb-2">
                                <ClipboardDocumentCheckIcon className="w-5 h-5 mr-2 text-gray-300"/>
                                Suggested Next Steps
                            </h4>
                            <ol className="space-y-2 list-decimal list-inside text-sm text-gray-300">
                                {analysis.suggestedNextSteps.map((item, index) => (
                                    <li key={index}>{item}</li>
                                ))}
                            </ol>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FailureAnalysisReportComponent;