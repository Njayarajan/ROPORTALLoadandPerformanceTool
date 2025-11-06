import React, { useState } from 'react';
import type { TrendAnalysisReport, TestRunSummary } from '../types';
import { XMarkIcon, ScaleIcon, SpinnerIcon, ExclamationTriangleIcon, CheckCircleIcon, InformationCircleIcon, MagnifyingGlassIcon, WrenchIcon, DocumentArrowDownIcon } from './icons';
import { exportTrendAnalysisAsPdf } from '../services/exportService';

interface TrendAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: TrendAnalysisReport | null;
    isLoading: boolean;
    runs: TestRunSummary[];
}

const TrendRunCard: React.FC<{ run: TestRunSummary }> = ({ run }) => {
    const errorRate = (Number(run.stats?.totalRequests) || 0) > 0 ? (((Number(run.stats?.errorCount) || 0) / (Number(run.stats?.totalRequests) || 1)) * 100) : 0;
    const isIterationMode = run.config?.runMode === 'iterations';

    return (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-3">
            {isIterationMode ? (
                <div>
                    <p className="text-lg font-bold text-white">{(Number(run.config?.iterations) || 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">Iterations</span></p>
                    <p className="text-xs text-gray-400">{run.config?.users ?? 'N/A'} Concurrent Users | {run.config?.pacing ?? 'N/A'}ms Pacing</p>
                </div>
            ) : (
                <div>
                    <p className="text-lg font-bold text-white">{run.config?.users ?? 'N/A'} <span className="text-sm font-normal text-gray-400">Peak Users</span></p>
                    <p className="text-xs text-gray-400">{run.config?.duration ?? 'N/A'}s Duration</p>
                </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                    <p className="text-xs text-gray-400">Avg Latency</p>
                    <p className="font-mono text-lg font-semibold text-blue-400">{(Number(run.stats?.avgResponseTime) || 0).toFixed(0)}<span className="text-sm">ms</span></p>
                </div>
                <div>
                    <p className="text-xs text-gray-400">Throughput</p>
                    <p className="font-mono text-lg font-semibold text-green-400">{(Number(run.stats?.throughput) || 0).toFixed(1)}<span className="text-sm">/s</span></p>
                </div>
                <div>
                    <p className="text-xs text-gray-400">Error Rate</p>
                    <p className={`font-mono text-lg font-semibold ${errorRate > 5 ? 'text-red-400' : 'text-gray-300'}`}>{errorRate.toFixed(1)}<span className="text-sm">%</span></p>
                </div>
            </div>
        </div>
    );
};


const TrendAnalysisModal: React.FC<TrendAnalysisModalProps> = ({ isOpen, onClose, report, isLoading, runs }) => {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        if (!report || !runs) return;
        setIsExporting(true);
        try {
            await exportTrendAnalysisAsPdf(report, runs);
        } catch (e) {
            console.error("Failed to export trend analysis PDF:", e);
            alert(`Failed to generate PDF: ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            setIsExporting(false);
        }
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-950/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-gray-900 w-full max-w-4xl rounded-xl border border-gray-700 shadow-2xl flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <ScaleIcon className="w-6 h-6 text-blue-400" />
                        <h2 className="text-lg font-bold text-white">
                            Multi-Test Trend Analysis {report && !isLoading ? `(${report.analyzedRunsCount} Runs)` : ''}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <div className="overflow-y-auto p-6 space-y-8">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                            <SpinnerIcon className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                            <h3 className="text-xl font-bold text-white">Analyzing Trends...</h3>
                            <p className="text-gray-400 mt-2">The AI is processing multiple test runs to identify performance patterns. This may take a moment.</p>
                        </div>
                    ) : !report ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500">
                             <ExclamationTriangleIcon className="w-10 h-10 text-yellow-500 mb-4" />
                             <h3 className="text-xl font-bold text-yellow-400">Analysis Failed</h3>
                             <p className="mt-2">Could not generate a trend report. Please check the console for errors.</p>
                        </div>
                    ) : (
                        <>
                            {/* Executive Summary */}
                            <div className="space-y-3">
                                <h4 className="text-lg font-semibold text-white flex items-center"><MagnifyingGlassIcon className="w-5 h-5 mr-2 text-blue-400"/>Overall Trend Summary</h4>
                                <blockquote className="border-l-4 border-blue-500 pl-4 py-2 bg-gray-800/50 rounded-r-lg">
                                    <p className="text-gray-300 italic">{report.overallTrendSummary || 'Analysis failed to generate an overall summary.'}</p>
                                </blockquote>
                            </div>

                             {/* Performance Threshold */}
                            <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                                <h4 className="text-lg font-semibold text-yellow-300 flex items-center"><ExclamationTriangleIcon className="w-5 h-5 mr-2"/>Performance Threshold</h4>
                                <p className="text-yellow-200 mt-2">{report.performanceThreshold || 'Analysis failed to determine a performance threshold.'}</p>
                            </div>

                            {/* Visual Grid Summary */}
                            <div className="space-y-3">
                                <h4 className="text-lg font-semibold text-white">Visual Summary</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {runs.sort((a, b) => (Number(a.config?.users) || 0) - (Number(b.config?.users) || 0)).map(run => (
                                        <TrendRunCard key={run.id} run={run} />
                                    ))}
                                </div>
                            </div>

                            {/* Key Observations */}
                            <div className="space-y-3">
                                <h4 className="text-lg font-semibold text-white flex items-center"><MagnifyingGlassIcon className="w-5 h-5 mr-2 text-blue-400"/>Key Observations</h4>
                                {report.keyObservations && report.keyObservations.length > 0 ? (
                                    <ol className="list-decimal list-inside space-y-3 text-gray-300 bg-gray-800/50 p-4 rounded-lg">
                                        {report.keyObservations?.map((obs, index) => (
                                            <li key={index} className="pl-2 leading-relaxed">{obs}</li>
                                        ))}
                                    </ol>
                                ) : (
                                    <p className="text-gray-500 italic text-center py-4">No key observations were generated.</p>
                                )}
                            </div>

                            {/* Root Cause & Recommendations */}
                             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg">
                                    <h4 className="text-lg font-semibold text-white flex items-center"><WrenchIcon className="w-5 h-5 mr-2 text-blue-400"/>Suggested Root Cause</h4>
                                    <p className="text-sm text-gray-300">{report.rootCauseSuggestion || 'Analysis failed to generate a root cause suggestion.'}</p>
                                </div>
                                <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg">
                                    <h4 className="text-lg font-semibold text-white flex items-center"><WrenchIcon className="w-5 h-5 mr-2 text-green-400"/>Recommendations</h4>
                                    {report.recommendations && report.recommendations.length > 0 ? (
                                        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
                                            {report.recommendations.map((rec, index) => (
                                                <li key={index} className="pl-2">{rec}</li>
                                            ))}
                                        </ol>
                                    ) : (
                                         <p className="text-gray-500 italic">No recommendations were generated.</p>
                                    )}
                                </div>
                            </div>

                            {/* Conclusive Summary */}
                            {report.conclusiveSummary && (
                                <div className="space-y-3 pt-8 border-t border-gray-700">
                                    <h4 className="text-lg font-semibold text-white flex items-center"><MagnifyingGlassIcon className="w-5 h-5 mr-2 text-indigo-400"/>Conclusive Summary</h4>
                                    <div className="p-4 bg-indigo-900/30 border border-indigo-500/50 rounded-lg">
                                        <p className="text-indigo-200 italic">{report.conclusiveSummary}</p>
                                    </div>
                                </div>
                            )}

                            {/* Data Summary Table */}
                            <div className="space-y-3 pt-8 border-t border-gray-700">
                                <h4 className="text-lg font-semibold text-white">Analyzed Test Runs Data</h4>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm text-left text-gray-400">
                                        <thead className="text-xs text-gray-300 uppercase bg-gray-800">
                                            <tr>
                                                <th scope="col" className="px-4 py-3">Load Profile</th>
                                                <th scope="col" className="px-4 py-3 text-right">Avg Latency (ms)</th>
                                                <th scope="col" className="px-4 py-3 text-right">Min Latency (ms)</th>
                                                <th scope="col" className="px-4 py-3 text-right">Max Latency (ms)</th>
                                                <th scope="col" className="px-4 py-3 text-right">Consistency (CV%)</th>
                                                <th scope="col" className="px-4 py-3 text-right">Throughput (req/s)</th>
                                                <th scope="col" className="px-4 py-3 text-right">Error Rate (%)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700">
                                            {[...runs].sort((a, b) => (Number(a.config?.users) || 0) - (Number(b.config?.users) || 0)).map(run => {
                                                const errorRate = (Number(run.stats?.totalRequests) || 0) > 0 ? (((Number(run.stats?.errorCount) || 0) / (Number(run.stats?.totalRequests) || 1)) * 100) : 0;
                                                const isIterationMode = run.config?.runMode === 'iterations';
                                                return (
                                                    <tr key={run.id} className="hover:bg-gray-800">
                                                        <td className="px-4 py-3 font-medium text-white">
                                                            {isIterationMode ? (
                                                                <div>
                                                                    <p>{(Number(run.config?.iterations) || 0).toLocaleString()} iter.</p>
                                                                    <p className="text-xs font-mono text-gray-400">{run.config?.users ?? 'N/A'} users @ {run.config?.pacing ?? 'N/A'}ms</p>
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    <p>{run.config?.users ?? 'N/A'} users</p>
                                                                    <p className="text-xs font-mono text-gray-400">{run.config?.duration ?? 'N/A'}s duration</p>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-mono">{(Number(run.stats?.avgResponseTime) || 0).toFixed(0)}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-green-400">{(Number(run.stats?.minResponseTime) || 0).toFixed(0)}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-red-400">{(Number(run.stats?.maxResponseTime) || 0).toFixed(0)}</td>
                                                        <td className="px-4 py-3 text-right font-mono">{(Number(run.stats?.latencyCV) || 0).toFixed(1)}</td>
                                                        <td className="px-4 py-3 text-right font-mono">{(Number(run.stats?.throughput) || 0).toFixed(2)}</td>
                                                        <td className={`px-4 py-3 text-right font-mono ${errorRate > 5 ? 'text-red-400' : (errorRate > 0 ? 'text-yellow-400' : 'text-gray-400')}`}>{errorRate.toFixed(1)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <footer className="p-4 flex justify-between items-center border-t border-gray-700 flex-shrink-0">
                    <button
                        onClick={handleExport}
                        disabled={isLoading || !report || isExporting}
                        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition disabled:opacity-50"
                    >
                        {isExporting ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <DocumentArrowDownIcon className="w-5 h-5" />}
                        <span>{isExporting ? 'Exporting...' : 'Export to PDF'}</span>
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition"
                    >
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default TrendAnalysisModal;