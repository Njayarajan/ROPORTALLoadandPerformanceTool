
import { GoogleGenAI, Type } from '@google/genai';
import type { LoadTestConfig, TestResultSample, TestStats, PerformanceReport, AssertionResult, DataGenerationRequest, NetworkTimings, FailureAnalysisReport, Header, TrendAnalysisReport, TestRunSummary, TestRun, ComparisonAnalysisReport, ResourceSample, TrendCategoryResult } from '../types';
import { AutoFixStoppedError } from '../types';
import { getLearnedPayloads, saveSuccessfulPayload } from './learningService';
import { supabase, supabaseUrl, supabaseAnonKey } from './supabaseClient';

const getAiClient = () => {
    const apiKey = (typeof process !== 'undefined' && process.env && process.env.API_KEY) 
        ? process.env.API_KEY 
        : null;

    if (!apiKey) {
        throw new Error("API_KEY_MISSING: The API_KEY environment variable is not set or accessible. Please ensure it is configured in your hosting environment.");
    }
    
    // Always create a new instance to ensure the latest API key from the environment is used,
    // which is critical for features that might change the key at runtime (e.g., in AI Studio).
    return new GoogleGenAI({ apiKey });
};

interface DataDrivenContext {
    data: any[];
    getNextIndex: () => number;
}

/**
 * A promise-based sleep function that can be interrupted by an AbortSignal.
 */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            return reject(new DOMException('Aborted', 'AbortError'));
        }
        const timeoutId = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
        });
    });
}

/**
 * Helper to strip HTML tags from a string.
 */
function stripHtml(html: string): string {
    if (!html) return '';
    let text = html.replace(/<[^>]*>?/gm, ' ');
    text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return text.replace(/\s+/g, ' ').trim();
}

async function virtualUserSingleRequest(
  config: LoadTestConfig,
  onResult: (result: TestResultSample) => void,
  signal: AbortSignal,
  dataContext?: DataDrivenContext,
  requestIndex?: number,
  virtualUserId?: number
) {
    if (signal.aborted) return;

    const requestId = crypto.randomUUID();
    const vuId = virtualUserId !== undefined ? `vu-${virtualUserId}` : 'vu-unknown';

    let targetUrl = config.url;
    try {
        const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const urlObj = new URL(targetUrl, base);
        urlObj.searchParams.set('_nonce', requestId);
        urlObj.searchParams.set('_ts', Date.now().toString());
        targetUrl = urlObj.href;
    } catch (e) {
        console.warn("Failed to append cache-buster nonce to URL:", targetUrl);
    }

    const targetMethod = config.method;
    let targetBody = config.body;

    if (dataContext) {
        const index = dataContext.getNextIndex();
        if (config.dataDrivenMode === 'strict' && index >= dataContext.data.length) {
            return; 
        }
        const record = dataContext.data[index % dataContext.data.length]; 
        targetBody = JSON.stringify(record);
    }

    if (targetBody) {
        try {
        const bodyJson = JSON.parse(targetBody);
        let modified = false;

        if (typeof bodyJson === 'object' && bodyJson !== null && !Array.isArray(bodyJson)) {
            bodyJson._trace_id = requestId;
            bodyJson._trace_ts = Date.now();
            modified = true;
        }

        if (config.idPool && config.idPool.length > 0) {
            const pool = config.idPool;
            let idFromPool: string;
            if (config.idPoolingMode === 'random') {
                idFromPool = pool[Math.floor(Math.random() * pool.length)];
            } else { 
                idFromPool = pool[(requestIndex || 0) % pool.length];
            }
            
            if (bodyJson.ncosId !== undefined) {
                bodyJson.ncosId = idFromPool;
                modified = true;
            }
            if (bodyJson.id !== undefined) {
                bodyJson.id = idFromPool;
                modified = true;
            }
        } else if (config.isIdAutoIncrementEnabled !== false) {
                bodyJson.id = crypto.randomUUID();
                modified = true;
        }
        
        if (modified) {
            targetBody = JSON.stringify(bodyJson);
        }
        } catch (e) { }
    }

    if (signal.aborted) return;

    const startTime = performance.now();
    let success = false;
    let statusCode = 0;
    let statusText = '';
    let errorDetails: string | undefined = undefined;
    let responseBody: string | undefined = undefined;

    try {
        const fetchOptions: RequestInit & { priority?: 'high' | 'low' | 'auto' } = {
        method: targetMethod,
        signal,
        cache: 'no-store',
        priority: 'high',
        headers: {
            'X-Request-ID': requestId,
            'X-Virtual-User-ID': vuId,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        },
        };

        if (config.headers) {
        for (const header of config.headers) {
            if (header.enabled && header.key) {
                (fetchOptions.headers as Record<string, string>)[header.key] = header.value;
            }
        }
        }

        if (['POST', 'PUT', 'PATCH'].includes(targetMethod) && targetBody) {
        (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
        fetchOptions.body = targetBody;
        }
        
        if (config.authToken) {
        let authHeaderValue = config.authToken;
        if (!/^bearer /i.test(authHeaderValue)) {
            authHeaderValue = `Bearer ${authHeaderValue}`;
        }
        (fetchOptions.headers as Record<string, string>)['Authorization'] = authHeaderValue;
        }
        
        let response;
        if (config.useCorsProxy) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
            throw new Error("Not logged in. A user session is required to use the CORS proxy function.");
            }

            const functionsUrl = `${supabaseUrl}/functions/v1/cors-proxy`;

            const proxyOptions: any = {
                method: fetchOptions.method,
                headers: fetchOptions.headers,
                body: fetchOptions.body,
            };

            response = await fetch(functionsUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                    'apikey': supabaseAnonKey,
                },
                body: JSON.stringify({
                    url: targetUrl, 
                    options: proxyOptions
                }),
                signal,
            });
        } else {
        response = await fetch(targetUrl, fetchOptions);
        }

        const responseText = await response.text();
        responseBody = responseText;

        statusCode = response.status;
        statusText = response.statusText;
        success = response.ok;
        
        if (!success) {
        errorDetails = `Server responded with a non-successful status code.`;
        }

    } catch (err) {
        success = false;
        statusCode = 0;
        statusText = 'Client Error';
        if (err instanceof Error) {
            if (err.name === 'AbortError') {
            statusText = 'Aborted';
            errorDetails = `Request was aborted by the test runner.`;
            } else if (err.message.includes('Failed to fetch')) {
            statusText = 'Network Error';
            errorDetails = `Network Error: ${err.message}. This usually indicates the connection was dropped or refused by the server.`;
            } else {
            errorDetails = err.message;
            }
        } else {
            errorDetails = 'An unknown network error occurred.';
        }
    }
    const endTime = performance.now();
    const latency = endTime - startTime;

    let networkTimings: NetworkTimings | undefined = undefined;
    if (config.networkDiagnosticsEnabled) {
        await new Promise(resolve => setTimeout(resolve, 0));
        const entries = performance.getEntriesByName(targetUrl, 'resource');
        if (entries.length > 0) {
            const perfEntry = entries[entries.length - 1] as PerformanceResourceTiming;
            if (perfEntry) {
                networkTimings = {
                    dns: perfEntry.domainLookupEnd - perfEntry.domainLookupStart,
                    tcp: perfEntry.connectEnd - perfEntry.connectStart,
                    tls: (perfEntry.secureConnectionStart > 0) ? (perfEntry.connectEnd - perfEntry.secureConnectionStart) : 0,
                    ttfb: perfEntry.responseStart - perfEntry.requestStart,
                    download: perfEntry.responseEnd - perfEntry.responseStart,
                    total: perfEntry.duration
                };
            }
        }
    }

    const assertionResults: AssertionResult[] = [];
    if (config.assertions && config.assertions.length > 0) {
        for (const assertion of config.assertions) {
            let passed = false;
            let actualValue: string | number = 'N/A';
            let description = '';

            try {
                switch (assertion.metric) {
                    case 'latency':
                        actualValue = Math.round(latency);
                        const expectedLatency = Number(assertion.value);
                        if (!isNaN(expectedLatency)) {
                            if (assertion.operator === 'lessThan') passed = latency < expectedLatency;
                            else if (assertion.operator === 'greaterThan') passed = latency > expectedLatency;
                        }
                        description = `Latency should be ${assertion.operator === 'lessThan' ? '<' : '>'} ${assertion.value}ms. Actual: ${actualValue}ms.`;
                        break;
                    
                    case 'responseBody':
                        actualValue = responseBody || '';
                        const expectedText = String(assertion.value);
                        if (assertion.operator === 'contains') passed = (responseBody || '').includes(expectedText);
                        else if (assertion.operator === 'notContains') passed = !(responseBody || '').includes(expectedText);
                        description = `Response body should ${assertion.operator} "${assertion.value}".`;
                        break;
                }
            } catch (e) {
                passed = false;
                description = `Error evaluating assertion: ${e instanceof Error ? e.message : 'Unknown error'}`;
            }

            assertionResults.push({
                assertionId: assertion.id,
                passed,
                actualValue,
                expectedValue: assertion.value,
                metric: assertion.metric,
                operator: assertion.operator,
                description,
            });
        }
    }

    const allAssertionsPassed = assertionResults.length > 0 ? assertionResults.every(ar => ar.passed) : true;
    const finalSuccess = success && allAssertionsPassed;

    onResult({
        id: requestId,
        timestamp: Date.now(),
        latency: latency,
        success: finalSuccess,
        statusCode: statusCode,
        statusText: statusText,
        errorDetails: errorDetails,
        url: targetUrl, 
        method: targetMethod,
        requestBody: targetBody,
        responseBody: responseBody,
        assertionResults: assertionResults,
        networkTimings,
    });
}

