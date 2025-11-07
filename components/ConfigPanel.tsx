import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { type LoadTestConfig, TestStatus, type ApiPath, type ParsedApiData, UsageLimits, Assertion, ApiSpecMetadata, OperationMode, DataGenerationRequest, UploadedFile, SavedUrl, AutoFixStoppedError, SavedBasePayload, Header, SavedHeaderSet, ValidationStatus } from '../types';
import { PlayIcon, StopIcon, ResetIcon, SpinnerIcon, InformationCircleIcon, ChevronDownIcon, GlobeAltIcon, BeakerIcon, SparklesIcon, ArrowUturnLeftIcon, PlusIcon, XMarkIcon, ClipboardDocumentCheckIcon, DocumentDuplicateIcon, CloudArrowUpIcon, BoltIcon, CheckCircleIcon, XCircleIcon, BookmarkSquareIcon, ShieldCheckIcon, DatabaseIcon, ClipboardDocumentListIcon, DocumentArrowDownIcon, TrashIcon, MagnifyingGlassIcon, DocumentTextIcon, CodeBracketIcon, PhotoIcon, ExclamationTriangleIcon, KeyIcon, CheckIcon, PencilSquareIcon } from './icons';
import LoadProfileChart from './LoadProfileChart';
import * as geminiService from '../services/geminiService';
import { uploadFileToBlobStorage, crawlWebsite } from '../services/apiService';
import { toTitleCase } from '../utils/helpers';
import { getSavedPayloads, savePayload, deletePayload, updatePayload, saveHeaderSet, updateHeaderSet, deleteHeaderSet } from '../services/payloadService';
import { saveSuccessfulPayload } from '../services/learningService';
import HelpHighlighter from './HelpHighlighter';

interface ConfigPanelProps {
  onStart: (config: LoadTestConfig) => void;
  onStartComprehensive: (config: Omit<LoadTestConfig, 'url' | 'method' | 'body' | 'endpoints'>, endpoints: Array<{ url: string; method: string; }>) => void;
  onStop: () => void;
  onReset: (actionId?: string) => void;
  title: string;
  setTitle: (title: string) => void;
  status: TestStatus;
  apiData: ParsedApiData | null;
  rawApiSpec: any | null;
  isApiLoading: boolean;
  apiError: string | null;
  configToLoad: LoadTestConfig | null;
  limits: UsageLimits | null;
  currentlyLoadedSpec: ApiSpecMetadata | null;
  operationMode: OperationMode;
  setOperationMode: (mode: OperationMode) => void;
  onGenerateData: (data: string) => void;
  savedUrls: SavedUrl[];
  onManageUrls: () => void;
  onSetupCache: () => void;
  onManageApiSpecs: () => void;
  activeHelpTour: string | null;
  currentHelpStep: number | null;
  savedHeaderSets: SavedHeaderSet[];
  onHeaderSetsChanged: () => void;
  onRegisterConfigGetter: (getter: () => LoadTestConfig | null) => void;
  setValidationModalState: React.Dispatch<React.SetStateAction<{ isOpen: boolean; status: ValidationStatus; logs: string[]; payload: string | null; title: string; }>>;
  setFeedbackModalState: React.Dispatch<React.SetStateAction<{ isOpen: boolean; type: 'success' | 'error'; message: string; }>>;
  validationAbortControllerRef: React.MutableRefObject<AbortController | null>;
  onUsePayloadRef: React.MutableRefObject<(payload: string) => void>;
}


const Tooltip: React.FC<{ text: string }> = ({ text }) => (
    <div className="relative flex items-center group ml-1.5">
        <InformationCircleIcon className="w-4 h-4 text-gray-500 cursor-help" />
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-xs p-3 text-sm text-gray-200 bg-gray-800 border border-gray-600 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-50 pointer-events-none whitespace-pre-line">
            {text}
            <div className="absolute bg-gray-800 border-t border-l border-gray-600 h-2 w-2 left-1/2 -translate-x-1/2 rotate-45 -top-1"></div>
        </div>
    </div>
);

const TabButton: React.FC<{
    mode: OperationMode;
    currentMode: OperationMode;
    setMode: (mode: OperationMode) => void;
    icon: React.ReactNode;
    children: React.ReactNode;
    disabled: boolean;
}> = ({ mode, currentMode, setMode, icon, children, disabled }) => {
    const isActive = mode === currentMode;
    return (
        <button
            type="button"
            onClick={() => setMode(mode)}
            disabled={disabled}
            className={`flex items-center px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                isActive
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
            }`}
        >
            {icon}
            {children}
        </button>
    );
};

