





export class AutoFixStoppedError extends Error {
    constructor(message: string, public lastPayload: string | null) {
        super(message);
        this.name = 'AutoFixStoppedError';
    }
}

export enum TestStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  FINISHING = 'FINISHING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export type TokenStatus = 'unverified' | 'verifying' | 'verified' | 'failed';

export type ValidationStatus = 'running' | 'stopping' | 'success' | 'failed' | 'stopped';

export type OperationMode = 'performance' | 'dataGeneration' | 'website';

export interface UploadedFile {
    id: string; // client-side ID
    name: string;
    type: string;
    status: 'uploading' | 'completed' | 'error';
    blobId?: string; // The ID returned from the blob storage API
    error?: string;
}

export interface DataGenerationRequest {
    id: string;
    formType: string; // e.g., 'emails', 'passports'
    count: number;
    files: UploadedFile[];
}

export interface Assertion {
    id: string;
    metric: 'latency' | 'responseBody';
    operator: 'lessThan' | 'greaterThan' | 'contains' | 'notContains';
    value: string | number;
}

export interface AssertionResult {
    assertionId: string;
    passed: boolean;
    actualValue: string | number;
    expectedValue: string | number;
    metric: 'latency' | 'responseBody';
    operator: 'lessThan' | 'greaterThan' | 'contains' | 'notContains';
    description: string;
}

export interface Header {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface LoadTestConfig {
  url: string;
  method: string;
  users: number;
  duration: number;
  pacing: number;
  body: string;
  dataDrivenBody?: any[];
  dataDrivenMode?: 'loop' | 'strict';
  loadProfile: 'ramp-up' | 'stair-step';
  rampUp: number;
  initialUsers: number;
  stepUsers: number;
  stepDuration: number;
  runMode: 'duration' | 'iterations';
  iterations: number;
  endpoints?: Array<{ url: string; method: string; body?: string; }>;
  assertions: Assertion[];
  useCorsProxy?: boolean;
  authToken?: string;
  headers?: Header[];
  gracefulShutdown: number;
  networkDiagnosticsEnabled?: boolean;
  monitoringUrl?: string;
  isIdAutoIncrementEnabled?: boolean;
  idPool?: string[];
  idPoolingMode?: 'sequential' | 'random';
}

export interface NetworkTimings {
  dns: number;
  tcp: number;
  tls: number;
  ttfb: number;
  download: number;
  total: number;
}

export interface ResourceSample {
  timestamp: number;
  cpu: number;
  memory: number;
}

export interface TestResultSample {
  id: string;
  timestamp: number;
  latency: number;
  success: boolean;
  statusCode: number;
  statusText: string;
  errorDetails?: string;
  url: string;
  method: string;
  requestBody?: string;
  responseBody?: string;
  assertionResults?: AssertionResult[];
  networkTimings?: NetworkTimings;
}

export interface TestStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  totalLatency: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  throughput: number;
  errorDistribution: { [key: string]: number };
  latencyStdDev: number;
  latencyCV: number;
  apdexScore: number;
  apdexBreakdown: {
    satisfied: number;
    tolerating: number;
    frustrated: number;
  };
  avgNetworkTimings?: NetworkTimings;
  ttfbStats?: {
    min: number;
    max: number;
    avg: number;
    stdDev: number;
  };
}

export interface KeyObservation {
  metric: string;
  finding: string;
  severity: 'Positive' | 'Neutral' | 'Warning' | 'Critical';
}

export interface StructuredSummary {
    analysis: string;
    suggestion: string;
}

export interface PerformanceReport {
  executiveSummary: string;
  keyObservations: KeyObservation[];
  recommendations: string[];
  kpiSummary?: StructuredSummary;
  timelineSummary?: StructuredSummary;
  latencySummary?: StructuredSummary;
  errorSummary?: StructuredSummary;
  networkSummary?: StructuredSummary;
  logSummary?: string;
}

export interface FailureAnalysisReport {
    rootCauseAnalysis: string;
    configurationFeedback: string[];
    suggestedNextSteps: string[];
}

export interface TrendAnalysisReport {
    overallTrendSummary?: string;
    performanceThreshold?: string;
    keyObservations?: string[];
    rootCauseSuggestion?: string;
    recommendations?: string[];
    analyzedRunsCount: number;
    conclusiveSummary?: string;
}

export interface ComparisonMetricChange {
    metric: string;
    baselineValue: string;
    comparisonValue: string;
    delta: string;
    analysis: string;
    impact: 'Positive' | 'Negative' | 'Neutral';
}

export interface ComparisonAnalysisReport {
    comparisonSummary: string;
    keyMetricChanges: ComparisonMetricChange[];
    rootCauseAnalysis: string;
    recommendations: string[];
}


export interface ApiParameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    description?: string;
    required?: boolean;
    schema: any;
}

export interface ApiMethod {
    method: string;
    description?: string;
    requestBodySchema?: any;
    isSubmissionEndpoint?: boolean;
    parameters?: ApiParameter[];
    security?: any[];
}

export interface ApiPath {
    path: string;
    methods: ApiMethod[];
}

export interface ParsedApiData {
    paths: ApiPath[];
}

export interface TestRun {
    id: string;
    created_at: string;
    user_id: string;
    title: string;
    status: 'COMPLETED' | 'ERROR';
    config: LoadTestConfig;
    stats: TestStats;
    results: TestResultSample[];
    report: PerformanceReport | null;
    api_spec_id: string | null;
    resource_samples?: ResourceSample[];
}

export type UnsavedTestRun = Omit<TestRun, 'id' | 'created_at'>;

export type TestRunSummary = Omit<TestRun, 'results' | 'resource_samples'>;

export interface UsageLimits {
    role: string;
    max_users: number;
    max_duration: number;
    max_ramp_up: number;
    min_pacing: number;
}

export interface UserProfile {
    id: string;
    email: string;
    role: 'admin' | 'user';
}

// This is now the standard user type, combining Supabase user with the app's profile.
export type AppUser = import('@supabase/supabase-js').User & {
    profile?: UserProfile;
};


export interface AdminUserWithProfile {
    id: string;
    email?: string;
    created_at: string;
    last_sign_in_at?: string;
    profile: {
        id: string;
        email: string;
        role: 'admin' | 'user';
    } | null;
}

export interface ApiSpecMetadata {
    id: string;
    created_at: string;
    file_name: string;
    description: string;
    storage_path: string;
}

export interface SavedUrl {
  id: string;
  url: string;
  comment: string;
}

export interface LearnedPayload {
  id: string;
  created_at: string;
  endpoint_path: string;
  http_method: string;
  payload: any;
  payload_hash: string;
}

export interface DatabaseScript {
    version: string;
    title: string;
    date: string;
    sql: string;
}

export interface SavedBasePayload {
  id: string;
  created_at: string;
  user_id: string;
  description: string;
  payload: any;
}

export interface SavedHeaderSet {
  id: string;
  created_at: string;
  user_id: string;
  name: string;
  headers: Header[];
}

export type CheckStatus = 'PENDING' | 'OK' | 'WARN' | 'ERROR';

export interface SystemCheck {
    name: 'Supabase DB' | 'Gemini API' | 'API Spec';
    status: CheckStatus;
    message: string;
    solution?: string;
}

export type SystemStatusState = SystemCheck[];