export async function runLoadTest(
  config: LoadTestConfig,
  onResult: (result: TestResultSample) => void,
  onResourceSample: (sample: ResourceSample) => void,
  softStopSignal: AbortSignal,
  hardStopSignal: AbortSignal
): Promise<void> {
    
    if (config.networkDiagnosticsEnabled) {
        performance.clearResourceTimings();
    }

    try {
        if (config.monitoringUrl) {
            const resourcePollController = new AbortController();
            const intervalId = setInterval(async () => {
                try {
                    const res = await fetch(config.monitoringUrl!, { signal: resourcePollController.signal });
                    if (!res.ok) {
                        console.warn(`Resource monitor fetch failed: ${res.status}`);
                        return;
                    }
                    const sample: { cpu: number; memory: number } = await res.json();
                    onResourceSample({ timestamp: Date.now(), cpu: sample.cpu, memory: sample.memory });
                } catch (e) {
                    if ((e as Error).name !== 'AbortError') {
                        console.error('Resource monitor poll failed:', e);
                    }
                }
            }, 2000); 

            softStopSignal.addEventListener('abort', () => {
                clearInterval(intervalId);
                resourcePollController.abort();
            });
        }
        
        if (config.runMode === 'iterations') {
            const iterationCounter = {
                i: 0,
                next: function() {
                    const currentIndex = this.i++;
                    if (currentIndex < config.iterations) {
                        return currentIndex;
                    }
                    return null;
                }
            };

            const worker = async (workerId: number) => {
                while (true) {
                    const taskIndex = iterationCounter.next();

                    if (taskIndex === null || softStopSignal.aborted) {
                        break; 
                    }
                    
                    const taskDataContext = (config.dataDrivenBody && config.dataDrivenBody.length > 0)
                        ? { data: config.dataDrivenBody, getNextIndex: () => taskIndex }
                        : undefined;

                    if (config.dataDrivenMode === 'strict' && taskDataContext && taskIndex >= taskDataContext.data.length) {
                        continue; 
                    }

                    await virtualUserSingleRequest(config, onResult, hardStopSignal, taskDataContext, taskIndex, workerId);

                    if (config.pacing > 0) {
                        await abortableSleep(config.pacing, softStopSignal);
                    }
                }
            };
            
            const workers = Array.from({ length: config.users }, (_, i) => worker(i));
            await Promise.all(workers);
        } 
        else {
            const dataContext = (config.dataDrivenBody && config.dataDrivenBody.length > 0)
                ? { data: config.dataDrivenBody, getNextIndex: (() => { let i = -1; return () => { i++; return i; } })() }
                : undefined;

            const requestIndexCounter = {
                i: -1,
                next: function() {
                    this.i++;
                    return this.i;
                }
            };

            const durationRunner = async (workerId: number) => {
                while (!softStopSignal.aborted) {
                    const requestIndex = requestIndexCounter.next();
                    const runnerConfig = { ...config };
                    if (config.endpoints && config.endpoints.length > 0) {
                        const endpoint = config.endpoints[Math.floor(Math.random() * config.endpoints.length)];
                        runnerConfig.url = endpoint.url;
                        runnerConfig.method = endpoint.method;
                    }

                    await virtualUserSingleRequest(runnerConfig, onResult, hardStopSignal, dataContext, requestIndex, workerId);
                    if (config.pacing > 0) {
                        await abortableSleep(config.pacing, softStopSignal);
                    }
                }
            };

            const runners: Array<Promise<void>> = [];
            
            if (config.loadProfile === 'ramp-up') {
                const rampUpInterval = config.rampUp > 0 ? (config.rampUp * 1000) / config.users : 0;
                for (let i = 0; i < config.users; i++) {
                    if (softStopSignal.aborted) break;
                    runners.push(durationRunner(i));
                    if (rampUpInterval > 0) {
                      await abortableSleep(rampUpInterval, softStopSignal);
                    }
                }
            } else { 
                let currentUsers = 0;
                const stepCount = Math.floor(config.duration / config.stepDuration);
                
                for (let i = 0; i < config.initialUsers; i++) {
                    if (softStopSignal.aborted || currentUsers >= config.users) break;
                    runners.push(durationRunner(currentUsers));
                    currentUsers++;
                }
                
                for (let step = 0; step < stepCount; step++) {
                    if (softStopSignal.aborted) break;
                    await abortableSleep(config.stepDuration * 1000, softStopSignal);
                    if (softStopSignal.aborted) break;
                    
                    for (let i = 0; i < config.stepUsers; i++) {
                        if (softStopSignal.aborted || currentUsers >= config.users) break;
                        runners.push(durationRunner(currentUsers));
                        currentUsers++;
                    }
                }
            }
            
            await Promise.all(runners);
        }
    } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
            console.error("An unexpected error occurred within the test runner:", err);
            throw err;
        }
    } finally {
        if (config.networkDiagnosticsEnabled) {
            performance.clearResourceTimings();
        }
    }
}

