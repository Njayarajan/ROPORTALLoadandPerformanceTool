


import React, { useState, useMemo } from 'react';
import { TestResultSample, NetworkTimings } from '../types';
import { ChevronDownIcon, ChevronRightIcon } from './icons';

interface ResultsTableProps {
  results: TestResultSample[];
}

type SortableKeys = 'timestamp' | 'url' | 'latency' | 'success' | 'statusCode';

const SortableHeader: React.FC<{
  label: string;
  sortKey: SortableKeys;
  sortConfig: { key: SortableKeys; direction: 'asc' | 'desc' } | null;
  setSortConfig: (config: { key: SortableKeys; direction: 'asc' | 'desc' }) => void;
  className?: string;
}> = ({ label, sortKey, sortConfig, setSortConfig, className }) => {
  const isSorted = sortConfig?.key === sortKey;
  const direction = isSorted ? sortConfig.direction : 'desc';

  const handleClick = () => {
    const newDirection = isSorted && direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key: sortKey, direction: newDirection });
  };

  return (
    <th scope="col" className={`px-6 py-3 cursor-pointer hover:bg-gray-700/50 transition-colors ${className}`} onClick={handleClick}>
      <div className="flex items-center">
        <span>{label}</span>
        {isSorted && (
          <span className="ml-1 text-blue-400">
            {direction === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </div>
    </th>
  );
};

// Safely format a string as JSON, falling back to raw text if parsing fails.
const formatBody = (body?: string): string => {
    if (!body) return '';
    try {
        return JSON.stringify(JSON.parse(body), null, 2);
    } catch (e) {
        return body; // It's not valid JSON, so return the raw string.
    }
};

const TimingBarChart: React.FC<{ timings: NetworkTimings }> = ({ timings }) => {
    const total = timings.total > 0 ? timings.total : timings.dns + timings.tcp + timings.tls + timings.ttfb + timings.download;
    const items = [
        { label: 'DNS', value: timings.dns, color: 'bg-purple-500' },
        { label: 'TCP', value: timings.tcp, color: 'bg-orange-500' },
        { label: 'TLS', value: timings.tls, color: 'bg-yellow-500' },
        { label: 'TTFB', value: timings.ttfb, color: 'bg-red-500' },
        { label: 'Download', value: timings.download, color: 'bg-blue-500' },
    ];
    
    return (
        <div className="w-full bg-gray-900 rounded flex h-5 font-mono text-xs text-white overflow-hidden my-2">
            {items.map(item => item.value > 0 && (
                <div 
                    key={item.label}
                    className={`flex items-center justify-center ${item.color}`}
                    style={{ width: `${(item.value / total) * 100}%` }}
                    title={`${item.label}: ${item.value.toFixed(0)}ms`}
                >
                   { (item.value / total) * 100 > 10 && `${item.value.toFixed(0)}ms` }
                </div>
            ))}
        </div>
    );
};


const ResultsTable: React.FC<ResultsTableProps> = ({ results }) => {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'asc' | 'desc' } | null>({ key: 'timestamp', direction: 'desc' });
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure'>('all');
  const [urlFilter, setUrlFilter] = useState('');

  const handleRowClick = (id: string) => {
    setExpandedRowId(currentId => (currentId === id ? null : id));
  };
  
  const sortedAndFilteredResults = useMemo(() => {
    let processedResults = [...results];

    // Filtering
    if (statusFilter !== 'all') {
      const isSuccess = statusFilter === 'success';
      processedResults = processedResults.filter(r => r.success === isSuccess);
    }
    if (urlFilter) {
      processedResults = processedResults.filter(r => r.url.toLowerCase().includes(urlFilter.toLowerCase()));
    }

    // Sorting
    if (sortConfig) {
      processedResults.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return processedResults;
  }, [results, sortConfig, statusFilter, urlFilter]);


  return (
    <div>
        <div className="p-4 bg-gray-800/50 flex items-center space-x-4">
            <div className="flex-grow">
                <label htmlFor="url-filter" className="sr-only">Filter by URL</label>
                <input 
                    id="url-filter"
                    type="text"
                    placeholder="Filter by endpoint..."
                    value={urlFilter}
                    onChange={e => setUrlFilter(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
            </div>
            <div>
                 <label htmlFor="status-filter" className="sr-only">Filter by Status</label>
                 <select
                    id="status-filter"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as 'all' | 'success' | 'failure')}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                 >
                    <option value="all">All Statuses</option>
                    <option value="success">Success</option>
                    <option value="failure">Failure</option>
                 </select>
            </div>
        </div>
        <div className="overflow-x-auto max-h-[30rem]">
            <table className="min-w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-300 uppercase bg-gray-800 sticky top-0 z-10">
                <tr>
                    <th scope="col" className="px-4 py-3 w-12"></th>
                    <SortableHeader label="Time" sortKey="timestamp" sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    <SortableHeader label="Endpoint" sortKey="url" sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    <SortableHeader label="Latency (ms)" sortKey="latency" sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    <SortableHeader label="Status" sortKey="success" sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    <SortableHeader label="Code" sortKey="statusCode" sortConfig={sortConfig} setSortConfig={setSortConfig} />
                </tr>
                </thead>
                <tbody>
                {sortedAndFilteredResults.map((result) => (
                    <React.Fragment key={result.id}>
                    <tr 
                        className="bg-gray-900 border-b border-gray-700 hover:bg-gray-800 cursor-pointer"
                        onClick={() => handleRowClick(result.id)}
                        aria-expanded={expandedRowId === result.id}
                    >
                        <td className="px-4 py-3 text-center">
                        <span className="inline-block text-gray-500">
                            {expandedRowId === result.id ? <ChevronDownIcon className="w-4 h-4"/> : <ChevronRightIcon className="w-4 h-4"/>}
                        </span>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">{new Date(result.timestamp).toLocaleTimeString()}</td>
                        <td className="px-6 py-3 font-mono text-xs whitespace-nowrap">{result.url ? new URL(result.url).pathname : '-'}</td>
                        <td className="px-6 py-3">{result.latency}</td>
                        <td className="px-6 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${result.success ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                            {result.success ? 'Success' : 'Failure'}
                        </span>
                        </td>
                        <td className="px-6 py-3">{result.statusCode > 0 ? `${result.statusCode} ${result.statusText}` : result.statusText}</td>
                    </tr>
                    {expandedRowId === result.id && (
                        <tr className="bg-gray-800/50">
                        <td colSpan={6} className="p-0">
                            <div className="px-6 py-4 text-xs font-mono">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                    <div className="md:col-span-2 bg-blue-900/20 border border-blue-500/30 rounded p-2 mb-2">
                                        <p className="font-sans font-semibold text-blue-300 mb-1">Trace ID (X-Request-ID)</p>
                                        <p className="text-white select-all">{result.id}</p>
                                    </div>
                                    <div>
                                        <p className="font-sans font-semibold text-gray-300 mb-1">Request Details</p>
                                        <p><span className="text-gray-500">Method:</span> {result.method}</p>
                                        <p><span className="text-gray-500">Full URL:</span> {result.url}</p>
                                        <p><span className="text-gray-500">Timestamp:</span> {new Date(result.timestamp).toISOString()}</p>
                                    </div>
                                     <div>
                                        <p className="font-sans font-semibold text-gray-300 mb-1">Response Details</p>
                                        <p><span className="text-gray-500">HTTP Code:</span> {result.statusCode}</p>
                                        <p><span className="text-gray-500">Status Text:</span> {result.statusText}</p>
                                        <p><span className="text-gray-500">Latency:</span> {result.latency} ms</p>
                                    </div>
                                    
                                    {result.networkTimings && (
                                        <div className="md:col-span-2">
                                            <p className="font-sans font-semibold text-gray-300 mb-1">Network Timing Breakdown</p>
                                            <TimingBarChart timings={result.networkTimings} />
                                        </div>
                                    )}

                                    {result.requestBody && (
                                        <div className="md:col-span-2">
                                            <p className="font-sans font-semibold text-gray-300 mb-1">Request Body</p>
                                            <pre className="mt-1 p-2 bg-gray-900 rounded text-gray-300 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                                                {formatBody(result.requestBody)}
                                            </pre>
                                        </div>
                                    )}

                                    {(result.errorDetails || result.responseBody) && (
                                        <div className="md:col-span-2">
                                            {result.errorDetails && (
                                                <>
                                                    <p className="font-sans font-semibold text-red-400 mb-1">Error Details</p>
                                                    <pre className="mt-1 p-2 bg-gray-900 rounded text-red-300 whitespace-pre-wrap break-all">
                                                        {result.errorDetails}
                                                    </pre>
                                                </>
                                            )}
                                            {result.responseBody && (
                                                 <>
                                                    <p className={`font-sans font-semibold text-gray-300 mt-2 mb-1`}>Response Body Snippet</p>
                                                    <pre className="mt-1 p-2 bg-gray-900 rounded text-gray-300 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                                                        {result.responseBody}
                                                    </pre>
                                                 </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </td>
                        </tr>
                    )}
                    </React.Fragment>
                ))}
                </tbody>
            </table>
            {sortedAndFilteredResults.length === 0 && (
                 <div className="text-center py-8 text-gray-500">
                    No results match your current filters.
                 </div>
            )}
        </div>
    </div>
  );
};

export default ResultsTable;
