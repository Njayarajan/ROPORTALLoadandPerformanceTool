import React, { useState, useEffect, useMemo } from 'react';
import { TestStatus, type TestResultSample, type TestStats, type LoadTestConfig, type PerformanceReport, OperationMode, UnsavedTestRun, FailureAnalysisReport, ResourceSample } from '../types';
import StatCard from './StatCard';
import ResponseTimeChart from './ResponseTimeChart';
import ResultsTable from './ResultsTable';
import PerformanceReportComponent from './PerformanceReport';
import LatencyStatsDisplay from './LatencyDistributionChart';
import ErrorSummary from './ErrorSummary';
import { exportAsCsv, exportAsJson, exportAsPdf } from '../services/exportService';
import { CsvIcon, JsonIcon, DocumentTextIcon, CheckCircleIcon, XCircleIcon, DocumentArrowDownIcon, SpinnerIcon, ChartBarSquareIcon, PresentationChartLineIcon, InformationCircleIcon, ShieldCheckIcon, BeakerIcon, PlayIcon, BoltIcon, ClockIcon, ClipboardDocumentListIcon, UsersIcon, SparklesIcon, ScaleIcon, ChevronDownIcon } from './icons';
import HelpHighlighter from './HelpHighlighter';
import ErrorDistributionChart from './ErrorDistributionChart';
import NetworkTimingAnalysis from './NetworkTimingAnalysis';
import AiSummaryBox from './AiSummaryBox';
import FailureAnalysisReportComponent from './FailureAnalysisReport';
import { getFailureAnalysis } from '../services/geminiService';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Label } from 'recharts';


interface DashboardProps {
  status: TestStatus;
  results: TestResultSample[];
  resourceSamples: ResourceSample[];
  stats: TestStats | null;
  error: string | null;
  progress: number;
  config: LoadTestConfig | null;
  elapsedTime: number;
  shutdownRemainingTime: number | null;
  title: string;
  report: PerformanceReport | null;
  reportError: string | null;
  isGeneratingReport: boolean;
  onGenerateReport: () => void;
  failureAnalysis: FailureAnalysisReport | null;
  isGeneratingFailureAnalysis: boolean;
  onRunDiagnosticTest: () => void;
  onRunRampUpTest: () => void;
  viewingHistoryId: string | null;
  operationMode: OperationMode;
  generatedData: string | null;
  activeHelpTour: string | null;
  currentHelpStep: number | null;
  cachedRun: UnsavedTestRun | null;
  onRetrySave: () => void;
}

