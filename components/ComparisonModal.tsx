import React, { useState, useEffect } from 'react';
import type { TestRun, ComparisonAnalysisReport } from '../types';
import { ScaleIcon, XMarkIcon, DocumentArrowDownIcon, SpinnerIcon, ExclamationTriangleIcon, CheckCircleIcon, InformationCircleIcon, SparklesIcon, WrenchIcon, ClipboardDocumentCheckIcon } from './icons';
import ResponseTimeChart from './ResponseTimeChart';
import { exportComparisonAsPdf } from '../services/exportService';
import { getComparisonAnalysis } from '../services/geminiService';

interface ComparisonModalProps {
    runA: TestRun;
    runB: TestRun;
    onClose: () => void;
}

const StatComparisonRow: React.FC<{
    label: string;
    valueA: number | string;
    valueB: number | string;
    unit?: string;
    higherIsBetter?: boolean;
}> = ({ label, valueA, valueB, unit = '', higherIsBetter = false }) => {
    
    let deltaText = '-';
    let deltaColor = 'text-gray-400';
    
    const numA = typeof valueA === 'string' ? parseFloat(valueA) : valueA;
    const numB = typeof valueB === 'string' ? parseFloat(valueB) : valueB;

    if (!isNaN(numA) && !isNaN(numB) && numA !== 0) {
        const delta = numB - numA;
        const percentageChange = (delta / numA) * 100;

        if (Math.abs(percentageChange) < 0.1) {
             deltaText = `~`;
        } else {
            deltaText = `${percentageChange > 0 ? '+' : ''}${percentageChange.toFixed(1)}%`;
            if (percentageChange > 0) {
                deltaColor = higherIsBetter ? 'text-green-400' : 'text-red-400';
            } else if (percentageChange < 0) {
                deltaColor = higherIsBetter ? 'text-red-400' : 'text-green-400';
            }
        }
    }

    return (
        <tr className="border-b border-gray-700">
            <td className="py-3 px-4 text-sm text-gray-300 font-medium">{label}</td>
            <td className="py-3 px-4 text-center font-mono">{valueA}{unit}</td>
            <td className="py-3 px-4 text-center font-mono">{valueB}{unit}</td>
            <td className={`py-3 px-4 text-center font-mono font-bold ${deltaColor}`}>{deltaText}</td>
        </tr>
    );
};

