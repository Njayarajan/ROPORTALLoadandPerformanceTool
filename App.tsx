import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { TestStatus, type LoadTestConfig, type TestResultSample, type TestStats, type PerformanceReport, type ParsedApiData, type TestRun, type UsageLimits, AppUser, ApiSpecMetadata, OperationMode, SavedUrl, TestRunSummary, SystemStatusState, NetworkTimings, UnsavedTestRun, SavedHeaderSet, ValidationStatus, FailureAnalysisReport, TrendAnalysisReport, ResourceSample } from './types';
import { ConfigPanel } from './components/ConfigPanel';
import Dashboard from './components/Dashboard';
// FIX: Import runLoadTest to make it available for starting a performance test.
import { getAnalysis, getFailureAnalysis, getTrendAnalysis, runLoadTest, getComparisonAnalysis } from './services/geminiService';
import { Header } from './components/Header';
import Footer from './components/Footer';
import { parseOpenApiSpec } from './services/apiService';
import { getApiSpecContent, getApiSpecsMetadata } from './services/apiSpecService';
import { useAuth } from './auth/AuthContext';
import LoginScreen from './components/LoginScreen';
import HistoryPanel from './components/HistoryPanel';
import { saveTestRun, getTestHistory, deleteTestRun, getTestRunDetails } from './services/historyService';
import { getUsageLimits, checkSupabaseConnection } from './services/configService';
import AdminPanel from './components/AdminPanel';
import { useDebugActions } from './components/DebugContext';
import DebugPanel from './components/DebugPanel';
import ComparisonModal from './components/ComparisonModal';
import TrendAnalysisModal from './components/TrendAnalysisModal';
import UrlManagerModal from './components/UrlManagerModal';
import { getSavedUrls } from './services/urlService';
import useSystemStatus from './hooks/useSystemStatus';
import DatabaseScriptsModal from './components/DatabaseScriptsModal';
import ApiSpecManager from './components/ApiSpecManager';
import HelpGuidePanel from './components/HelpGuidePanel';
import { getHeaderSets } from './services/payloadService';
import { CheckCircleIcon, ClipboardDocumentListIcon, DocumentArrowDownIcon, SpinnerIcon, StopIcon, XCircleIcon, XMarkIcon, KeyIcon } from './components/icons';
import AccountSettingsModal from './components/AccountSettingsModal';