export async function getAnalysis(config: LoadTestConfig, stats: TestStats): Promise<PerformanceReport> {
    let jsonText = '';
  try {
    const client = getAiClient();
    const isApiScan = config.url === 'API-wide scan';
    
    const networkAnalysisSection = stats.avgNetworkTimings ? `
      - Network Averages: DNS=${stats.avgNetworkTimings.dns.toFixed(0)}ms, TCP=${stats.avgNetworkTimings.tcp.toFixed(0)}ms, TLS=${stats.avgNetworkTimings.tls.toFixed(0)}ms, TTFB=${stats.avgNetworkTimings.ttfb.toFixed(0)}ms, Download=${stats.avgNetworkTimings.download.toFixed(0)}ms
    ` : '';
    
    const ttfbAnalysisSection = stats.ttfbStats ? `
      - TTFB (Server Time) Details: Min=${stats.ttfbStats.min.toFixed(0)}ms, Avg=${stats.ttfbStats.avg.toFixed(0)}ms, Max=${stats.ttfbStats.max.toFixed(0)}ms
    ` : '';

     const timelineDescription = `
      The test ran for ${config.duration} seconds with a peak of ${config.users} users using a '${config.loadProfile}' profile. The average latency was ${stats.avgResponseTime.toFixed(0)} ms, with a range from ${stats.minResponseTime.toFixed(0)} ms to ${stats.maxResponseTime.toFixed(0)} ms. There were ${stats.errorCount} total errors.
    `;

    const systemInstruction = `You are a senior performance analyst. Your task is to interpret load test data and generate a structured, professional report in JSON format. The tone should be clear, insightful, and actionable, suitable for both technical and managerial audiences. You MUST generate a value for every field defined in the JSON schema. Do not omit any fields.`;

    const userPrompt = `
      Analyze the following load test results and generate the complete JSON report.

      **Input Data:**
      - Test Configuration: Peak Users=${config.users}, Duration=${config.duration}s, URL=${isApiScan ? 'API-wide scan' : config.url}
      - Key Metrics: Throughput=${stats.throughput.toFixed(2)} req/s, Success Rate=${((stats.successCount / stats.totalRequests) * 100).toFixed(2)}%, Avg. Response Time=${stats.avgResponseTime.toFixed(0)} ms, Apdex Score=${stats.apdexScore.toFixed(2)}, Latency CV=${stats.latencyCV.toFixed(1)}%
      - Latency Details: Min=${stats.minResponseTime.toFixed(0)}ms, Max=${stats.maxResponseTime.toFixed(0)}ms, StdDev=${stats.latencyStdDev.toFixed(0)}ms
      - Error Distribution: ${JSON.stringify(stats.errorDistribution)}
      - Timeline Summary: ${timelineDescription.replace(/\s+/g, ' ').trim()}
      ${networkAnalysisSection.trim()}
      ${ttfbAnalysisSection.trim()}

      **Analysis Task:**
      Focus on the TTFB (Time To First Byte) as a key indicator of server-side processing time. If TTFB is high or has a large range (check both the average breakdown and the detailed stats), emphasize this as a backend bottleneck in your analysis and recommendations, especially for infrastructure teams.

      **Required JSON Output:**
      Based on the data, generate a JSON object with the following fields. Provide insightful analysis for each.
      - "executiveSummary": A 3-4 sentence high-level summary for a manager.
      - "kpiSummary": An object with "analysis" and "suggestion" keys, explaining the business impact of the key metrics.
      - "timelineSummary": An object with "analysis" and "suggestion" keys, explaining the relationship between user load, latency, and errors over time.
      - "latencySummary": An object with "analysis" and "suggestion" keys, explaining the significance of Min, Avg, Max, and latency variability.
      - "errorSummary": An object with "analysis" and "suggestion" keys, identifying the most prevalent error type and its likely cause. If no errors, state that positively.
      - "networkSummary": (Only if network data is provided) An object with "analysis" and "suggestion" keys, explaining the network breakdown and main bottleneck, with a strong focus on TTFB.
      - "logSummary": A brief, 1-2 sentence summary of the overall request log data.
      - "keyObservations": A list of important technical findings.
      - "recommendations": A list of actionable recommendations for developers.
    `;

    const response = await client.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 32768 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING, description: "A comprehensive but easy-to-understand summary (3-4 sentences) of the test outcome, suitable for a non-technical manager." },
            kpiSummary: {
              type: Type.OBJECT,
              description: "Structured summary for Key Performance Indicators.",
              properties: {
                analysis: { type: Type.STRING, description: "An analysis of what the KPI data means in a business context." },
                suggestion: { type: Type.STRING, description: "An actionable suggestion based on the KPI analysis." }
              },
              required: ["analysis", "suggestion"]
            },
            timelineSummary: {
              type: Type.OBJECT,
              description: "Structured summary for the performance timeline.",
              properties: {
                analysis: { type: Type.STRING, description: "An analysis of the relationship between user load, latency, and errors over time." },
                suggestion: { type: Type.STRING, description: "An actionable suggestion based on the timeline analysis." }
              },
              required: ["analysis", "suggestion"]
            },
            latencySummary: {
              type: Type.OBJECT,
              description: "Structured summary for latency statistics.",
              properties: {
                analysis: { type: Type.STRING, description: "An analysis of the significance of the latency metrics (Min, Avg, Max, etc.)." },
                suggestion: { type: Type.STRING, description: "An actionable suggestion to improve latency consistency." }
              },
              required: ["analysis", "suggestion"]
            },
            errorSummary: {
              type: Type.OBJECT,
              description: "Structured summary for the error distribution.",
              properties: {
                analysis: { type: Type.STRING, description: "An analysis of the likely technical cause of prevalent errors." },
                suggestion: { type: Type.STRING, description: "A suggested fix for the most common errors." }
              },
              required: ["analysis", "suggestion"]
            },
            networkSummary: {
              type: Type.OBJECT,
              description: "Structured summary for the network analysis.",
              properties: {
                analysis: { type: Type.STRING, description: "An analysis of the network timing breakdown, highlighting bottlenecks like TTFB." },
                suggestion: { type: Type.STRING, description: "A targeted recommendation to address the primary network/server bottleneck." }
              },
              required: ["analysis", "suggestion"]
            },
            logSummary: { type: Type.STRING, description: "A brief, 1-2 sentence summary of the overall request log data." },
            keyObservations: {
              type: Type.ARRAY,
              description: "A list of the most important findings. Each observation must explain the metric, its value, and what it means, incorporating error and network analysis.",
              items: {
                type: Type.OBJECT,
                properties: {
                  metric: { type: Type.STRING, description: "The name of the metric being discussed (e.g., 'High Error Rate', 'Server Overload', 'Consistent Performance')." },
                  finding: { type: Type.STRING, description: "A concise description of the observation and its impact, explaining the context (e.g., what 'Network Errors' mean)." },
                  severity: { type: Type.STRING, description: "The severity of the finding. Must be one of: 'Positive', 'Neutral', 'Warning', 'Critical'." }
                },
                required: ["metric", "finding", "severity"]
              }
            },
            recommendations: {
              type: Type.ARRAY,
              description: "A list of actionable recommendations for developers or administrators to improve performance.",
              items: { type: Type.STRING }
            }
          },
          required: ["executiveSummary", "kpiSummary", "timelineSummary", "latencySummary", "errorSummary", "logSummary", "keyObservations", "recommendations"]
        }
      }
    });
    
    jsonText = response.text.trim();
    return JSON.parse(jsonText) as PerformanceReport;
  } catch (e: any) {
      console.error("Error during getAnalysis:", e);
      const errorString = (e.message || e.toString()).toLowerCase();
      if (errorString.includes("api key")) {
          throw new Error("Gemini API Error: The provided API key is invalid. Please verify the value of the API_KEY environment variable.");
      }
      if (e instanceof SyntaxError) {
          console.error("Raw Gemini response:", jsonText);
          throw new Error("Could not parse the performance analysis report from the AI. The response was not valid JSON.");
      }
      throw new Error(`An unexpected error occurred while generating the report: ${e.message || e.toString()}`);
  }
}

