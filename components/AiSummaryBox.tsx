import React from 'react';
import type { StructuredSummary } from '../types';
import { SparklesIcon, WrenchIcon, InformationCircleIcon } from './icons';

interface AiSummaryBoxProps {
  summary: string | StructuredSummary | null | undefined;
  isLoading?: boolean;
}

const AiSummaryBox: React.FC<AiSummaryBoxProps> = ({ summary, isLoading }) => {
    if (isLoading) {
        return (
            <div className="p-3 text-sm text-gray-400 bg-gray-800/50 border border-gray-700/50 rounded-lg flex items-center space-x-3 animate-pulse">
                <SparklesIcon className="w-5 h-5 flex-shrink-0 text-blue-500" />
                <p>Generating insights...</p>
            </div>
        );
    }

    if (!summary) return null;

    if (typeof summary === 'string') {
        return (
            <div className="p-4 text-sm bg-gray-800/50 border border-gray-700 rounded-lg flex items-start space-x-3">
                <InformationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-400" />
                <p className="text-gray-300">{summary}</p>
            </div>
        );
    }

    if (typeof summary === 'object' && summary.analysis) {
        const hasSuggestion = summary.suggestion && summary.suggestion.trim() !== '';
        return (
            <div className="p-4 text-sm bg-gray-800/50 border border-gray-700 rounded-lg space-y-4">
                <div className="flex items-start space-x-3">
                    <InformationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-400" />
                    <div>
                        <h4 className="font-bold text-gray-200">Analysis</h4>
                        <p className="text-gray-300 mt-1">{summary.analysis}</p>
                    </div>
                </div>
                {hasSuggestion && (
                    <>
                        <div className="border-t border-gray-700/50"></div>
                        <div className="flex items-start space-x-3">
                            <WrenchIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-400" />
                            <div>
                                <h4 className="font-bold text-gray-200">Suggestion</h4>
                                <p className="text-gray-300 mt-1">{summary.suggestion}</p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }

    return null;
};

export default AiSummaryBox;