const formatTime = (seconds: number) => {
    const flooredSeconds = Math.floor(seconds);
    const mins = Math.floor(flooredSeconds / 60).toString().padStart(2, '0');
    const secs = (flooredSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
};

const DataGenerationDisplay: React.FC<{
    data: string | null;
}> = ({ data }) => {

    const copyToClipboard = () => {
        if (data) {
            navigator.clipboard.writeText(data);
        }
    };
    const downloadJson = () => {
        if (data) {
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `generated-data-${new Date().toISOString()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };
    
    if (data) {
        return (
            <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-lg">
                <div className="p-4 flex justify-between items-center border-b border-gray-700">
                    <h3 className="text-md font-semibold text-white">Generated Data Payload</h3>
                    <div className="flex items-center space-x-2">
                        <button onClick={copyToClipboard} className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition"><ClipboardDocumentListIcon className="w-4 h-4" /><span>Copy</span></button>
                        <button onClick={downloadJson} className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition"><DocumentArrowDownIcon className="w-4 h-4" /><span>Download JSON</span></button>
                    </div>
                </div>
                <pre className="p-4 text-xs font-mono bg-gray-950/50 overflow-auto max-h-[60vh] rounded-b-lg"><code>{data}</code></pre>
            </div>
        );
    }

    return null;
};

const ResourceChart: React.FC<{ data: ResourceSample[]; syncId: string }> = ({ data, syncId }) => {
    const processedData = useMemo(() => {
        return data.map(sample => ({
            timestamp: sample.timestamp,
            cpu: sample.cpu,
            memory: sample.memory,
        }));
    }, [data]);

    return (
        <div style={{ width: '100%', height: 150 }}>
            <ResponsiveContainer>
                <ComposedChart data={processedData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }} syncId={syncId}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                    <XAxis dataKey="timestamp" tickFormatter={() => ''} stroke="#30363d" tickLine={false} />
                    <YAxis yAxisId="left" orientation="left" stroke="#06b6d4" fontSize={12} tick={{ fill: '#06b6d4' }} domain={[0, 100]} unit="%" label={{ value: 'CPU %', angle: -90, position: 'insideLeft', fill: '#06b6d4', dx: -15 }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#d946ef" fontSize={12} tick={{ fill: '#d946ef' }} domain={[0, 100]} unit="%" label={{ value: 'Memory %', angle: 90, position: 'insideRight', fill: '#d946ef', dx: 15 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', fontSize: '12px' }} labelStyle={{ color: '#c9d1d9' }} formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]} labelFormatter={(label: number) => `Time: ${new Date(label).toLocaleTimeString()}`} />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ top: -5 }}/>
                    <Line yAxisId="left" type="monotone" dataKey="cpu" stroke="#06b6d4" strokeWidth={2} dot={false} name="CPU Usage" />
                    <Line yAxisId="right" type="monotone" dataKey="memory" stroke="#d946ef" strokeWidth={2} dot={false} name="Memory Usage" />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

const Dashboard: React.FC<DashboardProps> = (props) => {
  const { status, results, resourceSamples, stats, error, progress, config, elapsedTime, shutdownRemainingTime, title, report, reportError, isGeneratingReport, onGenerateReport, failureAnalysis, isGeneratingFailureAnalysis, onRunDiagnosticTest, onRunRampUpTest, viewingHistoryId, operationMode, generatedData, activeHelpTour, currentHelpStep, cachedRun, onRetrySave } = props;
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [errorView, setErrorView] = useState<'list' | 'chart'>('list');
  const [isNetworkAnalysisOpen, setIsNetworkAnalysisOpen] = useState(false);

  const handleExportPdf = async () => {
    if (stats && config && !isExportingPdf) {
      setIsExportingPdf(true);
      try {
        const chartIdsToExport = ['response-time-chart-container'];
        if (stats.avgNetworkTimings) {
            chartIdsToExport.push('network-timing-chart-for-pdf');
        }
        await exportAsPdf(title, config, stats, chartIdsToExport, report);
      } catch (err) {
        console.error("Failed to export PDF:", err);
        alert(`Failed to generate PDF report: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsExportingPdf(false);
      }
    }
  };
  
  const isDataGenView = operationMode === 'dataGeneration' && generatedData;

  const RecoveryBanner: React.FC = () => (
    <div className="bg-yellow-900/40 border border-yellow-500/50 text-yellow-300 p-4 rounded-lg flex items-center justify-between">
        <div className="flex items-center space-x-3">
            <InformationCircleIcon className="w-6 h-6 flex-shrink-0" />
            <p className="text-sm font-medium">
                A previous test run failed to save. You can attempt to save it again.
            </p>
        </div>
        <button onClick={onRetrySave} className="px-3 py-1.5 text-xs font-medium bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition">
            Retry Save
        </button>
    </div>
  );

  if (status === TestStatus.IDLE && !isDataGenView) {
    return (
        <div className="space-y-6">
            {cachedRun && <RecoveryBanner />}
            <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-gray-900 rounded-lg border-2 border-dashed border-gray-700">
                <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mb-6 border-2 border-blue-500/20"><BoltIcon className="w-10 h-10 text-blue-400" /></div>
                <h3 className="text-3xl font-bold text-white mb-2">Ready to Launch</h3>
                <p className="text-gray-400 max-w-2xl mb-10">Select an operation mode. Run a performance test to find bottlenecks, or switch to data generation to create test datasets.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl">
                <div className="flex flex-col items-center p-4"><div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 border border-gray-700 text-blue-400"><BeakerIcon className="w-8 h-8"/></div><h4 className="font-semibold text-white mb-1">1. Configure</h4><p className="text-sm text-gray-500">Use the panel on the left to set your target, user load, and test duration.</p></div>
                <div className="flex flex-col items-center p-4"><div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 border border-gray-700 text-green-400"><PlayIcon className="w-8 h-8"/></div><h4 className="font-semibold text-white mb-1">2. Simulate</h4><p className="text-sm text-gray-500">Click 'Start Test' to begin. Watch the dashboard update in real-time.</p></div>
                <div className="flex flex-col items-center p-4"><div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 border border-gray-700 text-indigo-400"><PresentationChartLineIcon className="w-8 h-8"/></div><h4 className="font-semibold text-white mb-1">3. Analyze</h4><p className="text-sm text-gray-500">Review metrics, generate an AI-powered report, and export the raw data.</p></div>
                </div>
            </div>
      </div>
    );
  }

  if (operationMode === 'dataGeneration') {
      return <DataGenerationDisplay data={generatedData} />;
  }

  if (status === TestStatus.ERROR) {
    return (
      <div className="space-y-6">
        {cachedRun && !viewingHistoryId && <RecoveryBanner />}
        {isGeneratingFailureAnalysis && <FailureAnalysisReportComponent isLoading={true} />}
        {failureAnalysis && <FailureAnalysisReportComponent analysis={failureAnalysis} onRunDiagnosticTest={onRunDiagnosticTest} onRunRampUpTest={onRunRampUpTest} />}
        <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-red-900/20 border border-red-500 rounded-lg">
            <h3 className="text-2xl font-bold text-red-400 mb-2">Simulation Error</h3>
            <p className="text-gray-400 max-w-lg bg-gray-800 p-4 rounded-md font-mono text-sm">{error}</p>
        </div>
      </div>
    );
  }
  
  if (status === TestStatus.RUNNING && results.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-gray-900 rounded-lg border-2 border-dashed border-gray-700">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <h3 className="text-2xl font-bold text-white mb-2">Simulation Running...</h3>
            <p className="text-gray-400 max-w-md">Waiting for the first data points. This may take a few moments.</p>
            <div className="w-full bg-gray-700 rounded-full h-2.5 mt-6 max-w-md"><div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${progress}%`, transition: 'width 1s linear' }}></div></div>
        </div>
    );
  }

  const getApdexRating = (score: number): { label: string; success?: boolean; warning?: boolean; error?: boolean; } => {
    if (score >= 0.94) return { label: 'Excellent', success: true };
    if (score >= 0.85) return { label: 'Good', success: true };
    if (score >= 0.70) return { label: 'Fair', warning: true };
    if (score >= 0.50) return { label: 'Poor', error: true };
    return { label: 'Unacceptable', error: true };
  };

  const apdexData = stats ? { satisfied: stats.apdexBreakdown.satisfied, tolerating: stats.apdexBreakdown.tolerating, frustrated: stats.apdexBreakdown.frustrated } : undefined;
  const apdexRating = stats ? getApdexRating(stats.apdexScore) : { label: '' };

  const getStabilityRating = (cv: number): { label: string; success?: boolean; warning?: boolean; error?: boolean; } => {
    if (cv <= 25) return { label: 'Stable', success: true };
    if (cv <= 75) return { label: 'Tolerating', warning: true };
    return { label: 'Unstable', error: true };
  };
  const stabilityRating = stats ? getStabilityRating(stats.latencyCV) : { label: '' };

  const consistencyData = stats ? {
    min: stats.minResponseTime,
    max: stats.maxResponseTime,
    avg: stats.avgResponseTime,
    stdDev: stats.latencyStdDev,
    cv: stats.latencyCV
  } : undefined;

  const ttfbData = stats?.ttfbStats ? {
      min: stats.ttfbStats.min,
      max: stats.ttfbStats.max,
      avg: stats.ttfbStats.avg
  } : undefined;

  return (
    <div className="space-y-6">
      {cachedRun && status === TestStatus.COMPLETED && !viewingHistoryId && <RecoveryBanner />}
      {isGeneratingFailureAnalysis && <FailureAnalysisReportComponent isLoading={true} />}
      {failureAnalysis && !isGeneratingFailureAnalysis && <FailureAnalysisReportComponent analysis={failureAnalysis} onRunDiagnosticTest={onRunDiagnosticTest} onRunRampUpTest={onRunRampUpTest} />}

      <HelpHighlighter tourId="dashboard" step={1} activeTourId={activeHelpTour} activeStep={currentHelpStep}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Row 1 */}
          <StatCard icon={<UsersIcon className="w-6 h-6"/>} title="Peak Users" value={config?.users.toLocaleString() ?? 'N/A'} tooltipText="The maximum number of concurrent virtual users active during the test." />
          <StatCard icon={<BoltIcon className="w-6 h-6"/>} title="Throughput" value={stats?.throughput.toFixed(2) ?? 'N/A'} subValue="req/s" tooltipText="The average number of requests completed per second." />
          <StatCard icon={<ClockIcon className="w-6 h-6"/>} title="Avg. Latency" value={stats?.avgResponseTime.toFixed(0) ?? 'N/A'} subValue="ms" tooltipText="The average time taken for a request to complete." />
          <StatCard icon={<XCircleIcon className="w-6 h-6"/>} title="Failed Submissions" value={stats?.errorCount.toLocaleString() ?? 'N/A'} subValue={stats && stats.totalRequests > 0 ? `${((stats.errorCount / stats.totalRequests) * 100).toFixed(1)}% of attempts` : ''} error={(stats?.errorCount ?? 0) > 0} tooltipText="The total number of failed requests." />
          
          {/* Row 2 */}
          <StatCard icon={<ClipboardDocumentListIcon className="w-6 h-6"/>} title="Total Attempts" value={stats?.totalRequests.toLocaleString() ?? 'N/A'} tooltipText="The total number of requests sent during the test." />
          <StatCard icon={<CheckCircleIcon className="w-6 h-6"/>} title="Successful Submissions" value={stats?.successCount.toLocaleString() ?? 'N/A'} subValue={stats && stats.totalRequests > 0 ? `${((stats.successCount / stats.totalRequests) * 100).toFixed(1)}% of attempts` : ''} success={(stats?.errorCount ?? 0) === 0 && (stats?.totalRequests ?? 0) > 0} tooltipText="The total number of successful requests." />
          <StatCard icon={<SparklesIcon className="w-6 h-6"/>} title="Apdex Score" value={stats?.apdexScore.toFixed(2) ?? 'N/A'} subValue={apdexRating.label} {...apdexRating} apdexData={apdexData} tooltipText="Apdex (Application Performance Index) is an industry standard for measuring user satisfaction with application performance. A score of 1.0 is perfect, 0.0 is unacceptable." />
          <StatCard icon={<ScaleIcon className="w-6 h-6"/>} title="API Stability" value={`${stats?.latencyCV.toFixed(1) ?? 'N/A'}%`} subValue={stabilityRating.label} {...stabilityRating} consistencyData={consistencyData} tooltipText="An indicator of performance consistency, derived from latency variation (CV). A lower percentage is better and more stable." />
        </div>
      </HelpHighlighter>
      
      <HelpHighlighter tourId="dashboard" step={2} activeTourId={activeHelpTour} activeStep={currentHelpStep}>
        <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 shadow-md" id="response-time-chart-container">
          <h3 className="text-md font-semibold text-white mb-4 flex items-center"><PresentationChartLineIcon className="w-5 h-5 mr-2 text-blue-400" />Performance Timeline</h3>
          <ResponseTimeChart data={results} config={config} />
          {resourceSamples.length > 0 && <ResourceChart data={resourceSamples} syncId="perfTimeline" />}
        </div>
      </HelpHighlighter>

      {(report || isGeneratingReport || reportError) && (
        <HelpHighlighter tourId="dashboard" step={6} activeTourId={activeHelpTour} activeStep={currentHelpStep}>
          <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 shadow-md">
            {isGeneratingReport ? (
              <div className="flex items-center justify-center space-x-3 text-gray-400 p-8">
                <SpinnerIcon className="w-6 h-6 animate-spin text-blue-500" />
                <span className="font-semibold">The AI is analyzing results and generating your report...</span>
              </div>
            ) : reportError ? (
              <div className="text-red-400 text-center p-8">
                <p className="font-bold">Failed to generate report:</p>
                <p className="text-sm mt-2">{reportError}</p>
              </div>
            ) : report ? (
              <PerformanceReportComponent report={report} title={title} />
            ) : null}
          </div>
        </HelpHighlighter>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HelpHighlighter tourId="dashboard" step={4} activeTourId={activeHelpTour} activeStep={currentHelpStep}>
          <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 shadow-md h-full">
            <h3 className="text-md font-semibold text-white mb-4 flex items-center"><ChartBarSquareIcon className="w-5 h-5 mr-2 text-blue-400"/>Latency Statistics</h3>
            <LatencyStatsDisplay stats={stats} aiSummary={report?.latencySummary} isGeneratingReport={isGeneratingReport} />
          </div>
        </HelpHighlighter>
        <HelpHighlighter tourId="dashboard" step={5} activeTourId={activeHelpTour} activeStep={currentHelpStep}>
          <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 shadow-md h-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-md font-semibold text-white flex items-center"><XCircleIcon className="w-5 h-5 mr-2 text-red-400"/>Error Summary</h3>
              <div className="flex bg-gray-800 p-1 rounded-lg">
                  <button onClick={() => setErrorView('list')} className={`px-2 py-1 text-xs rounded-md ${errorView === 'list' ? 'bg-blue-600 text-white' : 'text-gray-300'}`}>List</button>
                  <button onClick={() => setErrorView('chart')} className={`px-2 py-1 text-xs rounded-md ${errorView === 'chart' ? 'bg-blue-600 text-white' : 'text-gray-300'}`}>Chart</button>
              </div>
            </div>
            {errorView === 'list' ? (
                <ErrorSummary errorDistribution={stats?.errorDistribution ?? {}} totalErrors={stats?.errorCount ?? 0} aiSummary={report?.errorSummary} isGeneratingReport={isGeneratingReport} />
            ) : (
                <ErrorDistributionChart errorDistribution={stats?.errorDistribution ?? {}} />
            )}
          </div>
        </HelpHighlighter>
      </div>

       {stats?.avgNetworkTimings && (
            <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-md">
                <button 
                  onClick={() => setIsNetworkAnalysisOpen(prev => !prev)}
                  className="w-full flex justify-between items-center p-4 text-left"
                  aria-expanded={isNetworkAnalysisOpen}
                >
                    <h3 className="text-md font-semibold text-white flex items-center">
                        <ClockIcon className="w-5 h-5 mr-2 text-blue-400"/>
                        Network Timing Analysis (Averages)
                    </h3>
                    <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isNetworkAnalysisOpen ? 'rotate-180' : ''}`} />
                </button>
                {isNetworkAnalysisOpen && (
                    <div className="p-4 pt-0">
                        <div className="border-t border-gray-700 pt-4">
                            <NetworkTimingAnalysis 
                                timings={stats.avgNetworkTimings} 
                                aiSummary={report?.networkSummary} 
                                isGeneratingReport={isGeneratingReport} 
                            />
                        </div>
                    </div>
                )}
            </div>
        )}

      <HelpHighlighter tourId="dashboard" step={7} activeTourId={activeHelpTour} activeStep={currentHelpStep}>
        <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 shadow-md">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-md font-semibold text-white">Request Log ({results.length.toLocaleString()})</h3>
            <div className="flex items-center space-x-2">
                {status === TestStatus.COMPLETED && !report && !isGeneratingReport && (
                    <button onClick={onGenerateReport} className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition"><SparklesIcon className="w-4 h-4" /><span>Analyze Results</span></button>
                )}
                <button onClick={handleExportPdf} disabled={isExportingPdf} className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition disabled:opacity-50">
                    {isExportingPdf ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <DocumentTextIcon className="w-4 h-4" />}
                    <span>PDF</span>
                </button>
                <button onClick={() => exportAsJson(results)} className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition"><JsonIcon className="w-4 h-4" /><span>JSON</span></button>
                <button onClick={() => exportAsCsv(results)} className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition"><CsvIcon className="w-4 h-4" /><span>CSV</span></button>
            </div>
          </div>
          <ResultsTable results={results} />
        </div>
      </HelpHighlighter>
    </div>
  );
};

export default Dashboard;