export async function getFailureAnalysis(config: LoadTestConfig, stats: TestStats, testRunnerError: string | null): Promise<FailureAnalysisReport> {
    let jsonText = '';
  try {
    const client = getAiClient();
    const isApiScan = config.url === 'API-wide scan';

    const systemInstruction = `You are a senior Site Reliability Engineer (SRE). Your task is to analyze a failed load test, identify the most likely root cause, and provide actionable feedback for developers. Your tone should be technical, direct, and helpful. The output must be a structured JSON object.`;

    const userPrompt = `
      Analyze the following failed load test report and generate a root cause analysis.

      **Input Data:**
      - Test Configuration: Peak Users=${config.users}, Duration=${config.duration}s, URL=${isApiScan ? `API-wide scan of ${config.endpoints?.length || 0} endpoints` : config.url}, Method=${isApiScan ? 'GET' : config.method}, Graceful Shutdown=${config.gracefulShutdown}s
      - Key Metrics: Throughput=${stats.throughput.toFixed(2)} req/s, Error Rate=${((stats.errorCount / stats.totalRequests) * 100).toFixed(2)}%, Avg. Response Time=${stats.avgResponseTime.toFixed(0)} ms
      - Error Distribution: ${JSON.stringify(stats.errorDistribution)}
      - Final Test Runner Error: ${testRunnerError || 'N/A'}

      **Analysis Task:**
      Based on the provided data, especially the error distribution, identify the most likely bottleneck or failure point.
      - A high number of 'Network Errors' or 'Request Timeouts' under load often points to server-side resource exhaustion (CPU, memory, connection pool), not client-side network problems.
      - HTTP 5xx errors point to application-level crashes.
      - **CRITICAL:** A high number of "Request Timeout" errors is ambiguous. It can mean the server is slow OR that the test's "Graceful Shutdown Period" of ${config.gracefulShutdown}s was too short, causing the test runner to abort requests that were still processing. If "Request Timeout" is the dominant error, one of your "Configuration Feedback" suggestions MUST be to increase the graceful shutdown period in the advanced settings to be longer than the max observed latency.

      **Required JSON Output:**
      Generate a JSON object with the following fields:
      - "rootCauseAnalysis": A concise, one-sentence root cause analysis of the test failure.
      - "configurationFeedback": A list of 1-2 actionable suggestions to improve the test configuration itself for a more informative re-run.
      - "suggestedNextSteps": A list of 2-3 specific, actionable steps for a developer to take to investigate and fix the underlying performance issue.
    `;
    
    const response = await client.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 32768 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rootCauseAnalysis: { type: Type.STRING, description: "A concise, one-sentence root cause analysis of the test failure. Example: 'The server became overwhelmed by the user load, leading to a cascade of connection timeouts.'" },
            configurationFeedback: {
              type: Type.ARRAY,
              description: "A list of 1-2 actionable suggestions to improve the test configuration itself for a more informative re-run.",
              items: { type: Type.STRING }
            },
            suggestedNextSteps: {
              type: Type.ARRAY,
              description: "A list of 2-3 specific, actionable steps for a developer to take to investigate and fix the underlying performance issue.",
              items: { type: Type.STRING }
            }
          },
          required: ["rootCauseAnalysis", "configurationFeedback", "suggestedNextSteps"]
        }
      }
    });

    jsonText = response.text.trim();
    return JSON.parse(jsonText) as FailureAnalysisReport;

  } catch (e: any) {
      console.error("Error during getFailureAnalysis:", e);
      const errorString = (e.message || e.toString()).toLowerCase();
      if (errorString.includes("api key")) {
          throw new Error("Gemini API Error: The provided API key is invalid. Please verify the value of the API_KEY environment variable.");
      }
      if (e instanceof SyntaxError) {
          console.error("Raw Gemini response for failure analysis:", jsonText);
          throw new Error("Could not parse the failure analysis report from the AI. The response was not valid JSON.");
      }
      throw new Error(`An unexpected error occurred while generating the failure analysis: ${e.message || e.toString()}`);
  }
}

