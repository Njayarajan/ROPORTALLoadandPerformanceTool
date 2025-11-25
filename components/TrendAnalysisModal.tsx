
import React, { useState, useMemo } from 'react';
import type { TrendAnalysisReport, TestRunSummary, TestStats, LoadTestConfig, TrendCategoryResult } from '../types';
import { XMarkIcon, ScaleIcon, SpinnerIcon, ExclamationTriangleIcon, CheckCircleIcon, InformationCircleIcon, MagnifyingGlassIcon, WrenchIcon, DocumentArrowDownIcon, ChartBarSquareIcon, SparklesIcon, BoltIcon, GlobeAltIcon, WordIcon, PrinterIcon } from './icons';
import { exportTrendAnalysisAsPdf, exportTrendAnalysisAsDocx } from '../services/exportService';
import { refineTrendAnalysis } from '../services/geminiService';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';

interface TrendAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: TrendAnalysisReport | null;
    isLoading: boolean;
    runs: TestRunSummary[];
    onUpdateReport?: (newReport: TrendAnalysisReport) => void;
}

const GradingLegend: React.FC = () => {
    return (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3 text-xs text-center">
            <div className="bg-green-900/20 border border-green-500/30 p-2 rounded">
                <strong className="text-green-400 block mb-1">A (90-100)</strong>
                Near-Perfect Reliability ({'>'}99.5%)
            </div>
            <div className="bg-blue-900/20 border border-blue-500/30 p-2 rounded">
                <strong className="text-blue-400 block mb-1">B (80-89)</strong>
                Excellent Reliability ({'>'}98%)
            </div>
            <div className="bg-yellow-900/20 border border-yellow-500/30 p-2 rounded">
                <strong className="text-yellow-400 block mb-1">C (70-79)</strong>
                Good Reliability ({'>'}95%)
            </div>
            <div className="bg-orange-900/20 border border-orange-500/30 p-2 rounded">
                <strong className="text-orange-400 block mb-1">D (60-69)</strong>
                Fair Reliability ({'>'}90%)
            </div>
            <div className="bg-red-900/20 border border-red-500/30 p-2 rounded">
                <strong className="text-red-400 block mb-1">F (0-59)</strong>
                Poor Reliability ({'<'}90%)
            </div>
        </div>
    );
};

