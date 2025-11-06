import React from 'react';
import type { TestStats, StructuredSummary } from '../types';
import { InformationCircleIcon } from './icons';
import AiSummaryBox from './AiSummaryBox';

interface LatencyStatsDisplayProps {
  stats: TestStats | null;
  aiSummary?: StructuredSummary;
  isGeneratingReport?: boolean;
}

const StatRow: React.FC<{ 
    label: string; 
    value: string; 
    tooltip: string;
    valueColor?: string;
}> = ({ label, value, tooltip, valueColor = 'text-white' }) => {
    return (
        <li className="flex items-center justify-between py-3 px-4 bg-gray-800/50 rounded-lg">
            <div className="flex items-center text-sm font-medium text-gray-300">
                <span>{label}</span>
                <div className="relative flex items-center group ml-2">
                    <InformationCircleIcon className="w-4 h-4 text-gray-500 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-3 text-sm text-gray-200 bg-gray-800 border border-gray-600 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
                        {tooltip}
                        <div className="absolute bg-gray-800 border-b border-r border-gray-600 h-2 w-2 left-1/2 -translate-x-1/2 rotate-45 -bottom-1"></div>
                    </div>
                </div>
            </div>
            <span className={`text-lg font-semibold font-mono ${valueColor}`}>{value}</span>
        </li>
    );
};

const LatencyStatsDisplay: React.FC<LatencyStatsDisplayProps> = ({ stats, aiSummary, isGeneratingReport }) => {
  if (!stats) {
    return (
      <div style={{ minHeight: 250 }} className="flex items-center justify-center text-gray-500 bg-gray-800/50 rounded-md">
        No data to display.
      </div>
    );
  }

  const { minResponseTime, avgResponseTime, maxResponseTime, latencyStdDev, latencyCV } = stats;
  
  const getConsistencyColor = (cv: number) => {
    if (cv <= 25) return 'text-green-400';
    if (cv <= 75) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div style={{ minHeight: 250 }} className="flex flex-col">
        <ul className="space-y-2">
            <StatRow 
                label="Min Response Time"
                value={`${minResponseTime.toFixed(0)} ms`}
                tooltip="The fastest single request. This is your application's best-case performance."
                valueColor="text-green-400"
            />
            <StatRow 
                label="Avg Response Time"
                value={`${avgResponseTime.toFixed(0)} ms`}
                tooltip="The average time for all requests. A good starting point, but can be skewed by outliers."
                valueColor="text-blue-400"
            />
             <StatRow 
                label="Max Response Time"
                value={`${maxResponseTime.toFixed(0)} ms`}
                tooltip="The slowest single request. High values indicate bottlenecks or problems under load."
                valueColor="text-red-400"
            />
            <StatRow 
                label="Standard Deviation"
                value={`${latencyStdDev.toFixed(0)} ms`}
                tooltip="Measures the amount of variation from the average. A low number indicates consistent performance."
            />
             <StatRow 
                label="Consistency (CV)"
                value={`${latencyCV.toFixed(1)}%`}
                tooltip="Coefficient of Variation. A percentage-based measure of consistency relative to the average. Lower is better."
                valueColor={getConsistencyColor(latencyCV)}
            />
        </ul>
        <div className="mt-4">
            <AiSummaryBox summary={aiSummary} isLoading={isGeneratingReport} />
        </div>
    </div>
  );
};

export default LatencyStatsDisplay;