/**
 * Calculates a deterministic grade based on success rate.
 * This ensures consistency across multiple runs and reports.
 */
function calculateDeterministicGrade(successRate: number): { grade: 'A' | 'B' | 'C' | 'D' | 'F', score: number } {
    if (successRate >= 99.5) return { grade: 'A', score: 98 };
    if (successRate >= 98.0) return { grade: 'B', score: 88 };
    if (successRate >= 95.0) return { grade: 'C', score: 78 };
    if (successRate >= 90.0) return { grade: 'D', score: 68 };
    return { grade: 'F', score: 50 };
}

const trendCategorySchema = {
    type: Type.OBJECT,
    properties: {
        direction: { type: Type.STRING, enum: ['Improving', 'Degrading', 'Stable', 'Inconclusive'] },
        score: { type: Type.INTEGER },
        grade: { type: Type.STRING, enum: ['A', 'B', 'C', 'D', 'F'] },
        rationale: { type: Type.STRING }
    },
    required: ['direction', 'score', 'grade', 'rationale']
};

const trendAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    analyzedRunsCount: { type: Type.INTEGER, description: "The number of test runs being analyzed." },
    trendDirection: { type: Type.STRING, enum: ['Improving', 'Degrading', 'Stable', 'Inconclusive'], description: "Legacy/Overall direction." },
    trendScore: { type: Type.INTEGER, description: "Legacy/Overall score." },
    trendGrade: { type: Type.STRING, enum: ['A', 'B', 'C', 'D', 'F'], description: "Legacy/Overall grade." },
    scoreRationale: { type: Type.STRING, description: "Legacy/Overall rationale." },
    overallTrendSummary: { type: Type.STRING, description: "A high-level, non-technical summary of the performance trend." },
    performanceThreshold: { type: Type.STRING, description: "A clear statement identifying the user load where performance began to significantly degrade." },
    keyObservations: {
      type: Type.ARRAY,
      description: "A list of simple text strings, each describing a specific observation from the data.",
      items: { type: Type.STRING }
    },
    rootCauseSuggestion: { type: Type.STRING, description: "A technical hypothesis for the performance degradation or improvement." },
    recommendations: {
      type: Type.ARRAY,
      description: "A list of actionable recommendations.",
      items: { type: Type.STRING }
    },
    conclusiveSummary: { type: Type.STRING, description: "A detailed, concluding paragraph summarizing the overall health and scalability of the system based on these tests." },
    
    // New specific fields
    apiTrend: { ...trendCategorySchema, description: "Trend analysis for API (Backend) tests (POST/PUT/etc)." },
    webTrend: { ...trendCategorySchema, description: "Trend analysis for Web (Frontend/Get) tests (GET)." }
  },
  required: ['analyzedRunsCount', 'trendDirection', 'trendScore', 'trendGrade', 'scoreRationale', 'overallTrendSummary', 'performanceThreshold', 'keyObservations', 'rootCauseSuggestion', 'recommendations', 'conclusiveSummary']
};

