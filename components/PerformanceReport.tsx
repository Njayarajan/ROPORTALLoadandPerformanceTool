import React, { useState } from 'react';
import type { PerformanceReport, KeyObservation } from '../types';
import { ChartBarSquareIcon, CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from './icons';

interface PerformanceReportComponentProps {
    report: PerformanceReport;
    title: string;
}

const severityConfig = {
    Positive: {
        icon: CheckCircleIcon,
        color: 'text-green-400',
        bg: 'bg-green-900/30 border-green-500/30',
    },
    Neutral: {
        icon: InformationCircleIcon,
        color: 'text-blue-400',
        bg: 'bg-blue-900/30 border-blue-500/30',
    },
    Warning: {
        icon: ExclamationTriangleIcon,
        color: 'text-yellow-400',
        bg: 'bg-yellow-900/30 border-yellow-500/30',
    },
    Critical: {
        icon: XCircleIcon,
        color: 'text-red-400',
        bg: 'bg-red-900/30 border-red-500/30',
    },
};

const ObservationCard: React.FC<{ observation: KeyObservation }> = ({ observation }) => {
    const config = severityConfig[observation.severity] || severityConfig.Neutral;
    const Icon = config.icon;

    return (
        <div className={`p-4 rounded-lg border flex space-x-4 ${config.bg}`}>
            <div className={`flex-shrink-0 w-6 h-6 ${config.color} mt-1`}>
                <Icon className="w-6 h-6" />
            </div>
            <div>
                <h5 className={`font-bold ${config.color}`}>{observation.metric}</h5>
                <p className="text-gray-300 text-sm mt-1">{observation.finding}</p>
            </div>
        </div>
    );
};

const PerformanceReportComponent: React.FC<PerformanceReportComponentProps> = ({ report, title }) => {
    return (
        <div id="analysis-details-content" className="bg-gray-900 p-6 rounded-lg border border-gray-700 space-y-8">
            <div className="flex justify-between items-start border-b border-gray-700 pb-4">
                <div className="flex-grow">
                    <h3 className="text-xl font-bold text-white mb-2 flex items-center">
                        <ChartBarSquareIcon className="w-6 h-6 mr-3 text-blue-400" />
                        <span>Performance Analysis</span>
                    </h3>
                    <p className="text-sm text-gray-400 pl-9">A detailed summary of key findings and recommendations.</p>
                </div>
            </div>

            {/* Executive Summary */}
            <div className="space-y-3">
                <h4 className="text-lg font-semibold text-white">Executive Summary</h4>
                <blockquote className="border-l-4 border-blue-500 pl-4 py-2 bg-gray-800/50 rounded-r-lg">
                    <p className="text-gray-300 italic">{report.executiveSummary}</p>
                </blockquote>
            </div>
            
            {/* Key Observations */}
            <div className="space-y-3">
                <h4 className="text-lg font-semibold text-white">Key Observations</h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {report.keyObservations?.map((obs, index) => (
                        <ObservationCard key={index} observation={obs} />
                    ))}
                </div>
            </div>

            {/* Recommendations */}
            <div className="space-y-3">
                <h4 className="text-lg font-semibold text-white">Recommendations</h4>
                <ol className="list-decimal list-inside space-y-3 text-gray-300 bg-gray-800/50 p-4 rounded-lg">
                    {report.recommendations?.map((rec, index) => (
                        <li key={index} className="pl-2 leading-relaxed">{rec}</li>
                    ))}
                </ol>
            </div>
        </div>
    );
};

export default PerformanceReportComponent;