const AccordionStep: React.FC<{
    step: number;
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    isComplete: boolean;
    isDisabled: boolean;
    children: React.ReactNode;
    activeHelpTour: string | null;
    currentHelpStep: number | null;
    helpStepId?: number;
}> = ({ step, title, isOpen, onToggle, isComplete, isDisabled, children, activeHelpTour, currentHelpStep, helpStepId }) => {
    const statusClass = isDisabled ? 'bg-gray-700 text-gray-500' 
        : isComplete ? 'bg-green-500 text-white' 
        : isOpen ? 'bg-blue-500 text-white' 
        : 'bg-gray-600 text-gray-300';
    
    return (
        <HelpHighlighter tourId={activeHelpTour ?? ''} step={helpStepId ?? 0} activeTourId={activeHelpTour} activeStep={currentHelpStep}>
            <div className="border border-gray-700 rounded-lg">
                <button
                    type="button"
                    onClick={onToggle}
                    disabled={isDisabled}
                    className="w-full flex items-center p-4 text-left bg-gray-800 hover:bg-gray-700/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${statusClass}`}>
                        {isComplete ? <CheckIcon className="w-5 h-5"/> : step}
                    </div>
                    <span className={`flex-grow font-semibold text-lg ml-4 ${isDisabled ? 'text-gray-500' : 'text-white'}`}>{title}</span>
                    <ChevronDownIcon className={`w-6 h-6 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                    <div className="p-4 bg-gray-900/50 border-t border-gray-700 rounded-b-lg">
                        {children}
                    </div>
                )}
            </div>
        </HelpHighlighter>
    );
};


export const ConfigPanel: React.FC<ConfigPanelProps> = (props) => {
    const { onStart, onStartComprehensive, onStop, onReset, status, apiData, rawApiSpec, isApiLoading, apiError, configToLoad, limits, currentlyLoadedSpec, operationMode, setOperationMode, onGenerateData, savedUrls, title, setTitle, onManageUrls, onSetupCache, onManageApiSpecs, activeHelpTour, currentHelpStep, savedHeaderSets, onHeaderSetsChanged, onRegisterConfigGetter, setValidationModalState, setFeedbackModalState, validationAbortControllerRef, onUsePayloadRef } = props;

    // --- State Management ---
    const [activeStep, setActiveStep] = useState(1);
    
    // Performance Mode State
    const [url, setUrl] = useState('');
    const [selectedPath, setSelectedPath] = useState<ApiPath | null>(null);
    const [selectedMethod, setSelectedMethod] = useState<string>('');
    const [body, setBody] = useState('');
    const [users, setUsers] = useState('10');
    const [duration, setDuration] = useState('30');
    const [pacing, setPacing] = useState('0');
    const [authToken, setAuthToken] = useState('');
    const [headers, setHeaders] = useState<Header[]>([{ id: crypto.randomUUID(), key: '', value: '', enabled: true }]);
    const [assertions, setAssertions] = useState<Assertion[]>([]);
    const [useCorsProxy, setUseCorsProxy] = useState(false);
    const [networkDiagnosticsEnabled, setNetworkDiagnosticsEnabled] = useState(true);
    const [gracefulShutdown, setGracefulShutdown] = useState('20');
    const [monitoringUrl, setMonitoringUrl] = useState('');
    const [isIdAutoIncrementEnabled, setIsIdAutoIncrementEnabled] = useState(true);
    const [idPool, setIdPool] = useState<string[]>([]);
    const [idPoolingMode, setIdPoolingMode] = useState<'sequential' | 'random'>('sequential');

    // Load Profile State
    const [loadProfile, setLoadProfile] = useState<'ramp-up' | 'stair-step'>('ramp-up');
    const [rampUp, setRampUp] = useState('10');
    const [initialUsers, setInitialUsers] = useState('5');
    const [stepUsers, setStepUsers] = useState('5');
    const [stepDuration, setStepDuration] = useState('10');
    
    const [runMode, setRunMode] = useState<'duration' | 'iterations'>('duration');
    const [iterations, setIterations] = useState('1000');

    // UI & Modal State
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showAuth, setShowAuth] = useState(false);
    const [showAssertions, setShowAssertions] = useState(false);
    const [showHeaders, setShowHeaders] = useState(false);

    // AI Features State
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGeneratingConfig, setIsGeneratingConfig] = useState(false);
    const [isGeneratingBody, setIsGeneratingBody] = useState(false);
    const [formFocus, setFormFocus] = useState<string>('all');
    const [customInstructions, setCustomInstructions] = useState('');
    const [aiValidationAttempts, setAiValidationAttempts] = useState('10');
    
    // Website Test Mode State
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [isCrawling, setIsCrawling] = useState(false);
    const [crawlError, setCrawlError] = useState<string | null>(null);
    const [discoveredResources, setDiscoveredResources] = useState<Array<{type: string; url: string}>>([]);
    const [selectedResources, setSelectedResources] = useState<string[]>([]);

    // Data Generation Mode State
    const [dataGenRequests, setDataGenRequests] = useState<DataGenerationRequest[]>([]);
    const [savedPayloads, setSavedPayloads] = useState<SavedBasePayload[]>([]);
    const [selectedBasePayloadId, setSelectedBasePayloadId] = useState<string | null>(null);
    const [dataDrivenBody, setDataDrivenBody] = useState<any[]>([]);
    const [dataDrivenMode, setDataDrivenMode] = useState<'loop' | 'strict'>('loop');
    const [dataDrivenBodyType, setDataDrivenBodyType] = useState<'manual' | 'ai'>('manual');
    const [aiDataGenCount, setAiDataGenCount] = useState<number>(100);
    const [aiDataGenFields, setAiDataGenFields] = useState<string[]>([]);

    // Header Sets State
    const [selectedHeaderSetId, setSelectedHeaderSetId] = useState<string | null>(null);
    
    // Performance Mode Saved Payloads
    const [selectedPerfPayloadId, setSelectedPerfPayloadId] = useState<string | null>(null);

    // --- Derived State ---
    const maxUsers = limits?.max_users ?? 50;
    const maxDuration = limits?.max_duration ?? 60;
    const maxRampUp = limits?.max_ramp_up ?? 30;
    const minPacing = limits?.min_pacing ?? 1000;
    
    const isStep1Complete = useMemo(() => {
        if (operationMode === 'performance') return !!url && !!selectedPath && !!selectedMethod;
        if (operationMode === 'dataGeneration') return !!url && !!selectedPath && !!selectedMethod && !!selectedBasePayloadId;
        if (operationMode === 'website') return !!websiteUrl && discoveredResources.length > 0;
        return false;
    }, [operationMode, url, selectedPath, selectedMethod, websiteUrl, discoveredResources, selectedBasePayloadId]);

    const isStep2Complete = useMemo(() => {
        if (operationMode === 'performance') return (selectedMethod !== 'POST' && selectedMethod !== 'PUT') || (body.trim() !== '');
        if (operationMode === 'dataGeneration') return dataGenRequests.length > 0;
        if (operationMode === 'website') return selectedResources.length > 0;
        return false;
    }, [operationMode, selectedMethod, body, dataGenRequests, selectedResources]);

    const submissionEndpoint = useMemo(() => {
      if (!apiData) return null;
      for (const path of apiData.paths) {
        for (const method of path.methods) {
          if (method.isSubmissionEndpoint) {
            return { path, method };
          }
        }
      }
      return null;
    }, [apiData]);

    const dataGenerationFormTypes = useMemo(() => {
        if (!rawApiSpec?.components?.schemas?.FormDataDto?.properties) {
            return ['emails', 'passports']; // Fallback to old values if spec not loaded
        }
        return Object.keys(rawApiSpec.components.schemas.FormDataDto.properties).sort();
    }, [rawApiSpec]);
    
    // --- Effects ---
    
    useEffect(() => {
        if (configToLoad) {
            setUrl(configToLoad.url);
            setSelectedPath(apiData?.paths.find(p => p.path === new URL(configToLoad.url).pathname) || null);
            setSelectedMethod(configToLoad.method);
            setBody(configToLoad.body || '');
            setUsers(configToLoad.users.toString());
            setDuration(configToLoad.duration.toString());
            setPacing(configToLoad.pacing?.toString() || '0');
            setAuthToken(configToLoad.authToken || '');
            setHeaders(configToLoad.headers || [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }]);
            setAssertions(configToLoad.assertions || []);
            setUseCorsProxy(configToLoad.useCorsProxy || false);
            setNetworkDiagnosticsEnabled(configToLoad.networkDiagnosticsEnabled === false ? false : true); // default true
            setGracefulShutdown(configToLoad.gracefulShutdown?.toString() || '20');
            setMonitoringUrl(configToLoad.monitoringUrl || '');

            setLoadProfile(configToLoad.loadProfile || 'ramp-up');
            setRampUp(configToLoad.rampUp?.toString() || '10');
            setInitialUsers(configToLoad.initialUsers?.toString() || '5');
            setStepUsers(configToLoad.stepUsers?.toString() || '5');
            setStepDuration(configToLoad.stepDuration?.toString() || '10');
            
            setRunMode(configToLoad.runMode || 'duration');
            setIterations(configToLoad.iterations?.toString() || '1000');
            
            setDataDrivenBody(configToLoad.dataDrivenBody || []);
            setDataDrivenMode(configToLoad.dataDrivenMode || 'loop');
            if (configToLoad.dataDrivenBody && configToLoad.dataDrivenBody.length > 0) {
                setDataDrivenBodyType('manual'); // Assume manual if loaded
            }
            setIsIdAutoIncrementEnabled(configToLoad.isIdAutoIncrementEnabled ?? true);
            setIdPool(configToLoad.idPool ?? []);
            setIdPoolingMode(configToLoad.idPoolingMode ?? 'sequential');
        }
    }, [configToLoad, apiData]);
    
    const loadSavedPayloads = useCallback(async () => {
        try {
            const payloads = await getSavedPayloads();
            setSavedPayloads(payloads);
        } catch (err: any) {
            setFeedbackModalState({ isOpen: true, type: 'error', message: err.message });
        }
    }, [setFeedbackModalState]);

    useEffect(() => {
        if (operationMode === 'dataGeneration' || operationMode === 'performance') {
            loadSavedPayloads();
        }
    }, [operationMode, loadSavedPayloads]);
    
    useEffect(() => {
        if (operationMode === 'dataGeneration' && submissionEndpoint && !selectedPath) {
            setSelectedPath(submissionEndpoint.path);
            setSelectedMethod(submissionEndpoint.method.method);
        }
    }, [operationMode, submissionEndpoint, selectedPath]);

    const toggleStep = (step: number) => {
        setActiveStep(prev => (prev === step ? 0 : step));
    };
    
    const getCurrentConfig = useCallback((): LoadTestConfig | null => {
        const parsedUsers = parseInt(users, 10) || 1;
        const parsedDuration = parseInt(duration, 10) || 1;
        const parsedPacing = parseInt(pacing, 10) || 0;
        const parsedRampUp = parseInt(rampUp, 10) || 0;
        const parsedInitialUsers = parseInt(initialUsers, 10) || 1;
        const parsedStepUsers = parseInt(stepUsers, 10) || 1;
        const parsedStepDuration = parseInt(stepDuration, 10) || 1;
        const parsedIterations = parseInt(iterations, 10) || 1000;
        const parsedGracefulShutdown = parseInt(gracefulShutdown, 10) || 20;
        
        return {
            url: url, // Save the base URL
            method: selectedMethod,
            body: body,
            dataDrivenBody: dataDrivenBody,
            dataDrivenMode: dataDrivenMode,
            users: parsedUsers,
            duration: parsedDuration,
            pacing: parsedPacing,
            loadProfile: loadProfile,
            rampUp: parsedRampUp,
            initialUsers: parsedInitialUsers,
            stepUsers: parsedStepUsers,
            stepDuration: parsedStepDuration,
            runMode: runMode,
            iterations: parsedIterations,
            authToken,
            headers,
            assertions,
            useCorsProxy,
            networkDiagnosticsEnabled,
            gracefulShutdown: parsedGracefulShutdown,
            monitoringUrl,
            isIdAutoIncrementEnabled,
            idPool,
            idPoolingMode,
        };
    }, [url, selectedMethod, body, dataDrivenBody, dataDrivenMode, users, duration, pacing, loadProfile, rampUp, initialUsers, stepUsers, stepDuration, authToken, headers, assertions, useCorsProxy, networkDiagnosticsEnabled, runMode, iterations, gracefulShutdown, monitoringUrl, isIdAutoIncrementEnabled, idPool, idPoolingMode]);

    useEffect(() => {
        if (onRegisterConfigGetter) {
            onRegisterConfigGetter(getCurrentConfig);
        }
    }, [onRegisterConfigGetter, getCurrentConfig]);
    
    useEffect(() => {
        onUsePayloadRef.current = (payload: string) => {
            if (operationMode === 'performance') {
                setBody(payload);
            } else if (operationMode === 'dataGeneration') {
                onGenerateData(payload);
            }
        };
    }, [operationMode, onGenerateData, onUsePayloadRef]);


    // --- Handlers ---
    
    const handleStart = () => {
        let finalEndpoints: Array<{ url: string; method: string; }> | undefined;

        if (operationMode === 'website') {
            finalEndpoints = selectedResources.map(resUrl => ({ url: resUrl, method: 'GET' }));
        }

        const parsedUsers = parseInt(users, 10) || 1;
        const parsedDuration = parseInt(duration, 10) || 1;
        const parsedPacing = parseInt(pacing, 10) || 0;
        const parsedRampUp = parseInt(rampUp, 10) || 0;
        const parsedInitialUsers = parseInt(initialUsers, 10) || 1;
        const parsedStepUsers = parseInt(stepUsers, 10) || 1;
        const parsedStepDuration = parseInt(stepDuration, 10) || 1;
        const parsedIterations = parseInt(iterations, 10) || 1000;
        const parsedGracefulShutdown = parseInt(gracefulShutdown, 10) || 20;
        
        const currentLoadProfile = (['ramp-up', 'stair-step'] as const).includes(loadProfile) ? loadProfile : 'ramp-up';

        const finalConfig: LoadTestConfig = {
            url: selectedPath ? `${url.replace(/\/$/, '')}${selectedPath.path}` : url,
            method: selectedMethod,
            body: dataDrivenBody.length > 0 ? '' : body, // Body is handled by data-driven context
            dataDrivenBody: dataDrivenBody,
            dataDrivenMode: dataDrivenMode,
            users: Math.max(1, Math.min(parsedUsers, maxUsers)),
            duration: Math.max(1, Math.min(parsedDuration, maxDuration)),
            pacing: parsedPacing,
            loadProfile: currentLoadProfile,
            rampUp: currentLoadProfile === 'ramp-up' ? Math.min(parsedRampUp, maxRampUp) : 0,
            initialUsers: currentLoadProfile === 'stair-step' ? Math.max(1, parsedInitialUsers) : 0,
            stepUsers: currentLoadProfile === 'stair-step' ? Math.max(1, parsedStepUsers) : 0,
            stepDuration: currentLoadProfile === 'stair-step' ? Math.max(1, parsedStepDuration) : 0,
            runMode: runMode,
            iterations: parsedIterations,
            authToken,
            headers,
            assertions,
            useCorsProxy,
            networkDiagnosticsEnabled,
            endpoints: finalEndpoints,
            gracefulShutdown: parsedGracefulShutdown,
            monitoringUrl: monitoringUrl.trim() || undefined,
            isIdAutoIncrementEnabled,
            idPool,
            idPoolingMode,
        };

        const finalChartConfig = { ...finalConfig, users: parsedUsers, duration: parsedDuration, rampUp: parsedRampUp, initialUsers: parsedInitialUsers, stepUsers: parsedStepUsers, stepDuration: parsedStepDuration };


        if (finalEndpoints) {
             onStartComprehensive(finalConfig, finalEndpoints);
        } else {
             onStart(finalConfig);
        }
    };
    
    const handleGenerateDataFromConfig = () => {
        if (!selectedBasePayloadId) {
            setFeedbackModalState({ isOpen: true, type: 'error', message: 'Please select a base payload template first.' });
            return;
        }

        const basePayload = savedPayloads.find(p => p.id === selectedBasePayloadId);
        if (!basePayload) {
            setFeedbackModalState({ isOpen: true, type: 'error', message: 'Selected base payload not found.' });
            return;
        }
        
        const targetPath = selectedPath?.path;
        if (!targetPath) {
             setFeedbackModalState({ isOpen: true, type: 'error', message: 'No endpoint path selected.' });
             return;
        }

        const controller = new AbortController();
        validationAbortControllerRef.current = controller;
        
        setValidationModalState({
            isOpen: true,
            status: 'running',
            logs: [],
            payload: null,
            title: `Generating ${dataGenRequests.reduce((sum, r) => sum + r.count, 0)} Records`
        });
        
        const maxAttempts = Math.max(1, Math.min(parseInt(aiValidationAttempts, 10) || 7, 15));

        geminiService.generateAndValidatePersonalizedData(
            JSON.stringify(basePayload.payload),
            dataGenRequests,
            rawApiSpec,
            url,
            targetPath,
            customInstructions,
            (log) => setValidationModalState(prev => ({...prev, logs: [...prev.logs, log]})),
            controller.signal,
            maxAttempts,
            authToken,
            networkDiagnosticsEnabled,
            useCorsProxy,
            headers
        ).then(fullPayload => {
            onGenerateData(fullPayload);
            setValidationModalState(prev => ({...prev, status: 'success', payload: fullPayload}));
        }).catch(err => {
            if (err instanceof AutoFixStoppedError) {
                setValidationModalState(prev => ({...prev, status: 'stopped', payload: err.lastPayload}));
            } else {
                setValidationModalState(prev => ({...prev, status: 'failed', payload: null}));
            }
            setValidationModalState(prev => ({...prev, logs: [...prev.logs, `\n--- ERROR ---\n${err.message}`]}));
        });
    };
    
    const handleStartApiScan = () => {
        if (!apiData || !url) {
            setFeedbackModalState({ isOpen: true, type: 'error', message: 'Please set a Base URL and load an API Spec before running a scan.' });
            return;
        }

        const getEndpoints = apiData.paths.flatMap(path => 
            path.methods
                .filter(method => 
                    method.method.toUpperCase() === 'GET' && 
                    (!method.parameters || method.parameters.every(p => !p.required))
                )
                .map(method => ({
                    url: `${url.replace(/\/$/, '')}${path.path}`,
                    method: 'GET'
                }))
        );

        if (getEndpoints.length === 0) {
            setFeedbackModalState({ isOpen: true, type: 'error', message: "No parameter-less GET endpoints were found in the API specification to run a scan." });
            return;
        }

        const parsedUsers = parseInt(users, 10) || 1;
        const parsedDuration = parseInt(duration, 10) || 1;
        const parsedPacing = parseInt(pacing, 10) || 0;
        const parsedRampUp = parseInt(rampUp, 10) || 0;
        const parsedInitialUsers = parseInt(initialUsers, 10) || 1;
        const parsedStepUsers = parseInt(stepUsers, 10) || 1;
        const parsedStepDuration = parseInt(stepDuration, 10) || 1;
        const parsedIterations = parseInt(iterations, 10) || 1000;
        const parsedGracefulShutdown = parseInt(gracefulShutdown, 10) || 20;

        const baseConfig: Omit<LoadTestConfig, 'url' | 'method' | 'body' | 'endpoints'> = {
            users: Math.max(1, Math.min(parsedUsers, maxUsers)),
            duration: Math.max(1, Math.min(parsedDuration, maxDuration)),
            pacing: parsedPacing,
            loadProfile: loadProfile,
            rampUp: loadProfile === 'ramp-up' ? Math.min(parsedRampUp, maxRampUp) : 0,
            initialUsers: loadProfile === 'stair-step' ? Math.max(1, parsedInitialUsers) : 0,
            stepUsers: loadProfile === 'stair-step' ? Math.max(1, parsedStepUsers) : 0,
            stepDuration: loadProfile === 'stair-step' ? Math.max(1, parsedStepDuration) : 0,
            runMode: runMode,
            iterations: parsedIterations,
            authToken,
            headers,
            assertions,
            useCorsProxy,
            networkDiagnosticsEnabled,
            gracefulShutdown: parsedGracefulShutdown,
            monitoringUrl: monitoringUrl.trim() || undefined,
            isIdAutoIncrementEnabled,
            idPool,
            idPoolingMode,
            dataDrivenBody: [],
            dataDrivenMode: 'loop'
        };
        
        onStartComprehensive(baseConfig, getEndpoints);
    };

    // --- Header Handlers ---
    const addHeader = () => {
        setHeaders([...headers, { id: crypto.randomUUID(), key: '', value: '', enabled: true }]);
    };

    const removeHeader = (id: string) => {
        setHeaders(headers.filter(h => h.id !== id));
    };

    const updateHeader = (id: string, field: 'key' | 'value', value: string) => {
        setHeaders(headers.map(h => h.id === id ? { ...h, [field]: value } : h));
    };

    const toggleHeader = (id: string) => {
        setHeaders(headers.map(h => h.id === id ? { ...h, enabled: !h.enabled } : h));
    };

    const handleSelectHeaderSet = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const setId = e.target.value;
        setSelectedHeaderSetId(setId || null);

        if (setId) {
            const selectedSet = savedHeaderSets.find(s => s.id === setId);
            if (selectedSet) {
                // Assign new client-side IDs to prevent React key issues
                const headersWithClientIds = selectedSet.headers.map(h => ({ ...h, id: crypto.randomUUID() }));
                setHeaders(headersWithClientIds);
            }
        } else {
            setHeaders([{ id: crypto.randomUUID(), key: '', value: '', enabled: true }]);
        }
    };

    const handleSaveHeaderSet = async () => {
        if (!selectedHeaderSetId) {
            setFeedbackModalState({ isOpen: true, type: 'error', message: 'No header set is selected to save.' });
            return;
        }
        const selectedSet = savedHeaderSets.find(s => s.id === selectedHeaderSetId);
        if (!selectedSet) return;
        
        try {
            await updateHeaderSet(selectedHeaderSetId, selectedSet.name, headers);
            setFeedbackModalState({ isOpen: true, type: 'success', message: `Updated header set "${selectedSet.name}".`});
            onHeaderSetsChanged();
        } catch (err: any) {
            setFeedbackModalState({ isOpen: true, type: 'error', message: err.message || 'Failed to update header set.' });
        }
    };

    const handleSaveHeaderSetAs = async () => {
        const name = prompt("Enter a name for the new header set:");
        if (!name || !name.trim()) return;

        try {
            const newSet = await saveHeaderSet(name.trim(), headers);
            setFeedbackModalState({ isOpen: true, type: 'success', message: `Saved new header set "${name.trim()}".`});
            await onHeaderSetsChanged();
            // Use a timeout to ensure the new set is in the state before selecting it
            setTimeout(() => setSelectedHeaderSetId(newSet.id), 100);
        } catch (err: any) {
            setFeedbackModalState({ isOpen: true, type: 'error', message: err.message || 'Failed to save new header set.' });
        }
    };

    const handleDeleteHeaderSet = async () => {
        if (!selectedHeaderSetId) return;
        const selectedSet = savedHeaderSets.find(s => s.id === selectedHeaderSetId);
        if (!selectedSet) return;

        if (window.confirm(`Are you sure you want to delete the header set "${selectedSet.name}"?`)) {
            try {
                await deleteHeaderSet(selectedHeaderSetId);
                setFeedbackModalState({ isOpen: true, type: 'success', message: `Deleted header set "${selectedSet.name}".`});
                setSelectedHeaderSetId(null);
                setHeaders([{ id: crypto.randomUUID(), key: '', value: '', enabled: true }]);
                onHeaderSetsChanged();
            } catch (err: any) {
                setFeedbackModalState({ isOpen: true, type: 'error', message: err.message || 'Failed to delete header set.' });
            }
        }
    };
    
    // --- AI & Validation Handlers ---

    const handleGenerateConfig = async () => {
        if (!aiPrompt.trim() || !rawApiSpec) return;
        setIsGeneratingConfig(true);
        try {
            const config = await geminiService.generateConfigFromPrompt(aiPrompt, rawApiSpec);
            // This is a "soft" load, doesn't need to load API spec like a full rerun
            // It just populates the form fields from the AI response.
            setUrl(new URL(config.url).origin);
            const pathData = apiData?.paths.find(p => p.path === new URL(config.url).pathname);
            setSelectedPath(pathData || null);
            setSelectedMethod(config.method);
            setBody(config.body || '');
            setUsers(Math.min(config.users, maxUsers).toString());
            setDuration(Math.min(config.duration, maxDuration).toString());
            setLoadProfile(config.loadProfile || 'ramp-up');
            setRampUp((config.rampUp || 10).toString());
        } catch (error) {
            console.error(error);
            alert(`Failed to generate config: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsGeneratingConfig(false);
        }
    };

    const handleGenerateBody = async (mode: 'example' | 'fix' | 'custom') => {
        if (!rawApiSpec || !selectedPath || !selectedMethod) return;
        
        onUsePayloadRef.current = (payload) => setBody(payload);

        const controller = new AbortController();
        validationAbortControllerRef.current = controller;

        setValidationModalState({
            isOpen: true,
            status: 'running',
            logs: [],
            payload: null,
            title:  mode === 'example' ? 'Generating Example Payload...' :
                    mode === 'fix' ? 'Attempting to Auto-Fix Payload...' :
                    'Generating Custom Payload...'
        });
        
        const maxAttempts = Math.max(1, Math.min(parseInt(aiValidationAttempts, 10) || 7, 15));

        try {
            const finalBody = await geminiService.generateAndValidateBody(
                rawApiSpec,
                selectedPath.path,
                selectedMethod,
                url,
                formFocus,
                mode === 'custom' ? customInstructions : '',
                (log) => setValidationModalState(prev => ({ ...prev, logs: [...prev.logs, log] })),
                controller.signal,
                maxAttempts,
                authToken,
                useCorsProxy,
                headers
            );
            setBody(finalBody);
            setValidationModalState(prev => ({...prev, status: 'success', payload: finalBody}));
        } catch (err) {
            if (err instanceof AutoFixStoppedError) {
                 setValidationModalState(prev => ({...prev, status: 'stopped', payload: err.lastPayload}));
            } else {
                setValidationModalState(prev => ({...prev, status: 'failed', payload: null}));
            }
            setValidationModalState(prev => ({...prev, logs: [...prev.logs, `\n--- ERROR ---\n${(err as Error).message}`]}));
        }
    };
    
    const handleSaveBasePayload = async () => {
        const description = prompt("Enter a description for this payload (e.g., 'Standard Submission Template'):");
        if (description && body) {
            try {
                const payloadJson = JSON.parse(body);
                await savePayload(description, payloadJson);
                loadSavedPayloads(); // Refresh the list
                setFeedbackModalState({ isOpen: true, type: 'success', message: 'Base payload saved successfully!' });
            } catch (err: any) {
                 setFeedbackModalState({ isOpen: true, type: 'error', message: err.message || 'Failed to save payload.' });
            }
        }
    };
    
    const handleDeleteBasePayload = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this saved payload?")) {
            try {
                await deletePayload(id);
                loadSavedPayloads();
                if (selectedBasePayloadId === id) {
                    setSelectedBasePayloadId(null);
                }
                if (selectedPerfPayloadId === id) {
                    setSelectedPerfPayloadId(null);
                    setBody('');
                }
                setFeedbackModalState({ isOpen: true, type: 'success', message: 'Payload deleted.' });
            } catch (err: any) {
                setFeedbackModalState({ isOpen: true, type: 'error', message: err.message || 'Failed to delete payload.' });
            }
        }
    };
    
    const handleSelectPerfPayload = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedPerfPayloadId(id);
        if (id) {
            const selected = savedPayloads.find(p => p.id === id);
            if (selected) {
                setBody(JSON.stringify(selected.payload, null, 2));
            }
        } else {
            setBody('');
        }
    };

    const handleRenameBasePayload = async () => {
        if (!selectedPerfPayloadId) return;
        const selectedPayload = savedPayloads.find(p => p.id === selectedPerfPayloadId);
        if (!selectedPayload) return;

        const newDescription = prompt("Enter the new description for this payload:", selectedPayload.description);
        if (newDescription && newDescription.trim() && newDescription.trim() !== selectedPayload.description) {
            try {
                await updatePayload(selectedPerfPayloadId, { description: newDescription.trim() });
                setFeedbackModalState({ isOpen: true, type: 'success', message: 'Payload renamed successfully!' });
                await loadSavedPayloads();
            } catch (err: any) {
                setFeedbackModalState({ isOpen: true, type: 'error', message: err.message || 'Failed to rename payload.' });
            }
        }
    };

    const handleUpdateBasePayload = async () => {
        if (!selectedPerfPayloadId) return;
        if (!window.confirm("Are you sure you want to overwrite the selected payload with the content in the editor? This action cannot be undone.")) {
            return;
        }

        try {
            const payloadJson = JSON.parse(body);
            await updatePayload(selectedPerfPayloadId, { payload: payloadJson });
            setFeedbackModalState({ isOpen: true, type: 'success', message: 'Payload updated successfully!' });
            await loadSavedPayloads();
        } catch (err: any) {
             if (err instanceof SyntaxError) {
                 setFeedbackModalState({ isOpen: true, type: 'error', message: 'The content in the editor is not valid JSON.' });
             } else {
                 setFeedbackModalState({ isOpen: true, type: 'error', message: err.message || 'Failed to update payload.' });
             }
        }
    };

    const handleIdPoolFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                const ids = text.split(/\r?\n/).map(id => id.trim()).filter(id => id);
                setIdPool(ids);
            };
            reader.readAsText(file);
        }
        e.target.value = '';
    };

    // --- Website Crawler Handlers ---
    const handleCrawlWebsite = async () => {
        if (!websiteUrl) return;
        setIsCrawling(true);
        setCrawlError(null);
        setDiscoveredResources([]);
        setSelectedResources([]);
        try {
            const resources = await crawlWebsite(websiteUrl);
            setDiscoveredResources(resources);
        } catch (e) {
            setCrawlError(e instanceof Error ? e.message : 'An unknown error occurred.');
        } finally {
            setIsCrawling(false);
        }
    };

    const handleResourceSelectionChange = (url: string) => {
        setSelectedResources(prev => 
            prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
        );
    };

    const selectAllResources = (type?: 'html' | 'css' | 'js' | 'img' | 'all') => {
        if (type === 'all') {
            setSelectedResources(discoveredResources.map(r => r.url));
        } else if (type) {
            const resourceUrls = discoveredResources.filter(r => r.type === type).map(r => r.url);
            // Check if all are already selected to toggle off
            const allSelected = resourceUrls.every(url => selectedResources.includes(url));
            if (allSelected) {
                setSelectedResources(prev => prev.filter(url => !resourceUrls.includes(url)));
            } else {
                setSelectedResources(prev => [...new Set([...prev, ...resourceUrls])]);
            }
        } else {
            setSelectedResources([]);
        }
    };

    const addDataGenRequest = () => {
        const defaultFormType = dataGenerationFormTypes.length > 0 ? dataGenerationFormTypes[0] : 'emails';
        setDataGenRequests([...dataGenRequests, { id: crypto.randomUUID(), formType: defaultFormType, count: 100, files: [] }]);
    };
    
    const updateDataGenRequest = <K extends keyof DataGenerationRequest>(id: string, field: K, value: DataGenerationRequest[K]) => {
        setDataGenRequests(dataGenRequests.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const removeDataGenRequest = (id: string) => {
        setDataGenRequests(dataGenRequests.filter(r => r.id !== id));
    };

    return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-lg relative">
      <div className="p-6">
        <h2 className="text-xl font-bold text-white mb-2">Configuration</h2>
        <p className="text-sm text-gray-400 mb-6">Set up and launch your performance test or data generation job.</p>

         <div className="border-b border-gray-700 mb-6">
            <div className="flex -mb-px">
                <TabButton mode="performance" currentMode={operationMode} setMode={setOperationMode} disabled={status === TestStatus.RUNNING} icon={<BeakerIcon className="w-5 h-5 mr-2" />}>API Performance</TabButton>
                <TabButton mode="dataGeneration" currentMode={operationMode} setMode={setOperationMode} disabled={status === TestStatus.RUNNING} icon={<DatabaseIcon className="w-5 h-5 mr-2" />}>Data Generation</TabButton>
                <TabButton mode="website" currentMode={operationMode} setMode={setOperationMode} disabled={status === TestStatus.RUNNING} icon={<GlobeAltIcon className="w-5 h-5 mr-2" />}>Website Test</TabButton>
            </div>
         </div>
        
        <div className="space-y-4">
          
          {/* ----- API Performance & Data Generation Common Steps ----- */}
          {(operationMode === 'performance' || operationMode === 'dataGeneration') && (
            <>
                <AccordionStep
                    step={1}
                    title={operationMode === 'performance' ? "Define Target" : "Define Validation & Template"}
                    isOpen={activeStep === 1}
                    onToggle={() => toggleStep(1)}
                    isComplete={isStep1Complete}
                    isDisabled={false}
                    activeHelpTour={activeHelpTour}
                    currentHelpStep={currentHelpStep}
                    helpStepId={operationMode === 'performance' ? 2 : (operationMode === 'dataGeneration' ? 2 : undefined)}
                >
                    <div className="space-y-4">
                        <div className="flex items-end space-x-2">
                            <div className="flex-grow">
                                <label htmlFor="url" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                    Base URL
                                    <Tooltip text="The base URL of your API (e.g., https://api.example.com). The endpoint path will be appended to this." />
                                </label>
                                <select id="url" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                    <option value="">-- Select or type a URL --</option>
                                    {savedUrls.map(su => <option key={su.id} value={su.url}>{su.comment} ({su.url})</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="api-spec-selector" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                API Specification
                                <Tooltip text="Loading an OpenAPI (Swagger) spec enables endpoint discovery and AI-powered request generation." />
                            </label>
                            <div className="flex items-center space-x-2">
                                <div className="flex-grow p-2 bg-gray-700 border border-gray-600 rounded-md text-sm">
                                {isApiLoading ? (
                                    <span className="text-gray-400 flex items-center"><SpinnerIcon className="w-4 h-4 mr-2 animate-spin" />Loading spec...</span>
                                ) : currentlyLoadedSpec ? (
                                    <span className="text-green-300">{currentlyLoadedSpec.description}</span>
                                ) : apiError ? (
                                    <span className="text-red-400">{apiError}</span>
                                ) : (
                                    <span className="text-gray-400">No spec loaded.</span>
                                )}
                                </div>
                            </div>
                                <button
                                    type="button"
                                    onClick={handleStartApiScan}
                                    disabled={!apiData || !url || status === TestStatus.RUNNING}
                                    className="w-full mt-2 flex items-center justify-center space-x-2 px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 rounded-md transition disabled:opacity-50"
                                    title="Find and test all simple GET endpoints from the spec."
                                >
                                    <GlobeAltIcon className="w-5 h-5"/>
                                    <span>Run API Scan (GETs)</span>
                                </button>
                        </div>

                        <div>
                            <label htmlFor="endpoint" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                Endpoint
                                <Tooltip text="Select the specific API endpoint you want to test from the loaded specification." />
                            </label>
                            <select
                                id="endpoint"
                                disabled={!apiData}
                                value={selectedPath?.path || ''}
                                onChange={(e) => {
                                    const path = apiData?.paths.find(p => p.path === e.target.value) || null;
                                    setSelectedPath(path);
                                    setSelectedMethod(path?.methods[0]?.method || '');
                                }}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                            >
                                <option value="">{apiData ? 'Select an endpoint' : 'Load an API spec first'}</option>
                                {apiData?.paths.map(p => (
                                    <option key={p.path} value={p.path}>
                                        {p.path}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedPath && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">HTTP Method</label>
                                <div className="flex space-x-2">
                                    {selectedPath.methods.map(method => (
                                        <button
                                            key={method.method}
                                            type="button"
                                            onClick={() => setSelectedMethod(method.method)}
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                                selectedMethod === method.method ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                            }`}
                                        >
                                            {method.method}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {operationMode === 'dataGeneration' && (
                            <div className="border-t border-gray-700 pt-4">
                                <label htmlFor="base-payload" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                    Base Payload Template
                                    <Tooltip text="Select a saved, structured payload. The AI will use this as a template to generate unique data." />
                                </label>
                                 <div className="flex items-end space-x-2">
                                    <select
                                        id="base-payload"
                                        value={selectedBasePayloadId || ''}
                                        onChange={(e) => setSelectedBasePayloadId(e.target.value)}
                                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="">-- Select a Saved Payload --</option>
                                        {savedPayloads.map(p => <option key={p.id} value={p.id}>{p.description}</option>)}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteBasePayload(selectedBasePayloadId!)}
                                        disabled={!selectedBasePayloadId}
                                        className="p-2.5 bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
                                        title="Delete selected payload"
                                    >
                                        <TrashIcon className="w-4 h-4 text-white"/>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </AccordionStep>

                <AccordionStep
                    step={2}
                    title={operationMode === 'performance' ? "Configure Request" : "Configure Data Variations"}
                    isOpen={activeStep === 2}
                    onToggle={() => toggleStep(2)}
                    isComplete={isStep2Complete}
                    isDisabled={!isStep1Complete}
                    activeHelpTour={activeHelpTour}
                    currentHelpStep={currentHelpStep}
                    helpStepId={operationMode === 'performance' ? 3 : (operationMode === 'dataGeneration' ? 3 : undefined)}
                >
                    {operationMode === 'performance' && (
                        <div className="space-y-4">
                            {['POST', 'PUT', 'PATCH'].includes(selectedMethod) ? (
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="saved-payload" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                            Manage Saved Payloads
                                            <Tooltip text="Load, update, or rename saved request bodies from your library." />
                                        </label>
                                        <div className="space-y-2 p-3 bg-gray-800 rounded-md border border-gray-700">
                                            <select
                                                id="saved-payload"
                                                value={selectedPerfPayloadId || ''}
                                                onChange={handleSelectPerfPayload}
                                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="">-- Select a Payload --</option>
                                                {savedPayloads.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.description} (Saved: {new Date(p.created_at).toLocaleString()})
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="grid grid-cols-3 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleRenameBasePayload}
                                                    disabled={!selectedPerfPayloadId}
                                                    className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition disabled:opacity-50 flex items-center justify-center space-x-2"
                                                >
                                                    <PencilSquareIcon className="w-4 h-4"/><span>Rename</span>
                                                </button>
                                                 <button
                                                    type="button"
                                                    onClick={handleUpdateBasePayload}
                                                    disabled={!selectedPerfPayloadId || !body}
                                                    className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition disabled:opacity-50 flex items-center justify-center space-x-2"
                                                    title="Overwrite the selected payload with the current content from the editor."
                                                >
                                                    <CloudArrowUpIcon className="w-4 h-4"/><span>Update</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { if (selectedPerfPayloadId) handleDeleteBasePayload(selectedPerfPayloadId); }}
                                                    disabled={!selectedPerfPayloadId}
                                                    className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition disabled:opacity-50 flex items-center justify-center space-x-2"
                                                >
                                                    <TrashIcon className="w-4 h-4"/><span>Delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="body" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                            Request Body (JSON)
                                            <Tooltip text="The JSON payload to send with your POST, PUT, or PATCH requests. Use the AI Assistant to generate a valid body." />
                                        </label>
                                        <textarea
                                            id="body"
                                            value={body}
                                            onChange={(e) => setBody(e.target.value)}
                                            rows={8}
                                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder='{ "key": "value" }'
                                        />
                                        <div className="mt-2 flex justify-end space-x-2">
                                            <button type="button" onClick={handleSaveBasePayload} className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-gray-600 hover:bg-gray-500 text-white rounded-md transition" title="Save the current request body as a new reusable template."><BookmarkSquareIcon className="w-4 h-4" /><span>Save as New Template</span></button>
                                        </div>
                                    </div>
                                    
                                    {rawApiSpec && (
                                        <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
                                            <p className="text-sm font-medium text-white mb-3 flex items-center"><SparklesIcon className="w-5 h-5 mr-2 text-blue-400" />AI Assistant</p>
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-2 gap-2 text-sm">
                                                    <button type="button" onClick={() => handleGenerateBody('example')} disabled={isGeneratingBody} className="flex items-center justify-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition disabled:opacity-50">
                                                        <SparklesIcon className="w-4 h-4"/><span>Generate Example</span>
                                                    </button>
                                                    <button type="button" onClick={() => handleGenerateBody('fix')} disabled={isGeneratingBody || !body} className="flex items-center justify-center space-x-2 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-md transition disabled:opacity-50">
                                                        <BoltIcon className="w-4 h-4"/><span>Auto-Fix</span>
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    <textarea value={customInstructions} onChange={(e) => setCustomInstructions(e.target.value)} rows={2} placeholder="Add custom instructions for the AI..." className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-xs" />
                                                    <button type="button" onClick={() => handleGenerateBody('custom')} disabled={isGeneratingBody || !customInstructions} className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md transition disabled:opacity-50">
                                                        <SparklesIcon className="w-4 h-4"/><span>Generate with Instructions</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 text-center py-4">No request body is needed for a {selectedMethod} request.</p>
                            )}
                        </div>
                    )}

                    {operationMode === 'dataGeneration' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-400">Define the types of unique data you need. The system will generate one full record for each of the "Total Records to Generate", injecting the unique data for each specified form type.</p>
                            <div className="space-y-2">
                                {dataGenRequests.map((req) => (
                                    <div key={req.id} className="grid grid-cols-12 gap-2 items-center p-2 bg-gray-800 rounded-md">
                                        <div className="col-span-5">
                                            <label className="text-xs text-gray-400">Form Type</label>
                                            <select value={req.formType} onChange={(e) => updateDataGenRequest(req.id, 'formType', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm">
                                                 {dataGenerationFormTypes.map(formType => (
                                                    <option key={formType} value={formType}>{toTitleCase(formType)}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="col-span-5">
                                            <label className="text-xs text-gray-400">Total Records to Generate</label>
                                            <input type="number" value={req.count} onChange={(e) => updateDataGenRequest(req.id, 'count', parseInt(e.target.value, 10) || 0)} className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm" />
                                        </div>
                                        <div className="col-span-2 text-right pt-4">
                                            <button onClick={() => removeDataGenRequest(req.id)} className="p-2 text-gray-400 hover:text-red-400"><XMarkIcon className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button type="button" onClick={addDataGenRequest} className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition"><PlusIcon className="w-4 h-4" /><span>Add Variation</span></button>
                        </div>
                    )}
                </AccordionStep>
            </>
          )}

          {operationMode === 'website' && (
              <>
                <AccordionStep
                    step={1}
                    title="Define Target Website"
                    isOpen={activeStep === 1}
                    onToggle={() => toggleStep(1)}
                    isComplete={isStep1Complete}
                    isDisabled={false}
                    activeHelpTour={activeHelpTour}
                    currentHelpStep={currentHelpStep}
                    helpStepId={2}
                >
                    <div className="space-y-4">
                        <div className="flex items-end space-x-2">
                            <div className="flex-grow">
                                <label htmlFor="websiteUrl" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                    Website URL
                                    <Tooltip text="The full URL of the website to test (e.g., https://www.example.com). The tool will scan this page for assets like CSS, JS, and images." />
                                </label>
                                <input id="websiteUrl" type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="https://www.example.com" />
                            </div>
                            <button type="button" onClick={handleCrawlWebsite} disabled={isCrawling || !websiteUrl} className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded-md flex items-center space-x-2 disabled:opacity-50 min-w-[80px] justify-center">
                                {isCrawling ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <MagnifyingGlassIcon className="w-5 h-5" />}
                                <span>Scan</span>
                            </button>
                        </div>
                        {crawlError && <p className="text-sm text-red-400">{crawlError}</p>}
                    </div>
                </AccordionStep>

                <AccordionStep
                    step={2}
                    title="Select Resources"
                    isOpen={activeStep === 2}
                    onToggle={() => toggleStep(2)}
                    isComplete={isStep2Complete}
                    isDisabled={!isStep1Complete}
                    activeHelpTour={activeHelpTour}
                    currentHelpStep={currentHelpStep}
                    helpStepId={3}
                >
                     <div className="space-y-4">
                        <p className="text-sm text-gray-400">Select which discovered resources to include in the load test. Only these URLs will receive simulated traffic.</p>
                         <div className="flex items-center space-x-2 text-xs">
                            <button onClick={() => selectAllResources('all')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-md">All</button>
                            <button onClick={() => selectAllResources()} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-md">None</button>
                            <span className="text-gray-500">|</span>
                            <button onClick={() => selectAllResources('html')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-md">Pages</button>
                            <button onClick={() => selectAllResources('css')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-md">CSS</button>
                            <button onClick={() => selectAllResources('js')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-md">JS</button>
                            <button onClick={() => selectAllResources('img')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-md">Images</button>
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-2 p-2 bg-gray-800 rounded-md border border-gray-700">
                            {discoveredResources.map(res => (
                                <label key={res.url} className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-700/50 cursor-pointer">
                                    <input type="checkbox" checked={selectedResources.includes(res.url)} onChange={() => handleResourceSelectionChange(res.url)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500" />
                                    <div className="flex items-center space-x-2 min-w-0">
                                       <span className="flex-shrink-0">{res.type === 'html' ? <DocumentTextIcon className="w-4 h-4 text-blue-400"/> : res.type === 'css' ? <CodeBracketIcon className="w-4 h-4 text-purple-400"/> : res.type === 'js' ? <CodeBracketIcon className="w-4 h-4 text-yellow-400"/> : <PhotoIcon className="w-4 h-4 text-green-400"/>}</span>
                                       <span className="text-xs font-mono truncate text-gray-300" title={res.url}>{new URL(res.url).pathname}</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                         <p className="text-xs text-right text-gray-400">{selectedResources.length} of {discoveredResources.length} resources selected.</p>
                     </div>
                </AccordionStep>
              </>
          )}

          <AccordionStep
                step={3}
                title="Define Load Profile"
                isOpen={activeStep === 3}
                onToggle={() => toggleStep(3)}
                isComplete={true} // This step is always "complete" as it has defaults
                isDisabled={!isStep1Complete || !isStep2Complete}
                activeHelpTour={activeHelpTour}
                currentHelpStep={currentHelpStep}
                helpStepId={operationMode === 'performance' ? 4 : (operationMode === 'website' ? 4 : undefined)}
           >
             <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="users" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                            {runMode === 'duration' ? 'Peak Virtual Users' : 'Concurrent Users'}
                            {runMode === 'duration' ? (
                                <Tooltip text={`The maximum number of concurrent users. Your limit is ${maxUsers}.`} />
                            ) : (
                                <Tooltip text={`The number of users that will run in parallel to complete the total iterations. More users will finish the test faster.`} />
                            )}
                        </label>
                        <input id="users" type="number" value={users} onChange={(e) => setUsers(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Run Mode</label>
                        <div className="flex bg-gray-800 p-1 rounded-lg">
                            <button type="button" onClick={() => setRunMode('duration')} className={`w-1/2 py-1.5 text-sm font-medium rounded-md transition-colors ${runMode === 'duration' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>By Duration</button>
                            <button type="button" onClick={() => setRunMode('iterations')} className={`w-1/2 py-1.5 text-sm font-medium rounded-md transition-colors ${runMode === 'iterations' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>By Iterations</button>
                        </div>
                    </div>
                </div>

                {runMode === 'duration' ? (
                    <div>
                        <label htmlFor="duration" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                            Test Duration (s)
                            <Tooltip text={`The total length of the test in seconds. Your limit is ${maxDuration}s.`} />
                        </label>
                        <input id="duration" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                ) : (
                    <div>
                        <label htmlFor="iterations" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                            Total Iterations
                            <Tooltip text={`The total number of requests to send across all users. The test will stop once this number is reached.`} />
                        </label>
                        <input id="iterations" type="number" value={iterations} onChange={(e) => setIterations(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                )}
                
                <div>
                    <label htmlFor="pacing" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                        Request Pacing (ms)
                        <Tooltip text={`The "think time" in milliseconds a virtual user waits after completing one request before starting the next. This applies to both Duration and Iteration modes. A value of 0 means requests are sent back-to-back for maximum throughput.`} />
                    </label>
                    <input id="pacing" type="number" value={pacing} onChange={(e) => setPacing(e.target.value)} step="100" className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white" />
                </div>

                {runMode === 'duration' && (
                    <>
                        <div className="border-t border-gray-700 pt-4">
                            <label className="block text-sm font-medium text-gray-300 mb-2">Load Profile</label>
                            <div className="flex bg-gray-800 p-1 rounded-lg">
                                <button type="button" onClick={() => setLoadProfile('ramp-up')} className={`w-1/2 py-1.5 text-sm font-medium rounded-md transition-colors ${loadProfile === 'ramp-up' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>Ramp Up</button>
                                <button type="button" onClick={() => setLoadProfile('stair-step')} className={`w-1/2 py-1.5 text-sm font-medium rounded-md transition-colors ${loadProfile === 'stair-step' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>Stair Step</button>
                            </div>
                        </div>
                        {loadProfile === 'ramp-up' ? (
                            <div>
                                <label htmlFor="rampUp" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                    Ramp-up Period (s)
                                    <Tooltip text={`The time taken to reach the peak number of users. Your limit is ${maxRampUp}s.`} />
                                </label>
                                <input id="rampUp" type="number" value={rampUp} onChange={(e) => setRampUp(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label htmlFor="initialUsers" className="flex items-center text-sm font-medium text-gray-300 mb-1">Initial Users<Tooltip text="The number of users to start the test with." /></label>
                                    <input id="initialUsers" type="number" value={initialUsers} onChange={(e) => setInitialUsers(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white" />
                                </div>
                                <div>
                                    <label htmlFor="stepUsers" className="flex items-center text-sm font-medium text-gray-300 mb-1">Step Users<Tooltip text="The number of users to add in each step." /></label>
                                    <input id="stepUsers" type="number" value={stepUsers} onChange={(e) => setStepUsers(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white" />
                                </div>
                                <div>
                                    <label htmlFor="stepDuration" className="flex items-center text-sm font-medium text-gray-300 mb-1">Step Duration (s)<Tooltip text="The duration of each step." /></label>
                                    <input id="stepDuration" type="number" value={stepDuration} onChange={(e) => setStepDuration(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white" />
                                </div>
                            </div>
                        )}
                        <LoadProfileChart config={{ users: parseInt(users, 10) || 0, duration: parseInt(duration, 10) || 0, rampUp: parseInt(rampUp, 10) || 0, loadProfile, initialUsers: parseInt(initialUsers, 10) || 0, stepUsers: parseInt(stepUsers, 10) || 0, stepDuration: parseInt(stepDuration, 10) || 0, url: '', method: '', pacing: 0, body: '', assertions: [], runMode: runMode, iterations: parseInt(iterations, 10) || 0 }} />
                    </>
                )}
            </div>
           </AccordionStep>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Application Management</h3>
            <div className="space-y-2">
                <button type="button" onClick={onManageApiSpecs} className="w-full flex items-center space-x-3 text-left p-3 bg-gray-800 hover:bg-gray-700/50 rounded-lg transition-colors">
                    <DocumentDuplicateIcon className="w-5 h-5 text-gray-400" />
                    <span className="text-sm font-medium text-white">Manage API Specs</span>
                </button>
                <button type="button" onClick={onManageUrls} className="w-full flex items-center space-x-3 text-left p-3 bg-gray-800 hover:bg-gray-700/50 rounded-lg transition-colors">
                    <BookmarkSquareIcon className="w-5 h-5 text-gray-400" />
                    <span className="text-sm font-medium text-white">Manage Saved URLs</span>
                </button>
                <button type="button" onClick={onSetupCache} className="w-full flex items-center space-x-3 text-left p-3 bg-gray-800 hover:bg-gray-700/50 rounded-lg transition-colors">
                    <DatabaseIcon className="w-5 h-5 text-gray-400" />
                    <span className="text-sm font-medium text-white">Setup Database & Cache</span>
                </button>
            </div>
        </div>

        <div className="space-y-4 mt-6">
             <div className="border-t border-gray-700 pt-4">
                <button type="button" onClick={() => setShowAuth(p => !p)} className="flex w-full items-center justify-between text-left text-sm font-medium text-gray-300">
                    <span className="flex items-center"><KeyIcon className="w-5 h-5 mr-2 text-gray-400"/>Authentication & Headers</span>
                    <ChevronDownIcon className={`w-5 h-5 transition-transform ${showAuth ? 'rotate-180' : ''}`} />
                </button>
                {showAuth && (
                    <div className="mt-2 space-y-4 pt-2 pl-4 border-l-2 border-gray-700">
                        <div>
                            <label htmlFor="authToken" className="block text-sm text-gray-400">Bearer Token</label>
                            <input id="authToken" type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} className="w-full mt-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        
                        <div className="mt-2 space-y-3">
                            <div className="space-y-2 p-3 bg-gray-800 rounded-md border border-gray-700">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-gray-300">Saved Header Sets</label>
                                    <div className="flex items-center space-x-1">
                                        <button type="button" onClick={handleSaveHeaderSet} disabled={!selectedHeaderSetId} className="p-1 text-gray-400 hover:text-white disabled:opacity-50" title="Save changes to current set"><BookmarkSquareIcon className="w-4 h-4"/></button>
                                        <button type="button" onClick={handleSaveHeaderSetAs} className="p-1 text-gray-400 hover:text-white" title="Save as new set"><PlusIcon className="w-4 h-4"/></button>
                                        <button type="button" onClick={handleDeleteHeaderSet} disabled={!selectedHeaderSetId} className="p-1 text-gray-400 hover:text-red-400 disabled:opacity-50" title="Delete current set"><TrashIcon className="w-4 h-4"/></button>
                                    </div>
                                </div>
                                <select
                                    value={selectedHeaderSetId || ''}
                                    onChange={handleSelectHeaderSet}
                                    className="w-full mt-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="">-- Load a Set --</option>
                                    {savedHeaderSets.map(set => (
                                        <option key={set.id} value={set.id}>{set.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="mt-2 space-y-2">
                                {headers.map((header) => (
                                    <div key={header.id} className="flex items-center space-x-2">
                                        <input type="checkbox" checked={header.enabled} onChange={() => toggleHeader(header.id)} className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500" />
                                        <input type="text" placeholder="Key" value={header.key} onChange={(e) => updateHeader(header.id, 'key', e.target.value)} className="flex-grow bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm" />
                                        <input type="text" placeholder="Value" value={header.value} onChange={(e) => updateHeader(header.id, 'value', e.target.value)} className="flex-grow bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm" />
                                        <button onClick={() => removeHeader(header.id)} className="p-1 text-gray-400 hover:text-red-400"><XMarkIcon className="w-4 h-4" /></button>
                                    </div>
                                ))}
                            </div>
                            <button type="button" onClick={addHeader} className="mt-2 flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition"><PlusIcon className="w-4 h-4" /><span>Add Header</span></button>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="border-t border-gray-700 pt-4">
                <button type="button" onClick={() => setShowAdvanced(p => !p)} className="flex w-full items-center justify-between text-left text-sm font-medium text-gray-300">
                    <span className="flex items-center"><ShieldCheckIcon className="w-5 h-5 mr-2 text-gray-400"/>Advanced Options</span>
                    <ChevronDownIcon className={`w-5 h-5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </button>
                {showAdvanced && (
                    <div className="mt-2 space-y-4 pt-2 pl-4 border-l-2 border-gray-700">
                         <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg">
                            <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Dynamic ID Injection</h4>
                            
                            <label htmlFor="auto-increment-toggle" className="flex items-center p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors has-[:disabled]:opacity-50 has-[:disabled]:cursor-not-allowed">
                                <div className="relative">
                                    <input type="checkbox" id="auto-increment-toggle" className="sr-only peer" checked={isIdAutoIncrementEnabled} onChange={(e) => setIsIdAutoIncrementEnabled(e.target.checked)} disabled={idPool.length > 0} />
                                    <div className="block w-14 h-8 rounded-full transition bg-gray-600 peer-checked:bg-blue-600"></div>
                                    <div className="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition transform peer-checked:translate-x-6"></div>
                                </div>
                                <div className="ml-4">
                                    <span className="text-sm font-medium text-white">Enable Auto-incrementing IDs</span>
                                    <p className="text-xs text-gray-400">Appends a unique suffix to 'id' and 'ncosId' fields (e.g., id_1, id_2...).</p>
                                </div>
                            </label>

                            <div className="space-y-2">
                                <label className="flex items-center text-sm font-medium text-gray-300 mb-1">ID Pooling <span className="text-xs text-gray-500 ml-2">(Overrides Auto-increment)</span></label>
                                <input type="file" accept=".txt" onChange={handleIdPoolFileChange} className="hidden" id="id-pool-upload" />
                                <div className="flex items-stretch space-x-2">
                                    <label htmlFor="id-pool-upload" className="flex-grow flex items-center justify-center space-x-2 px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-md cursor-pointer">
                                        <CloudArrowUpIcon className="w-5 h-5" />
                                        <span>{idPool.length > 0 ? `${idPool.length} IDs Loaded` : 'Upload ID Pool (.txt)'}</span>
                                    </label>
                                    {idPool.length > 0 && <button onClick={() => setIdPool([])} className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 rounded-md">Clear</button>}
                                </div>
                                {idPool.length > 0 && (
                                    <div className="flex items-center space-x-4 pt-2">
                                        <span className="text-sm text-gray-400">Cycling Mode:</span>
                                        <div className="flex bg-gray-800 p-1 rounded-lg">
                                            <button type="button" onClick={() => setIdPoolingMode('sequential')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${idPoolingMode === 'sequential' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>Sequential</button>
                                            <button type="button" onClick={() => setIdPoolingMode('random')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${idPoolingMode === 'random' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>Random</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="graceful-shutdown" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                Graceful Shutdown Period (s)
                                <Tooltip text={`The extra time to wait for in-flight requests to complete after the test duration ends.

**Crucial for accuracy.** If this value is shorter than your server's slowest response time under load, successful requests may be incorrectly marked as "timed out" and failed. Set this to a value safely greater than your expected max latency.`} />
                            </label>
                            <input
                                id="graceful-shutdown"
                                type="number"
                                value={gracefulShutdown}
                                onChange={(e) => setGracefulShutdown(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"
                            />
                        </div>
                        <div>
                            <label htmlFor="ai-attempts" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                AI Validation Attempts
                                <Tooltip text="The maximum number of times the AI will try to fix a generated payload if it fails validation against the live endpoint." />
                            </label>
                            <input
                                id="ai-attempts"
                                type="number"
                                value={aiValidationAttempts}
                                onChange={(e) => setAiValidationAttempts(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"
                            />
                        </div>
                        <div className="border-t border-gray-700 pt-4">
                             <label htmlFor="monitoring-url" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                Resource Monitoring URL
                                <Tooltip text={`Optional. Provide an endpoint URL that returns server hardware stats. The app will poll this URL during the test.

Expected JSON response format:
{
  "cpu": 85.5,
  "memory": 62.1
}`} />
                            </label>
                            <input
                                id="monitoring-url"
                                type="url"
                                placeholder="http://your-server:9100/metrics"
                                value={monitoringUrl}
                                onChange={(e) => setMonitoringUrl(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"
                            />
                        </div>
                        <div className="flex items-start space-x-3">
                            <input id="cors-proxy" type="checkbox" checked={useCorsProxy} onChange={(e) => setUseCorsProxy(e.target.checked)} className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 mt-1" />
                            <div>
                                <label htmlFor="cors-proxy" className="font-medium text-gray-300">Use CORS Proxy</label>
                                <p className="text-xs text-gray-400">Enable this if you are getting CORS errors. This will route requests through a server-side function to bypass browser security limitations.</p>
                            </div>
                        </div>
                         <div className="flex items-start space-x-3">
                            <input id="network-diagnostics" type="checkbox" checked={networkDiagnosticsEnabled} onChange={(e) => setNetworkDiagnosticsEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 mt-1" />
                            <div>
                                <label htmlFor="network-diagnostics" className="font-medium text-gray-300">Enable Network Timing Analysis</label>
                                <p className="text-xs text-gray-400">Captures detailed network metrics like DNS, TCP, and TTFB. May add a small overhead to measurements.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-700 flex flex-col space-y-4">
            {operationMode === 'performance' && (
                <HelpHighlighter tourId="performance" step={6} activeTourId={activeHelpTour} activeStep={currentHelpStep}>
                <button
                    type="button"
                    onClick={handleStart}
                    disabled={status === TestStatus.RUNNING || !isStep1Complete || !isStep2Complete}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 text-sm font-bold text-white bg-green-600 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <PlayIcon className="w-5 h-5" />
                    <span>Start Test</span>
                </button>
                </HelpHighlighter>
            )}

            {operationMode === 'dataGeneration' && (
                <button
                    type="button"
                    onClick={handleGenerateDataFromConfig}
                    disabled={status === TestStatus.RUNNING || !isStep1Complete || !isStep2Complete}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 text-sm font-bold text-white bg-green-600 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <SparklesIcon className="w-5 h-5" />
                    <span>Generate & Validate Data</span>
                </button>
            )}
            
            {operationMode === 'website' && (
                 <button
                    type="button"
                    onClick={handleStart}
                    disabled={status === TestStatus.RUNNING || !isStep1Complete || !isStep2Complete}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 text-sm font-bold text-white bg-green-600 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <PlayIcon className="w-5 h-5" />
                    <span>Start Test</span>
                </button>
            )}

            <div className="grid grid-cols-2 gap-4">
                <button
                    type="button"
                    onClick={onStop}
                    disabled={status !== TestStatus.RUNNING && status !== TestStatus.FINISHING}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <StopIcon className="w-5 h-5" />
                    <span>Stop</span>
                </button>
                <button
                    type="button"
                    onClick={() => onReset('config-panel-reset-button')}
                    disabled={status === TestStatus.RUNNING || status === TestStatus.FINISHING}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-md hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ResetIcon className="w-5 h-5" />
                    <span>Reset</span>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