export async function getTrendAnalysis(runs: TestRunSummary[]): Promise<TrendAnalysisReport> {
  let jsonText = '';
  try {
    const client = getAiClient();

    const systemInstruction = `You are a senior Site Reliability Engineer (SRE) specializing in performance trend analysis. Your job is to analyze a series of load test results and produce a report. Crucially, you must distinguish between "API Performance Tests" (typically Backend, WRITE operations like POST/PUT/DELETE) and "Simple Web Tests" (typically Frontend, READ operations like GET). Each category serves a different purpose and must be graded separately if present.`;
    
    // Sort runs chronologically (oldest to newest)
    const sortedRuns = [...runs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    // Calculate grand totals
    const grandTotalRequests = sortedRuns.reduce((acc, run) => acc + (Number(run.stats?.totalRequests) || 0), 0);
    const grandTotalSuccess = sortedRuns.reduce((acc, run) => acc + (Number(run.stats?.successCount) || 0), 0);

    // Split runs into two categories based on Method
    // Safety check: ensure r.config exists and has method before checking
    const apiRuns = sortedRuns.filter(r => r.config?.method && r.config.method !== 'GET' && r.config.method !== 'HEAD');
    // Default to webRuns if method is missing or is GET/HEAD
    const webRuns = sortedRuns.filter(r => !r.config?.method || r.config.method === 'GET' || r.config.method === 'HEAD');

    // Helper to calculate grade for a group
    const getGroupMetrics = (group: TestRunSummary[]) => {
        if (group.length === 0) return null;
        const latest = group[group.length - 1];
        const total = Number(latest.stats?.totalRequests) || 0;
        const errors = Number(latest.stats?.errorCount) || 0;
        const rate = total > 0 ? ((total - errors) / total) * 100 : 0;
        return calculateDeterministicGrade(rate);
    };

    const apiMetrics = getGroupMetrics(apiRuns);
    const webMetrics = getGroupMetrics(webRuns);
    
    // Overall metrics (fallback to API if exists, else Web)
    const overallMetrics = apiMetrics || webMetrics || calculateDeterministicGrade(0);

    const formatRun = (run: TestRunSummary, index: number) => {
        const stats = (run.stats || {}) as Partial<TestStats>;
        const totalRequests = Number(stats.totalRequests) || 0;
        const errorCount = Number(stats.errorCount) || 0;
        const avgResponseTime = Number(stats.avgResponseTime) || 0;
        const throughput = Number(stats.throughput) || 0;
        const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
        const successRate = 100 - errorRate;
        
        const config = (run.config || {}) as Partial<LoadTestConfig>;
        let runContext = `${config.users} Users, ${config.duration}s`;
        if (config.loadProfile === 'stair-step') runContext += `, Stair-Step`;
        
        return `Run ${index + 1} [${config.method || 'UNKNOWN'}] [${run.title || 'Untitled'}]: Avg Latency=${avgResponseTime.toFixed(0)}ms, Success=${successRate.toFixed(2)}%, Throughput=${throughput.toFixed(1)}/s. (${runContext})`;
    };

    const apiRunData = apiRuns.map((r, i) => formatRun(r, i)).join('\n');
    const webRunData = webRuns.map((r, i) => formatRun(r, i)).join('\n');

    // UPDATED PROMPT: More explicit request for concise, non-fluff summary and threshold details.
    const userPrompt = `
      Analyze the following ${runs.length} test runs. Separately analyze "API Transaction Tests" (Backend) and "Web/GET Tests" (Frontend).

      **API Transaction Runs (Backend/Complex):**
      ${apiRunData || "No API/Write tests found."}

      **Web/GET Runs (Frontend/Simple):**
      ${webRunData || "No Web/GET tests found."}

      **Aggregate Statistics:**
      - Grand Total Requests: ${grandTotalRequests.toLocaleString()}
      - Grand Total Success: ${grandTotalSuccess.toLocaleString()}

      **Analysis Requirements:**
      1. **Differentiate:** Clearly distinguish between the two types of tests in your summary.
      2. **API Trend (if applicable):** Analyze the trend for the API runs.
         - MANDATORY GRADE: The latest API run success rate implies a Grade of **${apiMetrics?.grade ?? 'N/A'}** (${apiMetrics?.score ?? 0}). Use this exactly in the 'apiTrend' object.
      3. **Web Trend (if applicable):** Analyze the trend for the Web runs.
         - MANDATORY GRADE: The latest Web run success rate implies a Grade of **${webMetrics?.grade ?? 'N/A'}** (${webMetrics?.score ?? 0}). Use this exactly in the 'webTrend' object.
      4. **Overall Summary:** Provide a concise, detailed executive summary (approx 4-5 sentences). Focus strictly on the correlation between user load, latency, and error rates. Do not use marketing fluff or generic phrases. Be direct and technical.
      5. **Performance Threshold:** Identify the exact user load where performance degrades (if any). Be specific (e.g., "Performance remains stable up to 120 users, after which latency spikes").
      6. **Conclusion:** In 'conclusiveSummary', mention the **Grand Total Successful Submissions** (${grandTotalSuccess.toLocaleString()}) to emphasize the scale of testing.

      **JSON Output:**
      Produce a JSON object matching the schema.
      - Populate 'apiTrend' ONLY if API runs exist.
      - Populate 'webTrend' ONLY if Web runs exist.
      - For 'trendGrade' and 'trendScore' (top-level legacy fields), use the grade from the **API tests** if available, otherwise Web tests.
    `;
    
    const response = await client.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 32768 },
        responseSchema: trendAnalysisSchema
      }
    });
    
    jsonText = response.text.trim();
    // Extra safety cleanup
    jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    
    const parsedReport = JSON.parse(jsonText) as TrendAnalysisReport;

    // SAFETY OVERWRITE: Force deterministic grades to prevent hallucinations
    if (parsedReport.apiTrend && apiMetrics) {
        parsedReport.apiTrend.grade = apiMetrics.grade;
        parsedReport.apiTrend.score = apiMetrics.score;
    }
    if (parsedReport.webTrend && webMetrics) {
        parsedReport.webTrend.grade = webMetrics.grade;
        parsedReport.webTrend.score = webMetrics.score;
    }
    // Overwrite legacy fields
    parsedReport.trendGrade = overallMetrics.grade;
    parsedReport.trendScore = overallMetrics.score;

    return parsedReport;

  } catch (e: any) {
      console.error("Error during getTrendAnalysis:", e);
      const errorString = (e.message || e.toString()).toLowerCase();
      if (errorString.includes("api key")) {
          throw new Error("Gemini API Error: The provided API key is invalid. Please verify the value of the API_KEY environment variable.");
      }
      if (e instanceof SyntaxError) {
          console.error("Raw Gemini response for trend analysis:", jsonText);
          throw new Error("Could not parse the trend analysis report from the AI. The response was not valid JSON.");
      }
      throw new Error(`An unexpected error occurred while generating the trend analysis: ${e.message || e.toString()}`);
  }
}

/**
 * Refines an existing trend analysis report based on user instructions.
 */
export async function refineTrendAnalysis(
    currentReport: TrendAnalysisReport, 
    userInstruction: string,
    runs: TestRunSummary[]
): Promise<TrendAnalysisReport> {
    let jsonText = '';
    try {
        const client = getAiClient();
        // We update the system instruction to act as a JSON Editor/Patcher rather than a fresh generator.
        const systemInstruction = `You are a JSON report editor for a load testing application. Your ONLY job is to modify the provided 'Current Report' JSON based on the 'User Instruction'. You must preserve the structure and all fields that are not explicitly asked to be changed. Do NOT regenerate the report from scratch. Apply specific edits.`;

        const userPrompt = `
        **Task:** Modify the JSON report below according to the user instruction.

        **User Instruction:**
        "${userInstruction}"

        **Current Report (JSON):**
        ${JSON.stringify(currentReport, null, 2)}

        **Constraints:**
        1. Return the *entire* valid JSON object with the modifications applied.
        2. Do NOT change the 'analyzedRunsCount' or any calculated metrics (scores/grades) unless the user specifically asks to "correct" them.
        3. Only edit text fields like 'overallTrendSummary', 'keyObservations', 'recommendations', 'conclusiveSummary', or 'rationale' based on the tone/content requested.
        
        **Output:**
        Return the full, valid JSON object matching the original schema. Do not markdown formatting.
        `;

        const response = await client.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: userPrompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 32768 },
                responseSchema: trendAnalysisSchema
            }
        });

        jsonText = response.text.trim();
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        return JSON.parse(jsonText) as TrendAnalysisReport;

    } catch (e: any) {
        console.error("Error during refineTrendAnalysis:", e);
        throw new Error(`Failed to refine report: ${e.message || e.toString()}`);
    }
}