const TrendRunCard: React.FC<{ run: TestRunSummary }> = ({ run }) => {
    const stats = run.stats as TestStats | undefined;
    const config = run.config as LoadTestConfig | undefined;
    
    const totalRequests = Number(stats?.totalRequests) || 0;
    const successCount = Number(stats?.successCount) || 0;
    const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 0;
    
    const peakUsers = config?.users || 0;
    const isIterationMode = config?.runMode === 'iterations';
    const pacing = config?.pacing || 0;
    const loadProfile = config?.loadProfile || 'ramp-up';
    const isApiRun = config?.method !== 'GET' && config?.method !== 'HEAD';

    const profileDetailText = loadProfile === 'stair-step' 
        ? `Step: +${config?.stepUsers ?? 0} every ${config?.stepDuration ?? 0}s` 
        : `Ramp: ${config?.rampUp ?? 0}s`;

    return (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4 shadow-sm hover:border-gray-600 transition-colors">
            
            {/* Header: Configuration Highlights */}
            <div className="flex justify-between items-start border-b border-gray-700 pb-3">
                <div className="flex flex-col space-y-1">
                    <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isApiRun ? 'bg-indigo-900 text-indigo-200 border border-indigo-500/30' : 'bg-teal-900 text-teal-200 border border-teal-500/30'}`}>
                            {isApiRun ? <BoltIcon className="w-3 h-3 mr-1" /> : <GlobeAltIcon className="w-3 h-3 mr-1" />}
                            {isApiRun ? 'API' : 'Web'}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config?.loadProfile === 'stair-step' ? 'bg-purple-900 text-purple-200' : 'bg-blue-900 text-blue-200'}`}>
                            {isIterationMode ? 'Iterations' : (config?.loadProfile === 'stair-step' ? 'Stair Step' : 'Ramp Up')}
                        </span>
                    </div>
                    <span className="text-xs text-gray-300 font-medium truncate max-w-[200px]">{run.title}</span>
                </div>
                <div className="text-right">
                    <p className="text-xs text-gray-500">{new Date(run.created_at).toLocaleDateString()}</p>
                </div>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-1 gap-3">
                <div className="bg-gray-900/30 p-4 rounded border border-gray-700/50">
                    <p className="text-xs font-bold text-gray-300 uppercase">Peak Concurrent Users</p>
                    <div className="flex items-baseline space-x-1 mt-1 mb-2">
                        <span className="text-3xl font-bold text-white">{peakUsers}</span>
                        <span className="text-xs text-gray-500">users</span>
                    </div>
                    
                    {/* NEW: Configuration Sub-section */}
                    <div className="border-t border-gray-700/50 pt-2 mt-1 grid grid-cols-2 gap-2 text-[10px] text-gray-400">
                        <div>
                            <span className="block uppercase tracking-wider text-gray-600">Pacing</span>
                            <span className="text-gray-300 font-mono">{pacing}ms</span>
                            <span className="ml-1 text-gray-500">({pacing > 500 ? 'Realistic' : 'Aggressive'})</span>
                        </div>
                        <div className="text-right">
                            <span className="block uppercase tracking-wider text-gray-600">Profile</span>
                            <span className="text-gray-300">{profileDetailText}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-900/30 p-4 rounded border border-gray-700/50">
                    <p className="text-xs font-bold text-gray-300 uppercase">Successful Submissions</p>
                    <div className="flex items-baseline justify-between mb-2 mt-1">
                        <span className="text-2xl font-bold text-green-400">{successCount.toLocaleString()}</span>
                        <span className="text-xs text-gray-400">{successRate.toFixed(1)}% of attempts</span>
                    </div>
                    <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-500 ${successRate > 99.5 ? 'bg-green-500' : (successRate > 95 ? 'bg-yellow-500' : 'bg-red-500')}`} 
                            style={{width: `${successRate}%`}} 
                        />
                    </div>
                </div>
            </div>

            {/* Secondary Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-700/50">
                <div>
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Avg Latency</p>
                    <p className="text-lg font-mono font-semibold text-blue-400">
                        {(Number(stats?.avgResponseTime) || 0).toFixed(0)}<span className="text-xs text-gray-500 ml-1">ms</span>
                    </p>
                </div>
                <div>
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Throughput</p>
                    <p className="text-lg font-mono font-semibold text-green-400">
                        {(Number(stats?.throughput) || 0).toFixed(1)}<span className="text-xs text-gray-500 ml-1">/s</span>
                    </p>
                </div>
            </div>
        </div>
    );
};

const TrendScoreCard: React.FC<{ data: TrendCategoryResult, title: string, icon?: React.ReactNode }> = ({ data, title, icon }) => {
    const { grade, score, direction, rationale } = data;
    
    let colorClass = 'text-gray-400';
    let bgClass = 'bg-gray-800';
    let borderClass = 'border-gray-700';

    if (grade === 'A') { colorClass = 'text-green-400'; bgClass = 'bg-green-900/20'; borderClass = 'border-green-500/50'; }
    else if (grade === 'B') { colorClass = 'text-blue-400'; bgClass = 'bg-blue-900/20'; borderClass = 'border-blue-500/50'; }
    else if (grade === 'C') { colorClass = 'text-yellow-400'; bgClass = 'bg-yellow-900/20'; borderClass = 'border-yellow-500/50'; }
    else { colorClass = 'text-red-400'; bgClass = 'bg-red-900/20'; borderClass = 'border-red-500/50'; }

    const directionIcon = direction === 'Improving' ? '↗' : direction === 'Degrading' ? '↘' : '→';

    return (
        <div className={`p-6 rounded-lg border ${borderClass} ${bgClass} flex flex-col gap-6 flex-1 min-w-[300px]`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-white font-semibold text-lg">
                    {icon}
                    <h3>{title}</h3>
                </div>
            </div>
            
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-full border-4 ${borderClass.replace('/50','')} flex items-center justify-center bg-gray-900/50`}>
                        <span className={`text-3xl font-bold ${colorClass}`}>{grade}</span>
                    </div>
                    <div>
                        <div className={`text-xl font-bold ${colorClass} flex items-center gap-2`}>
                            {direction} <span className="text-2xl">{directionIcon}</span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">Score: {score}/100</p>
                    </div>
                </div>
            </div>
            
            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50 text-sm text-gray-300">
                <strong className="text-white block mb-1 text-xs uppercase tracking-wider">Rationale:</strong>
                {rationale}
            </div>
        </div>
    );
};

