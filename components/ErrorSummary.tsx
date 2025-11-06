import React from 'react';
import { XCircleIcon, ExclamationTriangleIcon, CheckCircleIcon } from './icons';
import AiSummaryBox from './AiSummaryBox';
import { StructuredSummary } from '../types';

interface ErrorSummaryProps {
  errorDistribution: { [key: string]: number };
  totalErrors: number;
  aiSummary?: StructuredSummary;
  isGeneratingReport?: boolean;
}

const ErrorSummary: React.FC<ErrorSummaryProps> = ({ errorDistribution, totalErrors, aiSummary, isGeneratingReport }) => {
  if (totalErrors === 0) {
    return (
      <div style={{ minHeight: 250 }} className="flex flex-col items-center justify-center text-gray-500 bg-gray-800/50 rounded-md p-4">
        <CheckCircleIcon className="w-12 h-12 text-green-500 mb-2" />
        <p className="font-semibold">No Errors Recorded</p>
        <p className="text-sm">The application performed flawlessly.</p>
      </div>
    );
  }

  const sortedErrors = Object.entries(errorDistribution).sort(([, a], [, b]) => (b as number) - (a as number));
  const networkErrorCount = errorDistribution['Network Error'] || 0;
  const isServerOverwhelmed = networkErrorCount > 0 && networkErrorCount / totalErrors > 0.5;

  return (
    <div className="flex flex-col space-y-4" style={{ minHeight: 250 }}>
      {isServerOverwhelmed && (
        <div className="p-3 text-sm text-yellow-300 bg-yellow-900/40 border border-yellow-500/50 rounded-lg flex items-start space-x-3">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">High Rate of Network Errors</h4>
            <p className="text-yellow-400/90 mt-1">
              A large number of requests are failing to connect. This is a strong sign that the server is overwhelmed and refusing connections, not an issue with your local network.
            </p>
          </div>
        </div>
      )}
      <ul className="space-y-2 text-sm flex-grow">
        {sortedErrors.map(([error, count]) => {
          const percentage = totalErrors > 0 ? (((count as number) / totalErrors) * 100) : 0;
          return (
            <li key={error} className="p-2.5 bg-gray-800 rounded-md">
              <div className="flex justify-between items-center">
                <span className={`font-mono text-base font-semibold ${error === 'Network Error' ? 'text-yellow-400' : 'text-red-400'}`}>{error}</span>
                <div className="flex items-center space-x-3">
                    <span className="font-semibold text-white">{(count as number).toLocaleString()}</span>
                    <span className="text-xs text-gray-400 w-12 text-right">({percentage.toFixed(1)}%)</span>
                </div>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
                <div 
                  className={`h-1.5 rounded-full ${error === 'Network Error' ? 'bg-yellow-500' : 'bg-red-500'}`} 
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <AiSummaryBox summary={aiSummary} isLoading={isGeneratingReport} />
      </div>
    </div>
  );
};

export default ErrorSummary;