export async function getComparisonAnalysis(runA: TestRun, runB: TestRun): Promise<ComparisonAnalysisReport> {
  let jsonText = '';
  try {
    const client = getAiClient();

    const systemInstruction = `You are a senior Site Reliability Engineer (SRE). Compare two load test runs and provide a detailed analysis of performance changes. Output must be JSON.`;

    const formatRun = (run: TestRun) => {
        const stats = run.stats;
        return `
        Title: ${run.title}
        Date: ${new Date(run.created_at).toLocaleString()}
        Config: ${run.config.users} users, ${run.config.duration}s duration
        Stats: Avg Latency=${stats.avgResponseTime.toFixed(0)}ms, Throughput=${stats.throughput.toFixed(2)}/s, Error Rate=${((stats.errorCount / stats.totalRequests) * 100).toFixed(2)}%
        `;
    };

    const userPrompt = `
      Compare the following two test runs. Run A is the Baseline. Run B is the Comparison.

      **Baseline (Run A):**
      ${formatRun(runA)}

      **Comparison (Run B):**
      ${formatRun(runB)}

      Generate a JSON report with the following fields:
      - comparisonSummary: Executive summary of the comparison.
      - keyMetricChanges: Array of objects { metric, baselineValue, comparisonValue, delta, analysis, impact ('Positive'|'Negative'|'Neutral') }.
      - rootCauseAnalysis: Analysis of why performance changed.
      - recommendations: List of recommendations.
    `;

    const response = await client.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 32768 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            comparisonSummary: { type: Type.STRING },
            keyMetricChanges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  metric: { type: Type.STRING },
                  baselineValue: { type: Type.STRING },
                  comparisonValue: { type: Type.STRING },
                  delta: { type: Type.STRING },
                  analysis: { type: Type.STRING },
                  impact: { type: Type.STRING, enum: ['Positive', 'Negative', 'Neutral'] }
                },
                required: ['metric', 'baselineValue', 'comparisonValue', 'delta', 'analysis', 'impact']
              }
            },
            rootCauseAnalysis: { type: Type.STRING },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['comparisonSummary', 'keyMetricChanges', 'rootCauseAnalysis', 'recommendations']
        }
      }
    });

    jsonText = response.text.trim();
    return JSON.parse(jsonText) as ComparisonAnalysisReport;
  } catch (e: any) {
      console.error("Error during getComparisonAnalysis:", e);
      throw new Error(`Analysis generation failed: ${e.message}`);
  }
}

export async function generateConfigFromPrompt(prompt: string, apiSpec: any): Promise<any> {
    const client = getAiClient();
    const systemInstruction = "You are an expert QA engineer. Extract load test configuration from the user's natural language prompt and the provided OpenAPI spec.";
    
    const response = await client.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Prompt: ${prompt}\n\nAPI Spec Snippet (Paths): ${JSON.stringify(apiSpec?.paths ? Object.keys(apiSpec.paths).slice(0, 20) : [])}`, // Sending limited spec context
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 32768 },
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    url: { type: Type.STRING, description: "Full target URL derived from spec or prompt" },
                    method: { type: Type.STRING },
                    body: { type: Type.STRING, description: "JSON string of request body" },
                    users: { type: Type.INTEGER },
                    duration: { type: Type.INTEGER },
                    loadProfile: { type: Type.STRING, enum: ["ramp-up", "stair-step"] },
                    rampUp: { type: Type.INTEGER }
                }
            }
        }
    });
    
    return JSON.parse(response.text);
}

// Helper for making validation requests (used by generateAndValidateBody)
async function validateRequest(url: string, method: string, body: string, headers: Header[], authToken: string, useCorsProxy: boolean): Promise<{ ok: boolean; status: number; statusText: string; responseText: string }> {
    const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    headers.forEach(h => { if (h.enabled && h.key) fetchHeaders[h.key] = h.value; });
    if (authToken) {
        fetchHeaders['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }

    try {
        let response;
        if (useCorsProxy) {
             const { data: { session } } = await supabase.auth.getSession();
             if (!session) throw new Error("No session for proxy");
             const functionsUrl = `${supabaseUrl}/functions/v1/cors-proxy`;
             response = await fetch(functionsUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                    'apikey': supabaseAnonKey,
                },
                body: JSON.stringify({
                    url,
                    options: { method, headers: fetchHeaders, body: method !== 'GET' && method !== 'HEAD' ? body : undefined }
                })
             });
        } else {
            response = await fetch(url, {
                method,
                headers: fetchHeaders,
                body: method !== 'GET' && method !== 'HEAD' ? body : undefined
            });
        }
        const text = await response.text();
        return { ok: response.ok, status: response.status, statusText: response.statusText, responseText: text };
    } catch (e: any) {
        return { ok: false, status: 0, statusText: 'Network Error', responseText: e.message };
    }
}

// Helper to get specific endpoint def
function getEndpointDefinition(apiSpec: any, path: string, method: string) {
    // Normalizing path and method to match spec keys usually requires some fuzzy matching or exact match
    // The app passes exact matches from the UI selection hopefully.
    const p = apiSpec.paths?.[path];
    if (!p) return null;
    return p[method.toLowerCase()];
}

export async function generateAndValidateBody(
    apiSpec: any,
    path: string,
    method: string,
    baseUrl: string,
    formFocus: string,
    instructions: string,
    onLog: (log: string) => void,
    signal: AbortSignal,
    maxAttempts: number,
    authToken: string,
    useCorsProxy: boolean,
    headers: Header[]
): Promise<string> {
    const client = getAiClient();
    let currentBody = "";
    let lastError = "";
    let attempts = 0;
    const fullUrl = `${baseUrl.replace(/\/$/, '')}${path}`;

    onLog(`Target: ${method} ${fullUrl}`);

    // Context Preparation
    const endpointDef = getEndpointDefinition(apiSpec, path, method);
    const schemas = apiSpec.components?.schemas || {};
    
    // Create a context object string
    const contextStr = JSON.stringify({
        endpoint: {
            path,
            method,
            definition: endpointDef
        },
        // We provide all schemas so the LLM can resolve $refs
        components: { schemas }
    }, null, 2);

    const systemInstruction = `
You are an expert API Integration Engineer. Your task is to generate a VALID JSON request body for an API endpoint based *strictly* on its OpenAPI definition.

Rules:
1. **Strict Schema Adherence**: You must follow the provided OpenAPI schema definitions exactly. Pay attention to field names (case-sensitivity), data types (string, boolean, array, object), and nesting.
2. **Required Fields**: Ensure ALL required fields defined in the schema are present.
3. **Data Quality**: Generate realistic, valid dummy data.
   - For UUIDs, use valid UUID format.
   - For dates, use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ).
   - For emails, use example.com addresses.