const ValidationLogModal: React.FC<{
    status: ValidationStatus;
    logs: string[];
    payload: string | null;
    onClose: () => void;
    onStop: () => void;
    onUsePayload: (payload: string) => void;
    title: string;
}> = ({ status, logs, payload, onClose, onStop, onUsePayload, title }) => {
    const [copied, setCopied] = useState(false);
    const logContainerRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const handleCopy = () => {
        if (payload) {
            navigator.clipboard.writeText(payload);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };
    
    const handleDownload = () => {
        if (payload) {
            const blob = new Blob([payload], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `generated-payload-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    const statusConfig = {
        running: { icon: <SpinnerIcon className="w-6 h-6 animate-spin text-blue-400" />, title: title, color: 'text-blue-400' },
        stopping: { icon: <SpinnerIcon className="w-6 h-6 animate-spin text-yellow-400" />, title: 'Stopping Process...', color: 'text-yellow-400' },
        success: { icon: <CheckCircleIcon className="w-6 h-6 text-green-400" />, title: 'Validation Successful!', color: 'text-green-400' },
        failed: { icon: <XCircleIcon className="w-6 h-6 text-red-400" />, title: 'Process Failed', color: 'text-red-400' },
        stopped: { icon: <StopIcon className="w-6 h-6 text-yellow-400" />, title: 'Process Stopped', color: 'text-yellow-400' },
    };

    return (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-gray-900 w-full max-w-3xl rounded-xl border border-gray-700 shadow-2xl flex flex-col max-h-[80vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className={`text-lg font-bold flex items-center ${statusConfig[status].color}`}>
                        {statusConfig[status].icon}
                        <span className="ml-3">{statusConfig[status].title}</span>
                    </h3>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <pre ref={logContainerRef} className="flex-grow overflow-y-auto p-4 text-xs font-mono whitespace-pre-wrap text-gray-300">
                    {logs.join('\n')}
                </pre>
                <footer className="p-4 border-t border-gray-700 flex justify-between items-center">
                    <div>
                        {status === 'running' ? (
                             <button onClick={() => onStop()} className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition flex items-center space-x-2"><StopIcon className="w-5 h-5"/><span>Stop</span></button>
                        ) : status === 'stopping' ? (
                             <button disabled className="px-4 py-2 text-sm font-medium bg-yellow-600/50 text-white rounded-md transition flex items-center space-x-2 cursor-not-allowed"><SpinnerIcon className="w-5 h-5 animate-spin"/><span>Stopping...</span></button>
                        ) : payload ? (
                            <div className="flex items-center space-x-2">
                                <button onClick={handleCopy} className="px-4 py-2 text-sm font-medium bg-gray-600 hover:bg-gray-500 text-white rounded-md transition flex items-center space-x-2">
                                    <ClipboardDocumentListIcon className="w-4 h-4" />
                                    <span>{copied ? 'Copied!' : 'Copy Payload'}</span>
                                </button>
                                <button onClick={handleDownload} className="px-4 py-2 text-sm font-medium bg-gray-600 hover:bg-gray-500 text-white rounded-md transition flex items-center space-x-2">
                                    <DocumentArrowDownIcon className="w-4 h-4" />
                                    <span>Download JSON</span>
                                </button>
                                {(status === 'success' || status === 'stopped') && <button onClick={() => onUsePayload(payload)} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition">Use This Data</button>}
                            </div>
                        ) : null}
                    </div>
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition">Close</button>
                </footer>
            </div>
        </div>
    );
};

const FeedbackModal: React.FC<{
    type: 'success' | 'error';
    message: string;
    onClose: () => void;
}> = ({ type, message, onClose }) => {
    const isSuccess = type === 'success';
    return (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-gray-900 w-full max-w-md rounded-xl border border-gray-700 shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 text-center">
                    {isSuccess ? 
                        <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-4" /> :
                        <XCircleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    }
                    <h3 className={`text-lg font-bold ${isSuccess ? 'text-white' : 'text-red-400'}`}>
                        {isSuccess ? 'Success' : 'Error'}
                    </h3>
                    <p className="text-sm text-gray-400 mt-2 whitespace-pre-wrap">{message}</p>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-b-xl flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition">
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};

const TokenRefreshModal: React.FC<{
    isOpen: boolean;
    newToken: string;
    setNewToken: (token: string) => void;
    onRerunWithNew: () => void;
    onRerunWithExisting: () => void;
    onClose: () => void;
}> = ({ isOpen, newToken, setNewToken, onRerunWithNew, onRerunWithExisting, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-gray-900 w-full max-w-lg rounded-xl border border-gray-700 shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-lg font-bold flex items-center text-white">
                        <KeyIcon className="w-6 h-6 text-yellow-400 mr-3"/>
                        Update Authentication Token
                    </h3>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-400">This test was originally run with an authentication token. Tokens often expire. Please provide an updated token or proceed with the existing one.</p>
                    <div>
                        <label htmlFor="rerun-token" className="block text-sm font-medium text-gray-300 mb-1">Bearer Token</label>
                        <textarea
                            id="rerun-token"
                            rows={4}
                            value={newToken}
                            onChange={(e) => setNewToken(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-blue-500"
                            placeholder="Paste your new token here..."
                        />
                    </div>
                </div>
                <footer className="p-4 bg-gray-800/50 rounded-b-xl flex justify-between items-center">
                    <button onClick={onRerunWithExisting} className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 rounded-md transition">
                        Rerun with Existing Token
                    </button>
                    <div className="flex items-center space-x-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white rounded-md transition">
                            Cancel
                        </button>
                        <button onClick={onRerunWithNew} disabled={!newToken} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition disabled:opacity-50">
                            Update and Rerun
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};


const App: React.FC = () => {
  // --- State Management ---
  
  // Auth & User State
  const { user, isTestMode, logout: supabaseLogout } = useAuth();
  const [mockUser, setMockUser] = useState<AppUser | null>(null);
  const currentUser = user || mockUser; // Use real user if available, otherwise fall back to mock user.
  const isMockUser = currentUser?.id === 'test-user-id';
  
  // App Mode State
  const [operationMode, setOperationMode] = useState<OperationMode>('performance');

  // Performance Test State
  const [title, setTitle] = useState('RO-PORTAL Load & Performance Test');
  const [status, setStatus] = useState<TestStatus>(TestStatus.IDLE);
  const [results, setResults] = useState<TestResultSample[]>([]);
  const [resourceSamples, setResourceSamples] = useState<ResourceSample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentConfig, setCurrentConfig] = useState<LoadTestConfig | null>(null);
  const [shutdownRemainingTime, setShutdownRemainingTime] = useState<number | null>(null);
  
  // Data Generation State
  const [generatedData, setGeneratedData] = useState<string | null>(null);

  // Report State
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [failureAnalysis, setFailureAnalysis] = useState<FailureAnalysisReport | null>(null);
  const [isGeneratingFailureAnalysis, setIsGeneratingFailureAnalysis] = useState(false);
  const [failureAnalysisError, setFailureAnalysisError] = useState<string | null>(null);
  const [trendAnalysisReport, setTrendAnalysisReport] = useState<TrendAnalysisReport | null>(null);
  const [isGeneratingTrendAnalysis, setIsGeneratingTrendAnalysis] = useState(false);
  const [trendAnalysisRuns, setTrendAnalysisRuns] = useState<TestRunSummary[]>([]);
  
  // API Spec State
  const [apiSpecs, setApiSpecs] = useState<ApiSpecMetadata[]>([]);
  const [currentlyLoadedSpec, setCurrentlyLoadedSpec] = useState<ApiSpecMetadata | null>(null);
  const [apiData, setApiData] = useState<ParsedApiData | null>(null);
  const [rawApiSpec, setRawApiSpec] = useState<any>(null);
  const [isApiLoading, setIsApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Panel & UI State
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false);
  const [isUrlManagerOpen, setIsUrlManagerOpen] = useState(false);
  const [isDbScriptsModalOpen, setIsDbScriptsModalOpen] = useState(false);
  const [isApiSpecManagerOpen, setIsApiSpecManagerOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isTrendAnalysisModalOpen, setIsTrendAnalysisModalOpen] = useState(false);
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  const [configToRerun, setConfigToRerun] = useState<LoadTestConfig | null>(null);
  const [comparisonRuns, setComparisonRuns] = useState<[TestRun, TestRun] | null>(null);

  // History State
  const [history, setHistory] = useState<TestRunSummary[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyDetailsLoading, setHistoryDetailsLoading] = useState<Record<string, boolean>>({});
  
  // URL Management State
  const [savedUrls, setSavedUrls] = useState<SavedUrl[]>([]);
  
  // Header Set State
  const [savedHeaderSets, setSavedHeaderSets] = useState<SavedHeaderSet[]>([]);
  
  // Usage Limits State
  const [usageLimits, setUsageLimits] = useState<UsageLimits | null>(null);

  // Data Loss Prevention State
  const [cachedRun, setCachedRun] = useState<UnsavedTestRun | null>(null);
  const [hasSavedCurrentRun, setHasSavedCurrentRun] = useState(false);
  
  // System Status State
  const { systemStatus, runChecks: rerunSystemChecks } = useSystemStatus(currentlyLoadedSpec);

  // Interactive Help Tour State
  const [activeHelpTour, setActiveHelpTour] = useState<string | null>(null);
  const [currentHelpStep, setCurrentHelpStep] = useState<number | null>(null);
  
  // Lifted Modal State
  const [validationModalState, setValidationModalState] = useState({ isOpen: false, status: 'running' as ValidationStatus, logs: [] as string[], payload: null as string | null, title: '' });
  const [feedbackModalState, setFeedbackModalState] = useState<{ isOpen: boolean, type: 'success' | 'error', message: string }>({ isOpen: false, type: 'success', message: '' });
  const [tokenRefreshState, setTokenRefreshState] = useState<{
    isOpen: boolean;
    runToRerun: TestRunSummary | null;
    newToken: string;
  }>({ isOpen: false, runToRerun: null, newToken: '' });

  // Refs
  const statusRef = useRef(status);
  const timerRef = useRef<number | null>(null);
  const shutdownTimerRef = useRef<number | null>(null);
  const softStopControllerRef = useRef<AbortController | null>(null);
  const hardStopControllerRef = useRef<AbortController | null>(null);
  const resultsBatchRef = useRef<TestResultSample[]>([]);
  const resourceSamplesBatchRef = useRef<ResourceSample[]>([]);
  const batchUpdateTimerRef = useRef<number | null>(null);
  const wasLoggedIn = useRef(!!currentUser);
  const configGetterRef = useRef<(() => LoadTestConfig | null) | null>(null);
  const validationAbortControllerRef = useRef<AbortController | null>(null);
  const onUsePayloadRef = useRef<(payload: string) => void>(() => {});


  const { log, updateLiveState } = useDebugActions();
  
  useEffect(() => {
      updateLiveState('App Status', status);
      updateLiveState('Results Count', results.length);
      updateLiveState('Current User', currentUser ? currentUser.email : 'null');
      updateLiveState('Error', error);
  }, [status, results.length, currentUser, error, updateLiveState]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  
  // --- Handlers & Callbacks ---
  
  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (batchUpdateTimerRef.current) clearInterval(batchUpdateTimerRef.current);
    if (shutdownTimerRef.current) clearInterval(shutdownTimerRef.current);
    timerRef.current = null;
    batchUpdateTimerRef.current = null;
    shutdownTimerRef.current = null;
  }, []);
  
  const handleReset = useCallback((actionId?: string) => {
      log('ACTION', 'handleReset called to clear application state.', undefined, actionId);
      softStopControllerRef.current?.abort();
      hardStopControllerRef.current?.abort();
      clearTimers();
      
      // Performance test state
      setStatus(TestStatus.IDLE);
      log('STATE', 'Status set to IDLE', undefined, actionId);
      setResults([]);
      setResourceSamples([]);
      log('STATE', 'Results cleared', undefined, actionId);
      setError(null);
      setProgress(0);
      setElapsedTime(0);
      setCurrentConfig(null);
      setReport(null);
      setReportError(null);
      setIsGeneratingReport(false);
      setViewingHistoryId(null);
      setConfigToRerun(null);
      setTitle('RO-PORTAL Load & Performance Test');
      setShutdownRemainingTime(null);
      setFailureAnalysis(null);
      setIsGeneratingFailureAnalysis(false);
      setFailureAnalysisError(null);
      setHasSavedCurrentRun(false); // Reset save flag for new run
      
      // Data generation state
      setGeneratedData(null);
      
      // API spec state is intentionally NOT reset here.
      // A loaded spec should persist across test runs. It's only cleared
      // when a user explicitly loads a new one or logs out.
      // setApiData(null);
      // setRawApiSpec(null);
      // setCurrentlyLoadedSpec(null);
      // setApiError(null);
  }, [clearTimers, log]);

  const registerConfigGetter = useCallback((getter: () => LoadTestConfig | null) => {
      configGetterRef.current = getter;
  }, []);

  const appLogout = useCallback(async (actionId: string) => {
    log('ACTION', 'appLogout function initiated.', undefined, actionId);
    
    // Save current config before logging out
    const configToSave = configGetterRef.current ? configGetterRef.current() : null;
    if (configToSave) {
        try {
            localStorage.setItem('unsavedConfig', JSON.stringify(configToSave));
            log('INFO', 'Unsaved config saved to localStorage on logout.');
        } catch (e) {
            log('ERROR', 'Failed to save config on logout.', { error: e });
        }
    }

    if (mockUser) {
        log('INFO', 'User is a mock user. Clearing mock user state.', undefined, actionId);
        setMockUser(null);
    } else if (supabaseLogout) {
        log('INFO', 'User is a real user. Calling Supabase logout.', undefined, actionId);
        await supabaseLogout(actionId);
    }
  }, [mockUser, supabaseLogout, log]);

  // --- Effects ---
  
  useEffect(() => {
      if (wasLoggedIn.current && !currentUser) {
          handleReset('user-logout-effect');
      }
      wasLoggedIn.current = !!currentUser;
  }, [currentUser, handleReset]);

  useEffect(() => {
    const savedLogo = localStorage.getItem('customLogo');
    if (savedLogo) setCustomLogo(savedLogo);

    try {
        const cached = localStorage.getItem('cachedTestRun');
        if (cached) {
            setCachedRun(JSON.parse(cached));
        }
    } catch (e) {
        console.error("Failed to load cached test run from localStorage", e);
        localStorage.removeItem('cachedTestRun');
    }

    try {
        const unsavedConfig = localStorage.getItem('unsavedConfig');
        if (unsavedConfig) {
            setConfigToRerun(JSON.parse(unsavedConfig));
            localStorage.removeItem('unsavedConfig'); // Clear after loading
        }
    } catch (e) {
        console.error("Failed to load unsaved config from localStorage", e);
        localStorage.removeItem('unsavedConfig');
    }
  }, []);
  
  const loadSavedUrls = useCallback(() => {
    const urls = getSavedUrls();
    setSavedUrls(urls);
  }, []);

  useEffect(() => {
    loadSavedUrls();
  }, [loadSavedUrls]);


  const loadHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    // Do not clear the main error here, as it might be showing a more critical app-level error
    try {
        const historyData = await getTestHistory();
        setHistory(historyData);
    } catch (error: any) {
        const errorMessage = error?.message || '';
        const isAuthError = errorMessage.includes('Invalid Refresh Token') || errorMessage.includes('JWT expired') || error?.status === 401;

        if (isAuthError) {
            console.warn("Authentication error while fetching history. Forcing logout.", error);
            appLogout(crypto.randomUUID());
        } else {
            console.error("Failed to load test history:", errorMessage);
            setError(`Failed to load test history:\n${errorMessage}`);
        }
    } finally {
        setIsHistoryLoading(false);
    }
  }, [appLogout]);
  
  const loadHeaderSets = useCallback(async () => {
    if (isMockUser) return;
    try {
        const sets = await getHeaderSets();
        setSavedHeaderSets(sets);
    } catch (err: any) {
        const errorMessage = err?.message || '';
        const isAuthError = errorMessage.includes('Invalid Refresh Token') || 
                            errorMessage.includes('JWT expired') || 
                            err?.status === 401;

        if (isAuthError) {
            console.warn("Authentication error while fetching header sets. Forcing logout.", err);
            appLogout(crypto.randomUUID());
        } else {
            // Log other, non-auth errors but don't show a blocking UI error for this non-critical feature.
            console.error("Failed to load header sets:", err);
        }
    }
  }, [isMockUser, appLogout]);

  const loadApiSpecs = useCallback(async () => {
    try {
        const specs = await getApiSpecsMetadata();
        setApiSpecs(specs);
    } catch (err) {
        console.error("Failed to load API specs:", err);
    }
  }, [appLogout]);


  useEffect(() => {
    const fetchUserData = async () => {
      if (currentUser) {
        const isMockUser = currentUser.id === 'test-user-id';
        
        if (!isMockUser) {
            // FIX: Wrap initial data loads in a try-catch to prevent unhandled promise rejections
            // from crashing the application (causing a blank screen).
            try {
                await loadHistory();
                await loadHeaderSets();
                await loadApiSpecs();
            } catch (err) {
                console.error("A critical error occurred during initial data load.", err);
                // The individual functions will set a more specific error message if they fail.
            }
        }
        
        try {
          const role = currentUser.profile?.role || 'user';
          const limits = await getUsageLimits(role);
          setUsageLimits(limits);
        } catch (err: any) {
           const errorMessage = err?.message || '';
           const isAuthError = errorMessage.includes('Invalid Refresh Token') || errorMessage.includes('JWT expired') || err?.status === 401;
           if (isAuthError) {
               console.warn("Authentication error while fetching usage limits. Forcing logout.", err);
               appLogout(crypto.randomUUID());
           } else {
               console.error("Failed to fetch usage limits:", err);
               setError(`Failed to fetch usage limits: ${errorMessage}`);
               const failsafeLimits: UsageLimits = { role: 'default', max_users: 50, max_duration: 60, max_ramp_up: 30, min_pacing: 1000 };
               setUsageLimits(failsafeLimits);
           }
        }
      }
    };
    fetchUserData();
  }, [currentUser, appLogout]);

  const stats: TestStats | null = useMemo(() => {
    if (results.length === 0) return null;

    let successCount = 0;
    let totalLatency = 0;
    let minResponseTime = Infinity;
    let maxResponseTime = -Infinity;
    const APDEX_T = 500;
    let satisfiedCount = 0;
    let toleratingCount = 0;
    
    let networkTimingsSamples = 0;
    const totalNetworkTimings: Omit<NetworkTimings, 'total'> & { total: number } = { dns: 0, tcp: 0, tls: 0, ttfb: 0, download: 0, total: 0 };


    for (const r of results) {
        if (r.success) {
            successCount++;
            if (r.latency <= APDEX_T) satisfiedCount++;
            else if (r.latency <= 4 * APDEX_T) toleratingCount++;
        }
        totalLatency += r.latency;
        minResponseTime = Math.min(minResponseTime, r.latency);
        maxResponseTime = Math.max(maxResponseTime, r.latency);
        
        if (r.networkTimings) {
            networkTimingsSamples++;
            totalNetworkTimings.dns += r.networkTimings.dns;
            totalNetworkTimings.tcp += r.networkTimings.tcp;
            totalNetworkTimings.tls += r.networkTimings.tls;
            totalNetworkTimings.ttfb += r.networkTimings.ttfb;
            totalNetworkTimings.download += r.networkTimings.download;
            totalNetworkTimings.total += r.networkTimings.total;
        }
    }
    
    const totalSamples = results.length;
    const frustratedCount = totalSamples > 0 ? totalSamples - satisfiedCount - toleratingCount : 0;
    const apdexBreakdown = {
        satisfied: totalSamples > 0 ? (satisfiedCount / totalSamples) * 100 : 0,
        tolerating: totalSamples > 0 ? (toleratingCount / totalSamples) * 100 : 0,
        frustrated: totalSamples > 0 ? (frustratedCount / totalSamples) * 100 : 0,
    };

    const avgResponseTime = results.length > 0 ? totalLatency / results.length : 0;
    let sumOfSquaredDifferences = 0;
    for (const r of results) sumOfSquaredDifferences += Math.pow(r.latency - avgResponseTime, 2);
    const latencyStdDev = results.length > 0 ? Math.sqrt(sumOfSquaredDifferences / results.length) : 0;
    const latencyCV = avgResponseTime > 0 ? (latencyStdDev / avgResponseTime) * 100 : 0;
    const errorCount = results.length - successCount;
    const totalDurationInSeconds = (results.length > 1) ? (results[results.length - 1].timestamp - results[0].timestamp) / 1000 : 0;
    const errorDistribution = results.filter(r => !r.success).reduce((acc, r) => {
        let key = r.statusCode > 0 ? `HTTP ${r.statusCode} (${r.statusText})` : (r.errorDetails?.includes('aborted') ? 'Request Timeout' : (r.errorDetails?.includes('Failed to fetch') ? 'Network Error' : 'Unknown Error'));
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number });
      
    const avgNetworkTimings = networkTimingsSamples > 0 ? {
        dns: totalNetworkTimings.dns / networkTimingsSamples,
        tcp: totalNetworkTimings.tcp / networkTimingsSamples,
        tls: totalNetworkTimings.tls / networkTimingsSamples,
        ttfb: totalNetworkTimings.ttfb / networkTimingsSamples,
        download: totalNetworkTimings.download / networkTimingsSamples,
        total: totalNetworkTimings.total / networkTimingsSamples,
    } : undefined;

    const ttfbValues = results
        .map(r => r.networkTimings?.ttfb)
        .filter((ttfb): ttfb is number => ttfb !== undefined && ttfb >= 0);

    let ttfbStats: TestStats['ttfbStats'] | undefined = undefined;
    if (ttfbValues.length > 0) {
        const avgTtfb = ttfbValues.reduce((a, b) => a + b, 0) / ttfbValues.length;
        const minTtfb = Math.min(...ttfbValues);
        const maxTtfb = Math.max(...ttfbValues);
        const ttfbStdDev = Math.sqrt(ttfbValues.map(x => Math.pow(x - avgTtfb, 2)).reduce((a, b) => a + b) / ttfbValues.length);
        ttfbStats = {
            min: minTtfb,
            max: maxTtfb,
            avg: avgTtfb,
            stdDev: ttfbStdDev
        };
    }

    return { totalRequests: results.length, successCount, errorCount, totalLatency, avgResponseTime, minResponseTime: minResponseTime === Infinity ? 0 : minResponseTime, maxResponseTime: maxResponseTime === -Infinity ? 0 : maxResponseTime, throughput: totalDurationInSeconds > 0 ? results.length / totalDurationInSeconds : 0, errorDistribution, latencyStdDev, latencyCV, apdexScore: results.length > 0 ? (satisfiedCount + toleratingCount / 2) / results.length : 0, apdexBreakdown, avgNetworkTimings, ttfbStats };
  }, [results]);

    useEffect(() => {
        const shouldAnalyze = 
            (status === TestStatus.COMPLETED || status === TestStatus.ERROR) &&
            stats && 
            stats.errorCount > 0 && 
            currentConfig && 
            !failureAnalysis &&
            !isGeneratingFailureAnalysis &&
            !failureAnalysisError &&
            !viewingHistoryId;

        if (shouldAnalyze) {
            const runAnalysis = async () => {
                setIsGeneratingFailureAnalysis(true);
                setFailureAnalysisError(null);
                try {
                    const analysis = await getFailureAnalysis(currentConfig, stats, error);
                    setFailureAnalysis(analysis);
                } catch (e) {
                    console.error("Failed to generate failure analysis:", e);
                    setFailureAnalysisError(e instanceof Error ? e.message : 'Unknown error');
                } finally {
                    setIsGeneratingFailureAnalysis(false);
                }
            };
            runAnalysis();
        }
    }, [status, stats, currentConfig, error, viewingHistoryId, failureAnalysis, isGeneratingFailureAnalysis, failureAnalysisError]);

  useEffect(() => {
      const saveResults = async () => {
          const isMockUser = currentUser?.id === 'test-user-id';
          if (status === TestStatus.COMPLETED && stats && currentConfig && currentUser && !isMockUser && !viewingHistoryId && !hasSavedCurrentRun) {
              setHasSavedCurrentRun(true); // Prevent this from running again for the same test
              const resultsToSave = results.map(r => {
                  if (r.success && r.responseBody) {
                      const { responseBody, ...rest } = r;
                      return rest;
                  }
                  return r;
              });
              
              const runToSave: UnsavedTestRun = {
                  user_id: currentUser.id,
                  title,
                  status: stats.errorCount > 0 ? 'ERROR' : 'COMPLETED',
                  config: currentConfig,
                  stats,
                  results: resultsToSave,
                  report,
                  api_spec_id: currentlyLoadedSpec?.id || null,
                  resource_samples: resourceSamples,
              };

              // Cache the results before attempting to save
              try {
                  localStorage.setItem('cachedTestRun', JSON.stringify(runToSave));
              } catch (e) {
                   console.error("Could not cache test run results:", e);
              }

              try {
                  const newRun = await saveTestRun(runToSave);
                  const { results: _, ...newRunSummary } = newRun;
                  setHistory(prev => [newRunSummary, ...prev.filter(r => r.id !== newRun.id)]);
                  // Clear cache on success
                  localStorage.removeItem('cachedTestRun');
                  setCachedRun(null);
              } catch (error: any) {
                  console.error("Failed to save test run:", error);
                  const errorMessage = error?.message || '';
                  const isAuthError = errorMessage.includes('Invalid Refresh Token') || errorMessage.includes('JWT expired') || error?.status === 401;
                  if (isAuthError) {
                      console.warn("Authentication error while saving test run. Forcing logout.", error);
                      appLogout(crypto.randomUUID());
                  } else {
                      setError(`Failed to save test run. Your results are cached in this browser and can be recovered after a refresh.`);
                      setCachedRun(runToSave);
                  }
              }
          }
      };
      saveResults();
  }, [status, stats, currentConfig, currentUser, results, report, title, viewingHistoryId, appLogout, currentlyLoadedSpec, hasSavedCurrentRun, resourceSamples]);
  
  const handleBypassLogin = useCallback(() => {
      const mockTestUser: AppUser = {
          id: 'test-user-id',
          email: 'test-user@example.com',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          profile: {
              id: 'test-user-id',
              email: 'test-user@example.com',
              role: 'admin',
          },
      };
      setMockUser(mockTestUser);
  }, []);

    const handleLoadSpec = useCallback(async (spec: ApiSpecMetadata) => {
        setIsApiLoading(true);
        setApiError(null);
        setApiData(null);
        setRawApiSpec(null);
        try {
            const specContent = await getApiSpecContent(spec.storage_path);
            const { parsedData, rawSpec } = parseOpenApiSpec(specContent);
            setApiData(parsedData);
            setRawApiSpec(rawSpec);
            setCurrentlyLoadedSpec(spec);
        } catch (err) {
            setApiError(err instanceof Error ? err.message : 'Failed to load and parse the selected API spec.');
            setCurrentlyLoadedSpec(null);
        } finally {
            setIsApiLoading(false);
        }
    }, []);

  const handleLogoChange = (logoDataUrl: string) => {
    setCustomLogo(logoDataUrl);
    localStorage.setItem('customLogo', logoDataUrl);
  };
  
  const handleStartTest = useCallback(async (config: LoadTestConfig) => {
    handleReset('start-performance-test');
    setStatus(TestStatus.RUNNING);
    setCurrentConfig(config);

    const softController = new AbortController();
    const hardController = new AbortController();
    softStopControllerRef.current = softController;
    hardStopControllerRef.current = hardController;

    const startTime = Date.now();
    const gracefulShutdownMillis = (config.gracefulShutdown || 20) * 1000;

    if (config.runMode === 'duration') {
        timerRef.current = window.setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed >= config.duration) {
                setStatus(TestStatus.FINISHING);
                softController.abort();
                
                setShutdownRemainingTime(config.gracefulShutdown || 20);
                shutdownTimerRef.current = window.setInterval(() => {
                    setShutdownRemainingTime(prev => {
                        if (prev === null || prev <= 1) {
                            if (shutdownTimerRef.current) {
                                clearInterval(shutdownTimerRef.current);
                                shutdownTimerRef.current = null;
                            }
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);

                setTimeout(() => {
                    if (!hardController.signal.aborted) {
                        hardController.abort();
                    }
                }, gracefulShutdownMillis);
                
                setElapsedTime(config.duration);
                setProgress(100);
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
            } else {
                setElapsedTime(elapsed);
                setProgress((elapsed / config.duration) * 100);
            }
        }, 1000);
    } else { // 'iterations' mode
        timerRef.current = window.setInterval(() => {
            setElapsedTime((Date.now() - startTime) / 1000);
        }, 1000);
    }

    batchUpdateTimerRef.current = window.setInterval(() => {
        if (resultsBatchRef.current.length > 0) {
            setResults(prevResults => {
                const newResults = [...prevResults, ...resultsBatchRef.current];
                if (config.runMode === 'iterations') {
                    const newProgress = Math.min(100, (newResults.length / config.iterations) * 100);
                    setProgress(newProgress);
                }
                resultsBatchRef.current = [];
                return newResults;
            });
        }
        if (resourceSamplesBatchRef.current.length > 0) {
            setResourceSamples(prevSamples => [...prevSamples, ...resourceSamplesBatchRef.current]);
            resourceSamplesBatchRef.current = [];
        }
    }, 500);

    try {
      await runLoadTest(
          config, 
          (result) => resultsBatchRef.current.push(result), 
          (sample) => resourceSamplesBatchRef.current.push(sample),
          softController.signal, 
          hardController.signal
      );
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during the test.';
      setError(errorMessage);
      setStatus(TestStatus.ERROR);
    } finally {
        // FIX: The original finalization logic had a race condition where the last batch of results could be missed
        // if the live-update timer ran at the exact same time as the test finished.
        // This new logic robustly stops the timer and then performs one final, authoritative flush of the batch refs,
        // guaranteeing 100% of results are collected and counted.
        clearTimers();

        setResults(prev => [...prev, ...resultsBatchRef.current]);
        resultsBatchRef.current = [];
        
        setResourceSamples(prev => [...prev, ...resourceSamplesBatchRef.current]);
        resourceSamplesBatchRef.current = [];

        if (config.runMode === 'iterations') {
            setProgress(100);
        }

        if (statusRef.current === TestStatus.RUNNING || statusRef.current === TestStatus.FINISHING) {
            setProgress(100);
            setTimeout(() => setStatus(TestStatus.COMPLETED), 150);
        }
    }
  }, [clearTimers, handleReset]);
  
  const handleGenerateData = useCallback((data: string) => {
    handleReset('display-generated-data');
    setGeneratedData(data);
    setOperationMode('dataGeneration'); // Switch view to the dashboard to show the data
  }, [handleReset]);


  const handleStopTest = useCallback(() => {
      softStopControllerRef.current?.abort();
      hardStopControllerRef.current?.abort();
  }, []);
  
  const handleGenerateReport = useCallback(async () => {
    if (!stats || !currentConfig) {
      setReportError("Cannot generate report without completed test data.");
      return;
    }
    setIsGeneratingReport(true);
    setReport(null);
    setReportError(null);
    try {
      const analysis = await getAnalysis(currentConfig, stats);
      setReport(analysis);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : 'An unknown error occurred while generating the report.');
    } finally {
      setIsGeneratingReport(false);
    }
  }, [stats, currentConfig]);

    const handleViewHistory = useCallback(async (run: TestRunSummary) => {
        handleReset('view-history');
        setHistoryDetailsLoading(prev => ({ ...prev, [run.id]: true }));
        setIsHistoryPanelOpen(false);
        try {
            const fullRun = await getTestRunDetails(run.id);
            setOperationMode('performance');
            setStatus(TestStatus.COMPLETED);
            setTitle(fullRun.title);
            setCurrentConfig(fullRun.config);
            setResults(fullRun.results);
            setResourceSamples(fullRun.resource_samples || []);
            setReport(fullRun.report);
            setViewingHistoryId(fullRun.id);
            setProgress(100);
            setElapsedTime(fullRun.config.duration);
        } catch (e: any) {
            console.error("Failed to load test run details", e);
            setError(`Failed to load test run details: ${e.message}`);
            setStatus(TestStatus.ERROR);
        } finally {
            setHistoryDetailsLoading(prev => ({ ...prev, [run.id]: false }));
        }
    }, [handleReset]);
  
  const proceedWithRerun = useCallback(async (config: LoadTestConfig, title: string, api_spec_id: string | null) => {
      // 1. Reset dashboard state
      softStopControllerRef.current?.abort();
      hardStopControllerRef.current?.abort();
      clearTimers();
      setStatus(TestStatus.IDLE);
      setResults([]);
      setResourceSamples([]);
      setError(null);
      setProgress(0);
      setElapsedTime(0);
      setCurrentConfig(null);
      setReport(null);
      setReportError(null);
      setIsGeneratingReport(false);
      setViewingHistoryId(null);
      setGeneratedData(null);
      setFailureAnalysis(null);
      setIsGeneratingFailureAnalysis(false);
      setFailureAnalysisError(null);
      setHasSavedCurrentRun(false);

      // 2. Load associated API spec if it exists
      if (api_spec_id) {
          try {
              const allSpecs = await getApiSpecsMetadata();
              const specToLoad = allSpecs.find(s => s.id === api_spec_id);
              if (specToLoad) {
                  await handleLoadSpec(specToLoad);
              } else {
                  console.warn(`Could not find API spec with ID ${api_spec_id} for rerun.`);
                  alert(`Warning: The API Specification originally used for this test run (ID: ${api_spec_id}) could not be found. The configuration has been loaded, but you may need to manually load the correct API spec.`);
              }
          } catch (e) {
              console.error("Failed to load API spec during rerun setup:", e);
              alert("An error occurred while trying to load the API specification for this test run. Please check the console for details.");
          }
      }

      // 3. Populate config panel and switch view
      setOperationMode('performance');
      setConfigToRerun(config);
      setTitle(title);
      setIsHistoryPanelOpen(false);
  }, [clearTimers, handleLoadSpec]);
  
  const handleRerun = useCallback(async (run: TestRunSummary) => {
      setHistoryDetailsLoading(prev => ({ ...prev, [run.id]: true }));
      try {
          // The full run object is needed to get the complete config
          const fullRun = await getTestRunDetails(run.id);
          
          if (fullRun.config?.authToken) {
              // If a token exists, open the refresh modal
              setTokenRefreshState({
                  isOpen: true,
                  runToRerun: fullRun, // Pass the full run object
                  newToken: fullRun.config.authToken, // Pre-fill with the old token
              });
          } else {
              // If no token, proceed directly
              proceedWithRerun(fullRun.config, fullRun.title, fullRun.api_spec_id);
          }
      } catch (e) {
          console.error("Failed to get details for rerun:", e);
          setError(`Failed to load test details for rerun: ${e instanceof Error ? e.message : 'Unknown error'}`);
      } finally {
          setHistoryDetailsLoading(prev => ({ ...prev, [run.id]: false }));
      }
  }, [proceedWithRerun]);

  const handleDeleteHistory = useCallback(async (id: string) => {
      try {
          await deleteTestRun(id);
          setHistory(prev => prev.filter(run => run.id !== id));
          if(viewingHistoryId === id) handleReset('delete-viewed-history');
      } catch (error) {
          console.error("Failed to delete test run:", error);
      }
  }, [viewingHistoryId, handleReset]);

  const handleCompareRuns = useCallback(async (runA: TestRunSummary, runB: TestRunSummary) => {
    setComparisonRuns(null);
    setIsHistoryPanelOpen(false);
    setHistoryDetailsLoading(prev => ({ ...prev, [runA.id]: true, [runB.id]: true }));
    try {
        const [fullRunA, fullRunB] = await Promise.all([
            getTestRunDetails(runA.id),
            getTestRunDetails(runB.id)
        ]);
        setComparisonRuns([fullRunA, fullRunB]);
    } catch (e: any) {
        console.error("Failed to load runs for comparison", e);
        setError(`Failed to load one or more test runs for comparison: ${e.message}`);
        setStatus(TestStatus.ERROR);
    } finally {
        setHistoryDetailsLoading(prev => ({ ...prev, [runA.id]: false, [runB.id]: false }));
    }
  }, []);
  
  const handleAnalyzeTrends = useCallback(async (selectedIds: string[]) => {
      const runsToAnalyze = history.filter(h => selectedIds.includes(h.id));
      if (runsToAnalyze.length < 2) return;

      setIsHistoryPanelOpen(false);
      setIsTrendAnalysisModalOpen(true);
      setIsGeneratingTrendAnalysis(true);
      setTrendAnalysisReport(null);
      setTrendAnalysisRuns(runsToAnalyze);

      try {
          const report = await getTrendAnalysis(runsToAnalyze);
          setTrendAnalysisReport(report);
      } catch (e) {
          console.error("Failed to generate trend analysis:", e);
          // Create a mock report to show the error in the modal
          setTrendAnalysisReport({
              analyzedRunsCount: runsToAnalyze.length,
              overallTrendSummary: "Failed to generate trend analysis.",
              performanceThreshold: "Error",
              keyObservations: [],
              rootCauseSuggestion: e instanceof Error ? e.message : 'An unknown error occurred.',
              recommendations: [],
          });
      } finally {
          setIsGeneratingTrendAnalysis(false);
      }
  }, [history]);


  const handleRetrySave = useCallback(async () => {
    if (!cachedRun) return;
    try {
        const newRun = await saveTestRun(cachedRun);
        const { results: _, ...newRunSummary } = newRun;
        setHistory(prev => [newRunSummary, ...prev.filter(r => r.id !== newRun.id)]);
        localStorage.removeItem('cachedTestRun');
        setCachedRun(null);
        alert('Successfully saved the cached test run to your history.');
    } catch (e) {
        const error = e as Error;
        setError(`Failed to save the cached test run: ${error.message}`);
        alert(`Failed to save the cached test run: ${error.message}`);
    }
}, [cachedRun]);

  const handleRunDiagnosticTest = useCallback(() => {
    if (!currentConfig) {
        setFeedbackModalState({ isOpen: true, type: 'error', message: 'Cannot run diagnostic: original test configuration is not available.' });
        return;
    }

    const diagnosticConfig: LoadTestConfig = {
        ...currentConfig,
        users: 1,
        runMode: 'iterations',
        iterations: 1,
        // also clear load profile settings to avoid confusion in a single-iteration test
        duration: 1, 
        loadProfile: 'ramp-up',
        rampUp: 0,
        initialUsers: 0,
        stepUsers: 0,
        stepDuration: 0,
    };
    
    setTitle(`Diagnostic Run: ${title}`);
    handleStartTest(diagnosticConfig);
  }, [currentConfig, title, handleStartTest]);
  
  const handleRunRampUpTest = useCallback(() => {
    if (!currentConfig) {
        setFeedbackModalState({ isOpen: true, type: 'error', message: 'Cannot run ramp-up test: original configuration is not available.' });
        return;
    }
    
    const rampUpConfig: LoadTestConfig = {
        ...currentConfig,
        runMode: 'duration', // Ramp-up is a duration-based profile
        loadProfile: 'ramp-up',
        rampUp: 10, // A sensible default ramp-up period
        // Reset stair-step specific settings to avoid conflicts
        initialUsers: 0,
        stepUsers: 0,
        stepDuration: 0,
    };
    
    setTitle(`Ramp-Up Test: ${title}`);
    handleStartTest(rampUpConfig);
  }, [currentConfig, title, handleStartTest]);

  // --- Help Tour Handlers ---
  const startHelpTour = (tourId: string) => {
    setActiveHelpTour(tourId);
    setCurrentHelpStep(1);
    if (['performance', 'dataGeneration', 'website', 'dataDriven'].includes(tourId)) {
        const targetMode = tourId === 'dataDriven' ? 'performance' : tourId;
        setOperationMode(targetMode as OperationMode);
    }
  };
  const setHelpStep = (step: number) => {
      setCurrentHelpStep(step);
  };
  const endHelpTour = () => {
      setActiveHelpTour(null);
      setCurrentHelpStep(null);
  };
  
  const handleStopValidation = () => {
    setValidationModalState(s => ({ ...s, status: 'stopping' }));
    validationAbortControllerRef.current?.abort();
  };

  const closeTokenRefreshModal = () => {
    setTokenRefreshState({ isOpen: false, runToRerun: null, newToken: '' });
  };

  const handleUpdateAndRerun = () => {
      if (!tokenRefreshState.runToRerun) return;
      const updatedConfig = {
          ...tokenRefreshState.runToRerun.config,
          authToken: tokenRefreshState.newToken,
      };
      proceedWithRerun(updatedConfig, tokenRefreshState.runToRerun.title, tokenRefreshState.runToRerun.api_spec_id);
      closeTokenRefreshModal();
  };
  
  const handleRerunWithExisting = () => {
      if (!tokenRefreshState.runToRerun) return;
      proceedWithRerun(tokenRefreshState.runToRerun.config, tokenRefreshState.runToRerun.title, tokenRefreshState.runToRerun.api_spec_id);
      closeTokenRefreshModal();
  };


  // --- Render Logic ---

  if (!currentUser) {
    return <LoginScreen isTestMode={isTestMode} onBypassLogin={handleBypassLogin} />;
  }
  
  return (
    <div className="bg-gray-950 text-white min-h-screen flex flex-col font-sans">
      <Header 
        title={title}
        setTitle={setTitle}
        status={status}
        elapsedTime={elapsedTime}
        shutdownRemainingTime={shutdownRemainingTime}
        customLogo={customLogo}
        onLogoChange={handleLogoChange}
        onToggleHistory={() => setIsHistoryPanelOpen(p => !p)}
        isHistoryOpen={isHistoryPanelOpen}
        onToggleAdmin={() => setIsAdminPanelOpen(p => !p)}
        isAdminOpen={isAdminPanelOpen}
        onToggleHelp={() => setIsHelpPanelOpen(p => !p)}
        isHelpOpen={isHelpPanelOpen}
        onToggleAccountSettings={() => setIsAccountSettingsOpen(p => !p)}
        user={currentUser}
        logout={appLogout}
        systemStatus={systemStatus}
        onRerunChecks={rerunSystemChecks}
      />
      <main className="flex-grow container mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start relative">
        <div className="lg:col-span-1 lg:sticky lg:top-6 h-full">
            <ConfigPanel 
              onStart={handleStartTest}
              onStop={handleStopTest}
              onReset={handleReset}
              status={status}
              apiData={apiData}
              rawApiSpec={rawApiSpec}
              isApiLoading={isApiLoading}
              apiError={apiError}
              configToLoad={configToRerun}
              limits={usageLimits}
              currentlyLoadedSpec={currentlyLoadedSpec}
              operationMode={operationMode}
              setOperationMode={setOperationMode}
              onGenerateData={handleGenerateData}
              savedUrls={savedUrls}
              title={title}
              setTitle={setTitle}
              onManageUrls={() => setIsUrlManagerOpen(true)}
              onSetupCache={() => setIsDbScriptsModalOpen(true)}
              onManageApiSpecs={() => setIsApiSpecManagerOpen(true)}
              activeHelpTour={activeHelpTour}
              currentHelpStep={currentHelpStep}
              savedHeaderSets={savedHeaderSets}
              onHeaderSetsChanged={loadHeaderSets}
              onRegisterConfigGetter={registerConfigGetter}
              setValidationModalState={setValidationModalState}
              setFeedbackModalState={setFeedbackModalState}
              validationAbortControllerRef={validationAbortControllerRef}
              onUsePayloadRef={onUsePayloadRef}
            />
        </div>
        <div className="lg:col-span-2">
            <Dashboard 
              status={status}
              results={results}
              resourceSamples={resourceSamples}
              stats={stats}
              error={error}
              progress={progress}
              config={currentConfig}
              elapsedTime={elapsedTime}
              shutdownRemainingTime={shutdownRemainingTime}
              title={title}
              report={report}
              reportError={reportError}
              isGeneratingReport={isGeneratingReport}
              onGenerateReport={handleGenerateReport}
              failureAnalysis={failureAnalysis}
              isGeneratingFailureAnalysis={isGeneratingFailureAnalysis}
              onRunDiagnosticTest={handleRunDiagnosticTest}
              onRunRampUpTest={handleRunRampUpTest}
              viewingHistoryId={viewingHistoryId}
              operationMode={operationMode}
              generatedData={generatedData}
              activeHelpTour={activeHelpTour}
              currentHelpStep={currentHelpStep}
              cachedRun={cachedRun}
              onRetrySave={handleRetrySave}
            />
        </div>
      </main>

      {/* --- Modals & Panels --- */}
      {validationModalState.isOpen && (
          <ValidationLogModal
              status={validationModalState.status}
              logs={validationModalState.logs}
              payload={validationModalState.payload}
              title={validationModalState.title}
              onClose={() => setValidationModalState(s => ({ ...s, isOpen: false }))}
              onStop={handleStopValidation}
              onUsePayload={(payload) => {
                  onUsePayloadRef.current(payload);
                  setValidationModalState(s => ({ ...s, isOpen: false }));
              }}
          />
      )}
      {feedbackModalState.isOpen && (
          <FeedbackModal
              type={feedbackModalState.type}
              message={feedbackModalState.message}
              onClose={() => setFeedbackModalState(s => ({ ...s, isOpen: false }))}
          />
      )}
       <TokenRefreshModal
          isOpen={tokenRefreshState.isOpen}
          newToken={tokenRefreshState.newToken}
          setNewToken={(token) => setTokenRefreshState(s => ({ ...s, newToken: token }))}
          onRerunWithNew={handleUpdateAndRerun}
          onRerunWithExisting={handleRerunWithExisting}
          onClose={closeTokenRefreshModal}
      />
      <HelpGuidePanel 
        isOpen={isHelpPanelOpen}
        onClose={() => {
            setIsHelpPanelOpen(false);
            endHelpTour();
        }}
        startHelpTour={startHelpTour}
        endHelpTour={endHelpTour}
        setHelpStep={setHelpStep}
        activeHelpTour={activeHelpTour}
        currentHelpStep={currentHelpStep}
      />
      <HistoryPanel
          isOpen={isHistoryPanelOpen}
          onClose={() => setIsHistoryPanelOpen(false)}
          history={history}
          isLoading={isHistoryLoading}
          onView={handleViewHistory}
          onRerun={handleRerun}
          onDelete={handleDeleteHistory}
          onRefresh={loadHistory}
          onCompare={handleCompareRuns}
          onAnalyzeTrends={handleAnalyzeTrends}
          loadingStates={historyDetailsLoading}
          apiSpecs={apiSpecs}
      />
      {currentUser.profile?.role === 'admin' &&
        <AdminPanel
            isOpen={isAdminPanelOpen}
            onClose={() => setIsAdminPanelOpen(false)}
            isMockUser={isMockUser}
        />
      }
      <AccountSettingsModal 
        isOpen={isAccountSettingsOpen}
        onClose={() => setIsAccountSettingsOpen(false)}
      />
      {comparisonRuns && (
        <ComparisonModal
            runA={comparisonRuns[0]}
            runB={comparisonRuns[1]}
            onClose={() => setComparisonRuns(null)}
        />
      )}
       <TrendAnalysisModal
          isOpen={isTrendAnalysisModalOpen}
          onClose={() => setIsTrendAnalysisModalOpen(false)}
          isLoading={isGeneratingTrendAnalysis}
          report={trendAnalysisReport}
          runs={trendAnalysisRuns}
       />
      <UrlManagerModal 
        isOpen={isUrlManagerOpen}
        onClose={() => setIsUrlManagerOpen(false)}
        savedUrls={savedUrls}
        onUrlsChanged={loadSavedUrls}
      />
      <DatabaseScriptsModal 
        isOpen={isDbScriptsModalOpen}
        onClose={() => setIsDbScriptsModalOpen(false)}
      />
      <ApiSpecManager 
        isOpen={isApiSpecManagerOpen}
        onClose={() => setIsApiSpecManagerOpen(false)}
        onSpecSelected={(spec) => {
            handleLoadSpec(spec);
            setIsApiSpecManagerOpen(false);
        }}
      />
      
      <Footer />
      <DebugPanel />
    </div>
  );
};

export default App;