const AnalysisSection: React.FC<{ report: ComparisonAnalysisReport }> = ({ report }) => {
    const getImpactConfig = (impact: 'Positive' | 'Negative' | 'Neutral') => {
        switch (impact) {
            case 'Positive': return { icon: <CheckCircleIcon className="w-5 h-5"/>, color: 'text-green-400', bg: 'bg-green-900/30' };
            case 'Negative': return { icon: <ExclamationTriangleIcon className="w-5 h-5"/>, color: 'text-red-400', bg: 'bg-red-900/30' };
            default: return { icon: <InformationCircleIcon className="w-5 h-5"/>, color: 'text-blue-400', bg: 'bg-blue-900/30' };
        }
    };
    
    return (
        <div className="space-y-6">
            <div>
                <h4 className="text-lg font-semibold text-white flex items-center"><SparklesIcon className="w-5 h-5 mr-2 text-blue-400"/>Executive Summary</h4>
                <blockquote className="mt-2 border-l-4 border-blue-500 pl-4 py-2 bg-gray-800/50 rounded-r-lg">
                    <p className="text-gray-300 italic">{report.comparisonSummary}</p>
                </blockquote>
            </div>

            <div>
                 <h4 className="text-lg font-semibold text-white mb-2">Key Metric Changes</h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {report.keyMetricChanges.map(change => {
                         const { icon, color, bg } = getImpactConfig(change.impact);
                         return (
                            <div key={change.metric} className={`p-4 rounded-lg border flex flex-col ${bg} border-gray-700`}>
                                <div className="flex justify-between items-start">
                                    <h5 className={`font-bold ${color}`}>{change.metric}</h5>
                                    <div className={`flex items-center space-x-2 font-bold text-lg ${color}`}>
                                        {icon}
                                        <span>{change.delta}</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-center my-2 py-2 border-y border-gray-700">
                                    <div><p className="text-xs text-gray-400">Baseline</p><p className="font-mono text-white">{change.baselineValue}</p></div>
                                    <div><p className="text-xs text-gray-400">Comparison</p><p className="font-mono text-white">{change.comparisonValue}</p></div>
                                </div>
                                <p className="text-gray-300 text-sm mt-1 flex-grow">{change.analysis}</p>
                            </div>
                         );
                     })}
                 </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg">
                    <h4 className="text-lg font-semibold text-white flex items-center"><WrenchIcon className="w-5 h-5 mr-2 text-blue-400"/>Root Cause Analysis</h4>
                    <p className="text-sm text-gray-300">{report.rootCauseAnalysis}</p>
                </div>
                 <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg">
                    <h4 className="text-lg font-semibold text-white flex items-center"><ClipboardDocumentCheckIcon className="w-5 h-5 mr-2 text-green-400"/>Recommendations</h4>
                    <ul className="list-decimal list-inside space-y-2 text-sm text-gray-300">
                        {report.recommendations.map((rec, index) => (
                            <li key={index} className="pl-2">{rec}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

const ComparisonModal: React.FC<ComparisonModalProps> = ({ runA, runB, onClose }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [analysis, setAnalysis] = useState<ComparisonAnalysisReport | null>(null);
    const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(true);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    
    useEffect(() => {
        const generateAnalysis = async () => {
            setIsGeneratingAnalysis(true);
            setAnalysisError(null);
            try {
                const report = await getComparisonAnalysis(runA, runB);
                setAnalysis(report);
            } catch (e) {
                 setAnalysisError(e instanceof Error ? e.message : 'Failed to generate AI analysis.');
                 console.error("Failed to generate comparison analysis:", e);
            } finally {
                setIsGeneratingAnalysis(false);
            }
        };
        generateAnalysis();
    }, [runA, runB]);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await exportComparisonAsPdf(runA, runB, ['comparison-chart-a', 'comparison-chart-b'], analysis);
        } catch (e) {
            console.error("Failed to export comparison PDF:", e);
            alert(`Failed to generate PDF: ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            setIsExporting(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-gray-950/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-gray-900 w-full max-w-6xl rounded-xl border border-gray-700 shadow-2xl flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <ScaleIcon className="w-6 h-6 text-blue-400" />
                        <h2 className="text-lg font-bold text-white">Test Run Comparison</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                       <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                
                <div className="overflow-y-auto p-6 space-y-6">
                    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                        <h3 className="text-xl font-bold text-white mb-4">AI-Powered Comparison Analysis</h3>
                        {isGeneratingAnalysis && (
                             <div className="flex flex-col items-center justify-center h-64 text-center">
                                <SpinnerIcon className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                                <h3 className="text-xl font-bold text-white">Comparing Results...</h3>
                                <p className="text-gray-400 mt-2">The AI is analyzing the data from both tests. Please wait.</p>
                            </div>
                        )}
                        {analysisError && (
                             <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500">
                                <ExclamationTriangleIcon className="w-10 h-10 text-yellow-500 mb-4" />
                                <h3 className="text-xl font-bold text-yellow-400">Analysis Failed</h3>
                                <p className="mt-2 max-w-lg">{analysisError}</p>
                            </div>
                        )}
                        {analysis && <AnalysisSection report={analysis} />}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-800/50 p-4 rounded-lg">
                            <h3 className="text-md font-semibold text-white mb-4 text-center truncate" title={runA.title}>
                                Baseline: <span className="font-normal">{runA.title}</span>
                            </h3>
                            <div className="h-64" id="comparison-chart-a">
                                <ResponseTimeChart data={runA.results} config={runA.config} />
                            </div>
                        </div>
                        <div className="bg-gray-800/50 p-4 rounded-lg">
                             <h3 className="text-md font-semibold text-white mb-4 text-center truncate" title={runB.title}>
                                Comparison: <span className="font-normal">{runB.title}</span>
                            </h3>
                             <div className="h-64" id="comparison-chart-b">
                                <ResponseTimeChart data={runB.results} config={runB.config} />
                            </div>
                        </div>
                    </div>

                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-800">
                                <th className="py-3 px-4 text-xs font-semibold uppercase text-gray-400">Metric</th>
                                <th className="py-3 px-4 text-center text-xs font-semibold uppercase text-gray-400" title={runA.title}>
                                    Baseline <span className="text-gray-500 font-normal">({new Date(runA.created_at).toLocaleDateString()})</span>
                                </th>
                                <th className="py-3 px-4 text-center text-xs font-semibold uppercase text-gray-400" title={runB.title}>
                                    Comparison <span className="text-gray-500 font-normal">({new Date(runB.created_at).toLocaleDateString()})</span>
                                </th>
                                <th className="py-3 px-4 text-center text-xs font-semibold uppercase text-gray-400">Delta</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                             <tr className="bg-gray-800/50"><td colSpan={4} className="px-4 py-1.5 text-sm font-semibold text-white">Overall</td></tr>
                            <StatComparisonRow label="Throughput" valueA={runA.stats.throughput.toFixed(2)} valueB={runB.stats.throughput.toFixed(2)} unit="/s" higherIsBetter />
                            <StatComparisonRow label="Apdex Score" valueA={runA.stats.apdexScore.toFixed(2)} valueB={runB.stats.apdexScore.toFixed(2)} higherIsBetter />
                            <StatComparisonRow label="Error Rate" valueA={((runA.stats.errorCount / runA.stats.totalRequests) * 100).toFixed(1)} valueB={((runB.stats.errorCount / runB.stats.totalRequests) * 100).toFixed(1)} unit="%" />

                             <tr className="bg-gray-800/50"><td colSpan={4} className="px-4 py-1.5 text-sm font-semibold text-white">Latency</td></tr>
                            <StatComparisonRow label="Avg. Response Time" valueA={runA.stats.avgResponseTime.toFixed(0)} valueB={runB.stats.avgResponseTime.toFixed(0)} unit=" ms" />
                            <StatComparisonRow label="Min Response Time" valueA={runA.stats.minResponseTime.toFixed(0)} valueB={runB.stats.minResponseTime.toFixed(0)} unit=" ms" />
                            <StatComparisonRow label="Max Response Time" valueA={runA.stats.maxResponseTime.toFixed(0)} valueB={runB.stats.maxResponseTime.toFixed(0)} unit=" ms" />
                            <StatComparisonRow label="Consistency (CV)" valueA={runA.stats.latencyCV.toFixed(1)} valueB={runB.stats.latencyCV.toFixed(1)} unit="%" />

                            <tr className="bg-gray-800/50"><td colSpan={4} className="px-4 py-1.5 text-sm font-semibold text-white">Configuration</td></tr>
                             <tr className="border-b border-gray-700">
                                <td className="py-3 px-4 text-sm text-gray-300 font-medium">Virtual Users</td>
                                <td className="py-3 px-4 text-center font-mono">{runA.config.users}</td>
                                <td className="py-3 px-4 text-center font-mono">{runB.config.users}</td>
                                <td className="py-3 px-4 text-center font-mono">-</td>
                            </tr>
                            <tr className="border-b border-gray-700">
                                <td className="py-3 px-4 text-sm text-gray-300 font-medium">Duration</td>
                                <td className="py-3 px-4 text-center font-mono">{runA.config.duration}s</td>
                                <td className="py-3 px-4 text-center font-mono">{runB.config.duration}s</td>
                                <td className="py-3 px-4 text-center font-mono">-</td>
                            </tr>
                            <tr className="border-b border-gray-700">
                                <td className="py-3 px-4 text-sm text-gray-300 font-medium">Load Profile</td>
                                <td className="py-3 px-4 text-center font-mono capitalize">{runA.config.loadProfile.replace('-', ' ')}</td>
                                <td className="py-3 px-4 text-center font-mono capitalize">{runB.config.loadProfile.replace('-', ' ')}</td>
                                <td className="py-3 px-4 text-center font-mono">-</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                 <footer className="p-4 flex justify-between items-center border-t border-gray-700 flex-shrink-0">
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
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

export default ComparisonModal;