4. **Error Correction**: If a previous attempt failed, carefully analyze the error message.
   - "The X field is required" means you missed a field or nested it incorrectly.
   - "Malformed data" often means the JSON structure doesn't match the DTO expected by the server (e.g., sending an object where an array is expected, or vice versa).
5. **Output**: Return ONLY the raw JSON string. Do not wrap in markdown code blocks like \`\`\`json.
`;

    while (attempts < maxAttempts) {
        if (signal.aborted) throw new AutoFixStoppedError("Stopped by user", currentBody);
        attempts++;
        onLog(`Attempt ${attempts}/${maxAttempts}: Generating payload...`);

        let userPrompt = "";
        
        if (attempts === 1) {
            userPrompt = `
Generate a JSON body for ${method.toUpperCase()} ${path}.

Instructions: ${instructions || "Generate a complete, valid payload."}

API Definition & Schemas:
${contextStr}
            `;
        } else {
            userPrompt = `
The previous payload failed validation.

**Previous Payload:**
${currentBody}

**Server Error:**
${lastError}

**Task:**
1. Analyze why the server rejected the payload based on the Error and the Schema.
2. Fix the JSON. Check for:
   - Missing required fields.
   - Incorrect nesting (e.g. is 'FormData' at the root?).
   - Incorrect casing (PascalCase vs camelCase).
   - Invalid data types.

API Definition & Schemas (Reference):
${contextStr}
            `;
        }

        const response = await client.models.generateContent({
            model: 'gemini-3-pro-preview', // Upgraded model for reasoning
            contents: userPrompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json", // Force JSON output
                thinkingConfig: { thinkingBudget: 32768 }, // Max thinking budget for deep reasoning
            }
        });
        
        currentBody = response.text;
        // Strip code blocks just in case, though mimeType usually handles it
        if (currentBody.startsWith('```')) {
             currentBody = currentBody.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        onLog(`Generated: ${currentBody.substring(0, 150)}...`);

        onLog(`Validating against API...`);
        const validation = await validateRequest(fullUrl, method, currentBody, headers, authToken, useCorsProxy);

        if (validation.ok) {
            onLog(`Success! API accepted the payload.`);
            saveSuccessfulPayload(path, method, currentBody).catch(console.warn);
            return currentBody;
        } else {
            // Improve error logging for the LLM
            let cleanError = validation.responseText;
            try {
                // If error is JSON, try to format it for better LLM readability
                const errObj = JSON.parse(cleanError);
                cleanError = JSON.stringify(errObj, null, 2);
            } catch (e) {}
            
            lastError = `Status ${validation.status}: ${cleanError}`;
            // Truncate extremely long errors to avoid token limit issues, but keep enough context
            if (lastError.length > 2000) lastError = lastError.substring(0, 2000) + "... [truncated]";
            
            onLog(`Validation Failed: ${lastError.substring(0, 200)}...`);
        }
    }
    
    throw new AutoFixStoppedError(`Failed to generate valid payload after ${maxAttempts} attempts.`, currentBody);
}

export async function generateAndValidatePersonalizedData(
    basePayload: string,
    requests: DataGenerationRequest[],
    apiSpec: any,
    baseUrl: string,
    targetPath: string,
    instructions: string,
    onLog: (log: string) => void,
    signal: AbortSignal,
    maxAttempts: number,
    authToken: string,
    networkDiagnosticsEnabled: boolean,
    useCorsProxy: boolean,
    headers: Header[]
): Promise<string> {
    
    onLog("Starting batch generation...");
    const client = getAiClient();
    
    // Generate ONE generated payload as a sample to validate structure
    const prompt = `
        Base Payload Template: ${basePayload}
        
        Generate a JSON array containing ONE new object based on this template, but with unique values for fields like IDs, emails, names, etc.
        Instructions: ${instructions}
    `;
    
    // Use Gemini 3.0 Pro with high thinking budget for the critical sample generation
    const response = await client.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: { 
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 32768 }
        }
    });
    
    const generatedSampleArray = JSON.parse(response.text);
    const sample = Array.isArray(generatedSampleArray) ? generatedSampleArray[0] : generatedSampleArray;
    
    onLog("Validating sample record...");
    const fullUrl = `${baseUrl.replace(/\/$/, '')}${targetPath}`;
    const validation = await validateRequest(fullUrl, "POST", JSON.stringify(sample), headers, authToken, useCorsProxy);
    
    if (!validation.ok) {
        throw new Error(`Sample validation failed: ${validation.status} ${validation.responseText}`);
    }
    
    onLog("Sample valid. Generating full batch...");
    
    let fullData: any[] = [];
    
    for (const req of requests) {
        onLog(`Generating ${req.count} records for ${req.formType}...`);
        // Naive generation loop or single large prompt
        const batchPrompt = `
            Template: ${basePayload}
            Generate ${Math.min(req.count, 50)} unique JSON records for ${req.formType}.
            Output as a JSON array.
        `;
        // Also upgrade batch generation to use 3.0 Pro for consistency and intelligence
        const batchResp = await client.models.generateContent({
             model: 'gemini-3-pro-preview',
             contents: batchPrompt,
             config: { 
                 responseMimeType: "application/json",
                 thinkingConfig: { thinkingBudget: 32768 }
             }
        });
        const batchData = JSON.parse(batchResp.text);
        if (Array.isArray(batchData)) {
            fullData = [...fullData, ...batchData];
        }
    }
    
    return JSON.stringify(fullData, null, 2);
}