const TrendChart: React.FC<{ runs: TestRunSummary[], title: string, filterType: 'api' | 'web' }> = ({ runs, title, filterType }) => {
    const sortedRuns = useMemo(() => {
        return [...runs]
            .filter(r => {
                const isGet = r.config?.method === 'GET' || r.config?.method === 'HEAD';
                return filterType === 'web' ? isGet : !isGet;
            })
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map((run, index) => ({
                name: `Run ${index + 1}`,
                date: new Date(run.created_at).toLocaleString(),
                avgLatency: Math.round(Number(run.stats?.avgResponseTime) || 0),
                throughput: Number((Number(run.stats?.throughput) || 0).toFixed(2)),
            }));
    }, [runs, filterType]);

    if (sortedRuns.length === 0) return null;

    return (
        <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 w-full">
            <h4 className="text-sm font-semibold text-white mb-4 flex items-center">
                <ChartBarSquareIcon className="w-5 h-5 mr-2 text-blue-400"/>
                {title} (Latency & Throughput)
            </h4>
            <div style={{ width: '100%', height: 250 }} id={`trend-analysis-chart-${filterType}`}>
                <ResponsiveContainer>
                    <ComposedChart data={sortedRuns} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tick={{ fill: '#9ca3af' }} />
                        <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft', fill: '#3b82f6', dx: 5 }} />
                        <YAxis yAxisId="right" orientation="right" stroke="#10b981" label={{ value: 'Throughput (req/s)', angle: 90, position: 'insideRight', fill: '#10b981', dx: -5 }} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                            labelStyle={{ color: '#fff' }}
                            labelFormatter={(label, payload) => payload[0]?.payload.date || label}
                        />
                        <Legend verticalAlign="top" height={36}/>
                        <Line yAxisId="left" type="monotone" dataKey="avgLatency" name="Avg Latency" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}}>
                            <LabelList dataKey="avgLatency" position="top" fill="#93c5fd" fontSize={10} formatter={(val: number) => `${val}ms`} />
                        </Line>
                        <Line yAxisId="right" type="monotone" dataKey="throughput" name="Throughput" stroke="#10b981" strokeWidth={3} dot={{r: 4}}>
                            <LabelList dataKey="throughput" position="bottom" fill="#86efac" fontSize={10} formatter={(val: number) => `${val}/s`} />
                        </Line>
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const RefineDialog: React.FC<{
    onClose: () => void;
    onRefine: (instruction: string) => void;
    isRefining: boolean;
}> = ({ onClose, onRefine, isRefining }) => {
    const [instruction, setInstruction] = useState('');

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-white mb-2 flex items-center">
                    <SparklesIcon className="w-5 h-5 mr-2 text-blue-400" />
                    Refine Report with AI
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                    Tell the AI how you want to change the report. It will re-analyze the data with your instructions.
                </p>
                <textarea
                    className="w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none mb-4 resize-none"
                    rows={4}
                    placeholder="e.g., 'Make the tone more professional', 'Focus on the high error rate in run 3', 'Shorten the summary'."
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    disabled={isRefining}
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} disabled={isRefining} className="px-3 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 rounded-md transition">
                        Cancel
                    </button>
                    <button 
                        onClick={() => onRefine(instruction)} 
                        disabled={isRefining || !instruction.trim()} 
                        className="flex items-center justify-center px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition disabled:opacity-50"
                    >
                        {isRefining ? <SpinnerIcon className="w-4 h-4 animate-spin mr-2" /> : <SparklesIcon className="w-4 h-4 mr-2" />}
                        {isRefining ? 'Refining...' : 'Update Report'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const TrendAnalysisModal: React.FC<TrendAnalysisModalProps> = ({ isOpen, onClose, report, isLoading, runs, onUpdateReport }) => {
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isExportingDocx, setIsExportingDocx] = useState(false);
    const [isRefineOpen, setIsRefineOpen] = useState(false);
    const [isRefining, setIsRefining] = useState(false);

    const handleExportPdf = async () => {
        if (!report || !runs) return;
        setIsExportingPdf(true);
        try {
            // Capture main charts container
            await exportTrendAnalysisAsPdf(report, runs, 'trend-analysis-chart-container');
        } catch (e) {
            console.error("Failed to export trend analysis PDF:", e);
            alert(`Failed to generate PDF: ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            setIsExportingPdf(false);
        }
    };

    const handleExportDocx = async () => {
        if (!report || !runs) return;
        setIsExportingDocx(true);
        try {
            await exportTrendAnalysisAsDocx(report, runs, 'trend-analysis-chart-container');
        } catch (e) {
            console.error("Failed to export trend analysis DOCX:", e);
            alert(`Failed to generate Word document: ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            setIsExportingDocx(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleRefine = async (instruction: string) => {
        if (!report) return;
        setIsRefining(true);
        try {
            const updatedReport = await refineTrendAnalysis(report, instruction, runs);
            if (onUpdateReport) {
                onUpdateReport(updatedReport);
                alert("Report updated successfully based on your instructions.");
            }
            setIsRefineOpen(false);
        } catch (e) {
            console.error("Failed to refine report:", e);
            alert(`Failed to refine report: ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            setIsRefining(false);
        }
    };
    
    if (!isOpen) return null;

    const hasApiTrend = !!report?.apiTrend;
    const hasWebTrend = !!report?.webTrend;

    return (
        <div className="fixed inset-0 bg-gray-950/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                id="trend-analysis-modal-content"
                className="bg-gray-900 w-full max-w-6xl rounded-xl border border-gray-700 shadow-2xl flex flex-col max-h-[95vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <ScaleIcon className="w-6 h-6 text-blue-400" />
                        <h2 className="text-lg font-bold text-white">
                            Multi-Test Trend Analysis {report && !isLoading ? `(${report.analyzedRunsCount} Runs)` : ''}
                        </h2>
                    </div>
                    <div id="trend-analysis-modal-header-actions" className="flex items-center gap-2">
                        {report && !isLoading && (
                            <>
                                <button 
                                    onClick={handlePrint}
                                    className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition"
                                >
                                    <PrinterIcon className="w-4 h-4" />
                                    <span>Print</span>
                                </button>
                                <button 
                                    onClick={() => setIsRefineOpen(true)} 
                                    className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-blue-900/30 hover:bg-blue-800/50 text-blue-300 border border-blue-500/30 rounded-md transition"
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    <span>Edit with AI</span>
                                </button>
                            </>
                        )}
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>
                </header>

                <div className="overflow-y-auto p-6 space-y-8">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                            <SpinnerIcon className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                            <h3 className="text-xl font-bold text-white">Analyzing Trends...</h3>
                            <p className="text-gray-400 mt-2">The AI is processing test runs, separating API (Backend) and Web (Frontend) metrics.</p>
                        </div>
                    ) : !report ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500">
                             <ExclamationTriangleIcon className="w-10 h-10 text-yellow-500 mb-4" />
                             <h3 className="text-xl font-bold text-yellow-400">Analysis Failed</h3>
                             <p className="mt-2">Could not generate a trend report. Please check the console for errors.</p>
                        </div>
                    ) : (
                        <>
                            {/* 1. Dual Scorecards & Legend */}
                            <div className="flex flex-col gap-6">
                                <div className="flex flex-wrap gap-6">
                                    {hasApiTrend && (
                                        <TrendScoreCard 
                                            data={report.apiTrend!} 
                                            title="API Performance (Backend)" 
                                            icon={<BoltIcon className="w-6 h-6 text-indigo-400" />} 
                                        />
                                    )}
                                    {hasWebTrend && (
                                        <TrendScoreCard 
                                            data={report.webTrend!} 
                                            title="Web Performance (Frontend)" 
                                            icon={<GlobeAltIcon className="w-6 h-6 text-teal-400" />} 
                                        />
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 mb-2 uppercase font-semibold tracking-wider text-center">Grading Legend (Reliability Focus)</p>
                                    <GradingLegend />
                                </div>
                            </div>

                            {/* 2. Visual Charts - Split - Changed to flex-col to prevent squashing */}
                            <div className="flex flex-col gap-8" id="trend-analysis-chart-container">
                                {hasApiTrend && <TrendChart runs={runs} title="API Trend" filterType="api" />}
                                {hasWebTrend && <TrendChart runs={runs} title="Web Trend" filterType="web" />}
                            </div>

                            {/* 3. Executive Summary */}
                            <div className="space-y-3">
                                <h4 className="text-lg font-semibold text-white flex items-center"><MagnifyingGlassIcon className="w-5 h-5 mr-2 text-blue-400"/>Overall Trend Summary</h4>
                                <blockquote className="border-l-4 border-blue-500 pl-4 py-2 bg-gray-800/50 rounded-r-lg">
                                    <p className="text-gray-300 italic">{report.overallTrendSummary || 'Analysis failed to generate an overall summary.'}</p>
                                </blockquote>
                            </div>

                             {/* 4. Performance Threshold */}
                            <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                                <h4 className="text-lg font-semibold text-yellow-300 flex items-center"><ExclamationTriangleIcon className="w-5 h-5 mr-2"/>Performance Threshold</h4>
                                <p className="text-yellow-200 mt-2">{report.performanceThreshold || 'Analysis failed to determine a performance threshold.'}</p>
                            </div>

                            {/* 5. Visual Grid Summary */}
                            <div className="space-y-3">
                                <h4 className="text-lg font-semibold text-white">Run-by-Run Snapshot</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {runs.sort((a, b) => (Number(a.config?.users) || 0) - (Number(b.config?.users) || 0)).map(run => (
                                        <TrendRunCard key={run.id} run={run} />
                                    ))}
                                </div>
                            </div>

                            {/* 6. Key Observations */}
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

                            {/* 7. Root Cause & Recommendations */}
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

                            {/* 8. Conclusive Summary */}
                            {report.conclusiveSummary && (
                                <div className="space-y-3 pt-8 border-t border-gray-700">
                                    <h4 className="text-lg font-semibold text-white flex items-center"><MagnifyingGlassIcon className="w-5 h-5 mr-2 text-indigo-400"/>Conclusive Summary</h4>
                                    <div className="p-4 bg-indigo-900/30 border border-indigo-500/50 rounded-lg">
                                        <p className="text-indigo-200 italic">{report.conclusiveSummary}</p>
                                    </div>
                                </div>
                            )}

                            {/* 9. Data Summary Table - IMPROVED */}
                            <div className="space-y-3 pt-8 border-t border-gray-700">
                                <h4 className="text-lg font-semibold text-white">Analyzed Test Runs Data</h4>
                                <div className="overflow-x-auto rounded-lg border border-gray-700">
                                    <table className="min-w-full text-sm text-left text-gray-400">
                                        <thead className="text-xs text-gray-300 uppercase bg-gray-800">
                                            <tr>
                                                <th scope="col" className="px-4 py-3 w-1/6">Type</th>
                                                <th scope="col" className="px-4 py-3 w-1/6">Method</th>
                                                <th scope="col" className="px-4 py-3 w-1/4">Title</th>
                                                <th scope="col" className="px-4 py-3">Profile</th>
                                                <th scope="col" className="px-4 py-3 text-right">Avg Latency</th>
                                                <th scope="col" className="px-4 py-3 text-right">Throughput</th>
                                                <th scope="col" className="px-4 py-3 text-right">Error Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700">
                                            {[...runs].sort((a, b) => (Number(a.config?.users) || 0) - (Number(b.config?.users) || 0)).map(run => {
                                                const errorRate = (Number(run.stats?.totalRequests) || 0) > 0 ? (((Number(run.stats?.errorCount) || 0) / (Number(run.stats?.totalRequests) || 1)) * 100) : 0;
                                                const isIterationMode = run.config?.runMode === 'iterations';
                                                const isApi = run.config?.method !== 'GET' && run.config?.method !== 'HEAD';
                                                
                                                return (
                                                    <tr key={run.id} className="hover:bg-gray-800/50 transition-colors">
                                                        <td className="px-4 py-3 align-middle">
                                                            <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded text-xs font-bold ${isApi ? 'bg-indigo-900 text-indigo-300' : 'bg-teal-900 text-teal-300'}`}>
                                                                {isApi ? 'API' : 'Web'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 align-middle">
                                                            <span className="text-xs font-mono font-semibold text-gray-500 uppercase">{run.config?.method}</span>
                                                        </td>
                                                        <td className="px-4 py-3 align-middle font-medium text-white truncate max-w-[200px]" title={run.title}>
                                                            {run.title}
                                                        </td>
                                                        <td className="px-4 py-3 align-middle font-medium text-gray-300">
                                                            {isIterationMode ? (
                                                                <div>
                                                                    <p>{(Number(run.config?.iterations) || 0).toLocaleString()} iter.</p>
                                                                    <p className="text-xs font-mono text-gray-500">{run.config?.users ?? 'N/A'} users</p>
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    <p>{run.config?.users ?? 'N/A'} users</p>
                                                                    <p className="text-xs font-mono text-gray-500">{run.config?.duration ?? 'N/A'}s</p>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 align-middle text-right font-mono text-blue-400">{(Number(run.stats?.avgResponseTime) || 0).toFixed(0)}ms</td>
                                                        <td className="px-4 py-3 align-middle text-right font-mono text-green-400">{(Number(run.stats?.throughput) || 0).toFixed(2)}/s</td>
                                                        <td className={`px-4 py-3 align-middle text-right font-mono font-bold ${errorRate > 5 ? 'text-red-500' : (errorRate > 0 ? 'text-yellow-500' : 'text-gray-500')}`}>{errorRate.toFixed(1)}%</td>
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
                    <div id="trend-analysis-modal-header-actions" className="flex gap-3">
                        <button
                            onClick={handleExportPdf}
                            disabled={isLoading || !report || isExportingPdf || isExportingDocx}
                            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition disabled:opacity-50"
                        >
                            {isExportingPdf ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <DocumentArrowDownIcon className="w-5 h-5" />}
                            <span>{isExportingPdf ? 'Exporting...' : 'Export to PDF'}</span>
                        </button>
                        <button
                            onClick={handleExportDocx}
                            disabled={isLoading || !report || isExportingPdf || isExportingDocx}
                            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium bg-blue-700 hover:bg-blue-600 text-white rounded-md transition disabled:opacity-50"
                        >
                            {isExportingDocx ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <WordIcon className="w-5 h-5" />}
                            <span>{isExportingDocx ? 'Exporting...' : 'Export to Word'}</span>
                        </button>
                    </div>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition"
                    >
                        Close
                    </button>
                </footer>
            </div>
            {isRefineOpen && (
                <RefineDialog 
                    onClose={() => setIsRefineOpen(false)} 
                    onRefine={handleRefine} 
                    isRefining={isRefining} 
                />
            )}
        </div>
    );
};

export default TrendAnalysisModal;
