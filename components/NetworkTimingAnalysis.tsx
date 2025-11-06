import React from 'react';
import type { NetworkTimings, StructuredSummary } from '../types';
import { InformationCircleIcon, SparklesIcon } from './icons';
import AiSummaryBox from './AiSummaryBox';

interface NetworkTimingAnalysisProps {
    timings: NetworkTimings;
    aiSummary?: StructuredSummary;
    isGeneratingReport?: boolean;
}

const NetworkTimingAnalysis: React.FC<NetworkTimingAnalysisProps> = ({ timings, aiSummary, isGeneratingReport }) => {
    // 1. Group the timings into understandable categories
    const connectionTime = timings.dns + timings.tcp + timings.tls;
    const serverTime = timings.ttfb;
    const transferTime = timings.download;
    const totalTime = connectionTime + serverTime + transferTime;

    if (totalTime === 0) {
        return (
            <div className="p-4 bg-gray-800/50 rounded-lg text-center text-gray-500">
                <InformationCircleIcon className="w-6 h-6 mx-auto mb-2" />
                <p>No network timing data available for this test run.</p>
                <p className="text-xs mt-1">This can happen if the 'Enable Network Analysis' option was disabled.</p>
            </div>
        );
    }

    // 2. Define the phases for rendering
    const phases = [
        { 
            key: 'connection',
            label: 'Connection Setup', 
            value: connectionTime, 
            color: 'bg-blue-500', 
            explanation: 'Time to resolve the domain (DNS) and establish a secure connection (TCP/TLS) to the server.' 
        },
        { 
            key: 'server',
            label: 'Server Processing (TTFB)', 
            value: serverTime, 
            color: 'bg-red-500', 
            explanation: 'This is the average time for a single request, calculated across all requests in the test. It measures the "think time" of your hosted API server before it sends a response, making it a pure backend metric unaffected by network speed.' 
        },
        { 
            key: 'transfer',
            label: 'Data Transfer', 
            value: transferTime, 
            color: 'bg-green-500', 
            explanation: 'Time taken to download the full response from the server after the first byte was received.' 
        }
    ];

    // 3. Identify the bottleneck
    const bottleneck = [...phases].sort((a, b) => b.value - a.value)[0];

    return (
        <div className="space-y-4">
            <div id="network-timing-chart-for-pdf">
                {/* Simplified Stacked Bar */}
                <div className="w-full bg-gray-700 rounded-full flex h-6 font-mono text-xs text-white overflow-hidden my-2" title={`Total Request Time: ${totalTime.toFixed(0)}ms`}>
                    {phases.map(phase => {
                        const percentage = (phase.value / totalTime) * 100;
                        if (phase.value <= 0) return null;
                        return (
                            <div 
                                key={phase.key}
                                className={`flex items-center justify-center ${phase.color} transition-all duration-300`}
                                style={{ width: `${percentage}%` }}
                                title={`${phase.label}: ${phase.value.toFixed(0)}ms (${percentage.toFixed(1)}%)`}
                            >
                                {percentage > 15 && `${phase.value.toFixed(0)}ms`}
                            </div>
                        );
                    })}
                </div>

                {/* Key Takeaway */}
                <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg flex items-start space-x-3">
                    <SparklesIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-white">Key Takeaway</h4>
                        <p className="text-sm text-gray-300 mt-1">
                            The primary bottleneck was <strong className="text-yellow-400">{bottleneck.label.split('(')[0].trim()}</strong>, which accounted for <strong className="text-yellow-400">{((bottleneck.value / totalTime) * 100).toFixed(1)}%</strong> of the total response time.
                        </p>
                        {bottleneck.key === 'server' && (
                            <p className="text-xs text-gray-400 mt-2">
                                This measures the "think time" of your hosted API server. A high value points to a backend performance issue (e.g., slow database queries, complex application logic), not a problem with the network.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Detailed Breakdown Table */}
            <div className="space-y-2">
                {phases.map(phase => (
                    <div key={phase.key} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-3">
                                <div className={`w-3 h-3 rounded-sm ${phase.color} flex-shrink-0`}></div>
                                <span className="font-semibold text-sm text-white">{phase.label}</span>
                            </div>
                            <span className="font-mono text-lg font-bold text-white">{phase.value.toFixed(0)} ms</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-2 pl-6">
                            {phase.explanation}
                        </p>
                    </div>
                ))}
            </div>

            {/* AI Summary */}
            <div className="mt-4">
                <AiSummaryBox summary={aiSummary} isLoading={isGeneratingReport} />
            </div>
        </div>
    );
};

export default NetworkTimingAnalysis;