import React from 'react';
import { InformationCircleIcon } from './icons';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  subValue?: string;
  icon?: React.ReactNode;
  success?: boolean;
  warning?: boolean;
  error?: boolean;
  tooltipText?: string;
  apdexData?: {
    satisfied: number;
    tolerating: number;
    frustrated: number;
  };
  consistencyData?: {
    min: number;
    max: number;
    avg: number;
    stdDev: number;
    cv: number;
  };
  ttfbData?: {
    min: number;
    max: number;
    avg: number;
  };
}

const ApdexVisual: React.FC<{ data: StatCardProps['apdexData'] }> = ({ data }) => {
    if (!data) return null;
    return (
        <div className="mt-3 space-y-2">
            <div className="w-full flex h-3 rounded-full overflow-hidden bg-gray-700" title="User Satisfaction Breakdown">
                <div className="bg-green-500" style={{ width: `${data.satisfied}%` }} title={`Satisfied: ${data.satisfied.toFixed(1)}%`}></div>
                <div className="bg-yellow-500" style={{ width: `${data.tolerating}%` }} title={`Tolerating: ${data.tolerating.toFixed(1)}%`}></div>
                <div className="bg-red-500" style={{ width: `${data.frustrated}%` }} title={`Frustrated: ${data.frustrated.toFixed(1)}%`}></div>
            </div>
             <div className="flex justify-between text-xs text-gray-400">
                <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-green-500 mr-1.5"></div>Satisfied</span>
                <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-yellow-500 mr-1.5"></div>Tolerating</span>
                <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-red-500 mr-1.5"></div>Frustrated</span>
            </div>
        </div>
    );
};

const ConsistencyVisual: React.FC<{ data: StatCardProps['consistencyData'] }> = ({ data }) => {
    if (!data) return null;

    const range = data.max - data.min;
    if (range <= 0) {
        return <div className="mt-3 h-12"></div>; // Placeholder if no range
    }

    const avgPos = ((data.avg - data.min) / range) * 100;
    const stdDevLower = Math.max(0, ((data.avg - data.stdDev) - data.min) / range) * 100;
    const stdDevUpper = Math.min(100, ((data.avg + data.stdDev) - data.min) / range) * 100;
    const stdDevWidth = stdDevUpper - stdDevLower;

    return (
        <div className="mt-3 space-y-2" title="Response Time Distribution">
            <div className="relative h-4 w-full pt-1">
                <div className="relative h-2 bg-gray-700 rounded-full">
                    <div 
                        className="absolute h-2 bg-blue-500/50 rounded-full"
                        style={{ left: `${stdDevLower}%`, width: `${stdDevWidth}%` }}
                        title={`Bulk of responses (~68%) are between ${(data.avg - data.stdDev).toFixed(0)}ms and ${(data.avg + data.stdDev).toFixed(0)}ms`}
                    ></div>
                    <div 
                        className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-full shadow-md"
                        style={{ left: `calc(${avgPos}% - 2px)` }}
                        title={`Average: ${data.avg.toFixed(0)}ms`}
                    ></div>
                </div>
            </div>
            <div className="flex justify-between text-xs text-gray-400 font-mono">
                <span>{data.min.toFixed(0)}ms</span>
                <span>{data.max.toFixed(0)}ms</span>
            </div>
        </div>
    );
};

const TtfbVisual: React.FC<{ data: StatCardProps['ttfbData'] }> = ({ data }) => {
    if (!data) return null;

    const range = data.max - data.min;
    if (range <= 0) {
        return <div className="mt-3 h-12"></div>; 
    }

    const avgPos = ((data.avg - data.min) / range) * 100;
    
    return (
        <div className="mt-4 space-y-2" title="Server Response Time (Time To First Byte)">
            <p className="text-xs text-gray-400 text-left font-semibold">Server Response Time (TTFB)</p>
            <div className="relative h-4 w-full pt-1">
                <div className="relative h-2 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-full">
                    <div 
                        className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-full shadow-md"
                        style={{ left: `calc(${avgPos}% - 2px)` }}
                        title={`Average: ${data.avg.toFixed(0)}ms`}
                    ></div>
                </div>
            </div>
            <div className="flex justify-between text-xs text-gray-400 font-mono">
                <span>{data.min.toFixed(0)}ms</span>
                <span>{data.max.toFixed(0)}ms</span>
            </div>
        </div>
    );
};


const StatCard: React.FC<StatCardProps> = ({ title, value, description, subValue, icon, success, warning, error, tooltipText, apdexData, consistencyData, ttfbData }) => {
  let valueColor = 'text-white';
  if (success) valueColor = 'text-green-400';
  if (warning) valueColor = 'text-yellow-400';
  if (error) valueColor = 'text-red-400';

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 shadow-md flex flex-col h-full">
      <div className="flex items-center text-gray-400">
        {icon && <span className="w-5 h-5 mr-2 flex-shrink-0">{icon}</span>}
        <p className="text-sm font-medium truncate" title={title}>{title}</p>
        {tooltipText && (
          <div className="relative flex items-center group ml-auto">
            <InformationCircleIcon className="w-4 h-4 text-gray-500 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-sm p-3 text-sm text-gray-200 bg-gray-800 border border-gray-600 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-50 pointer-events-none whitespace-pre-line">
              {tooltipText}
               <div className="absolute bg-gray-800 border-b border-r border-gray-600 h-2 w-2 left-1/2 -translate-x-1/2 rotate-45 -bottom-1"></div>
            </div>
          </div>
        )}
      </div>
      
      <div className="mt-2 flex-grow flex flex-col justify-center">
        <div className="text-center">
            <p className={`text-2xl lg:text-3xl font-bold ${valueColor}`}>{value}</p>
            {subValue && <p className={`text-base font-semibold mt-1 ${valueColor}`}>{subValue}</p>}
        </div>

        {apdexData && <ApdexVisual data={apdexData} />}
        {consistencyData && <ConsistencyVisual data={consistencyData} />}
        {ttfbData && <TtfbVisual data={ttfbData} />}

        {description && <p className="text-xs text-center text-gray-500 mt-2">{description}</p>}
      </div>
    </div>
  );
};

export default StatCard;