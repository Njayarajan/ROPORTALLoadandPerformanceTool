// ===================================================================================
//
//   !!! CRITICAL SECURITY WARNING !!!
//
//   This file interacts directly with the Google Gemini API using an API key
//   that is exposed on the client-side (in the browser).
//
//   **DO NOT DEPLOY THIS IN A PRODUCTION ENVIRONMENT.**
//
//   Exposing an API key in the browser allows anyone to steal it and use your
//   Google Cloud account, potentially incurring significant costs.
//
//   **MITIGATION:**
//   For a secure, production-ready application, you MUST move all logic from this
//   file into a "Backend-for-Frontend" (BFF) server.
//
//   The frontend should make requests to YOUR BFF, and the BFF will then securely
//   make requests to the Gemini API, attaching the secret key on the server-side.
//   This ensures the API key is never exposed to users.
//
// ===================================================================================

import { GoogleGenAI, Type } from '@google/genai';
import type { LoadTestConfig, TestResultSample, TestStats, PerformanceReport, AssertionResult, DataGenerationRequest, NetworkTimings, FailureAnalysisReport, Header, TrendAnalysisReport, TestRunSummary, TestRun, ComparisonAnalysisReport, ResourceSample } from '../types';
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
 * Executes a single request for a virtual user, including diagnostics and assertions.
 * This function contains the core logic of making one API call.
 */
async function virtualUserSingleRequest(
  config: LoadTestConfig,
  onResult: (result: TestResultSample) => void,
  signal: AbortSignal,
  dataContext?: DataDrivenContext,
  requestIndex?: number
) {
  if (signal.aborted) return; // Prevent starting new requests if the test is already stopped.

  const targetUrl = config.url;
  const targetMethod = config.method;
  let targetBody = config.body;

  // Handle data-driven mode
  if (dataContext) {
      const index = dataContext.getNextIndex();
      
      if (config.dataDrivenMode === 'strict' && index >= dataContext.data.length) {
          return; // No more data, this "request" is a no-op.
      }
      
      const record = dataContext.data[index % dataContext.data.length]; // Loop mode is handled by modulo
      targetBody = JSON.stringify(record);
  }

  // Handle dynamic ID injection if a body and index are provided
  if (targetBody && requestIndex !== undefined && requestIndex >= 0) {
    try {
      const bodyJson = JSON.parse(targetBody);
      let modified = false;

      // Priority 1: ID Pooling from file
      if (config.idPool && config.idPool.length > 0) {
          const pool = config.idPool;
          let idFromPool: string;

          if (config.idPoolingMode === 'random') {
              idFromPool = pool[Math.floor(Math.random() * pool.length)];
          } else { // 'sequential' is the default
              idFromPool = pool[requestIndex % pool.length];
          }
          
          if (bodyJson.ncosId !== undefined) {
              bodyJson.ncosId = idFromPool;
              modified = true;
          }
          if (bodyJson.id !== undefined) {
              bodyJson.id = idFromPool;
              modified = true;
          }
      // Priority 2: Auto-Incrementing (if enabled)
      } else if (config.isIdAutoIncrementEnabled !== false) {
            // FIX: The submission `id` MUST be unique for each request to avoid primary key conflicts. A standard UUID is a safe format.
            // However, the `ncosId` is a user-specific identifier that must remain constant as provided by the template payload.
            // The previous logic incorrectly overwrote `ncosId` with a random value, causing server-side validation to fail (HTTP 500).
            // This corrected logic only modifies the submission `id`, preserving the `ncosId`.
            bodyJson.id = crypto.randomUUID();
            modified = true;
      }
      // Priority 3: No modification if both are disabled/inactive.
      
      if (modified) {
        targetBody = JSON.stringify(bodyJson);
      }
    } catch (e) {
      // Body is not valid JSON, so we can't modify it. Continue with the original body.
    }
  }

  const startTime = performance.now();
  let success = false;
  let statusCode = 0;
  let statusText = '';
  let errorDetails: string | undefined = undefined;
  let responseBody: string | undefined = undefined;

  try {
    const fetchOptions: RequestInit = {
      method: targetMethod,
      signal,
      headers: {},
    };

    // Add custom headers from config first
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

    statusCode = response.status;
    statusText = response.statusText;
    success = response.ok;
    
    const responseText = await response.text();
    responseBody = responseText;

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
           errorDetails = `Request was aborted by the test runner, likely because the test duration was exceeded. This indicates the request took too long to complete.`;
        } else if (err.message.includes('Failed to fetch')) {
           statusText = 'Network Error';
           errorDetails = `Network Error: ${err.message}. This is a generic browser error that often indicates the server is under extreme load and has stopped accepting new connections, or there's a CORS policy issue preventing the browser from reading the response. Check server-side logs for high CPU/memory usage, connection pool exhaustion, or error responses (like 5xx) that might lack the required CORS headers.`;
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
      await new Promise(resolve => setTimeout(resolve, 0)); // Wait for performance entry
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
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    latency: latency,
    success: finalSuccess,
    statusCode: statusCode,
    statusText: statusText,
    errorDetails: errorDetails,
    url: targetUrl, // Report the original URL, not the proxied one
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
        }, 2000); // Poll every 2 seconds

        softStopSignal.addEventListener('abort', () => {
            clearInterval(intervalId);
            resourcePollController.abort();
        });
    }
    
    // --- ITERATION MODE (Worker Pool) ---
    // This mode is architected to prevent the race condition where more requests are sent than specified.
    if (config.runMode === 'iterations') {
        // Use a shared counter to ensure correct, ordered indices across all workers.
        const iterationCounter = {
            i: -1,
            next: function() {
                this.i++;
                if (this.i < config.iterations) {
                    return this.i;
                }
                return null;
            }
        };

        const worker = async () => {
            while (true) {
                const taskIndex = iterationCounter.next();

                if (taskIndex === null || softStopSignal.aborted) {
                    break; // No more tasks or test was stopped by the user.
                }
                
                // For data-driven tests, each task corresponds to one record.
                const taskDataContext = (config.dataDrivenBody && config.dataDrivenBody.length > 0)
                    ? { data: config.dataDrivenBody, getNextIndex: () => taskIndex }
                    : undefined;

                // Stop if in strict mode and we're out of data.
                if (config.dataDrivenMode === 'strict' && taskDataContext && taskIndex >= taskDataContext.data.length) {
                    continue; // This worker skips, another might get the last valid task.
                }

                await virtualUserSingleRequest(config, onResult, hardStopSignal, taskDataContext, taskIndex);

                if (config.pacing > 0) {
                    await abortableSleep(config.pacing, softStopSignal);
                }
            }
        };
        
        // Start all workers (concurrent users)
        const workers = Array.from({ length: config.users }, () => worker());
        try {
            await Promise.all(workers);
        } catch (err) {
            // AbortError is an expected signal to stop, not a real error.
            if (!(err instanceof DOMException && err.name === 'AbortError')) {
                throw err;
            }
        }
    } 
    // --- DURATION MODE (Continuous Runners) ---
    else {
        const dataContext = (config.dataDrivenBody && config.dataDrivenBody.length > 0)
            ? { data: config.dataDrivenBody, getNextIndex: (() => { let i = -1; return () => { i++; return i; } })() }
            : undefined;

        // A shared counter for all runners in duration mode.
        const requestIndexCounter = {
            i: -1,
            next: function() {
                this.i++;
                return this.i;
            }
        };

        // A runner that continuously sends requests until the test signal aborts.
        const durationRunner = async () => {
            while (!softStopSignal.aborted) {
                const requestIndex = requestIndexCounter.next();
                const runnerConfig = { ...config };
                if (config.endpoints && config.endpoints.length > 0) {
                    const endpoint = config.endpoints[Math.floor(Math.random() * config.endpoints.length)];
                    runnerConfig.url = endpoint.url;
                    runnerConfig.method = endpoint.method;
                }

                await virtualUserSingleRequest(runnerConfig, onResult, hardStopSignal, dataContext, requestIndex);
                if (config.pacing > 0) {
                    await abortableSleep(config.pacing, softStopSignal);
                }
            }
        };

        const runners: Array<Promise<void>> = [];
        
        // Ramp-up and stair-step logic is used to start the runners over time.
        if (config.loadProfile === 'ramp-up') {
            const rampUpInterval = config.rampUp > 0 ? (config.rampUp * 1000) / config.users : 0;
            for (let i = 0; i < config.users; i++) {
                if (softStopSignal.aborted) break;
                runners.push(durationRunner());
                if (rampUpInterval > 0) {
                  await abortableSleep(rampUpInterval, softStopSignal);
                }
            }
        } else { // stair-step
            let currentUsers = 0;
            const stepCount = Math.floor(config.duration / config.stepDuration);
            
            for (let i = 0; i < config.initialUsers; i++) {
                if (softStopSignal.aborted || currentUsers >= config.users) break;
                runners.push(durationRunner());
                currentUsers++;
            }
            
            for (let step = 0; step < stepCount; step++) {
                if (softStopSignal.aborted) break;
                await abortableSleep(config.stepDuration * 1000, softStopSignal);
                if (softStopSignal.aborted) break;
                
                for (let i = 0; i < config.stepUsers; i++) {
                    if (softStopSignal.aborted || currentUsers >= config.users) break;
                    runners.push(durationRunner());
                    currentUsers++;
                }
            }
        }
        
        try {
            await Promise.all(runners);
        } catch (err) {
            if (!(err instanceof DOMException && err.name === 'AbortError')) {
                throw err;
            }
        }
    }
    
    if (config.networkDiagnosticsEnabled) {
        performance.clearResourceTimings();
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
      - "logSummary": A brief, 1-2 sentence summary of the request log, mentioning success/failure distribution.
      - "keyObservations": A list of important technical findings.
      - "recommendations": A list of actionable recommendations for developers.
    `;

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
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
              }
            },
            timelineSummary: {
              type: Type.OBJECT,
              description: "Structured summary for the performance timeline.",
              properties: {
                analysis: { type: Type.STRING, description: "An analysis of the relationship between load, latency, and errors over time." },
                suggestion: { type: Type.STRING, description: "An actionable suggestion based on the timeline analysis." }
              }
            },
            latencySummary: {
              type: Type.OBJECT,
              description: "Structured summary for latency statistics.",
              properties: {
                analysis: { type: Type.STRING, description: "An analysis of the significance of the latency metrics (Min, Avg, Max, etc.)." },
                suggestion: { type: Type.STRING, description: "An actionable suggestion to improve latency consistency." }
              }
            },
            errorSummary: {
              type: Type.OBJECT,
              description: "Structured summary for the error distribution.",
              properties: {
                analysis: { type: Type.STRING, description: "An analysis of the likely technical cause of prevalent errors." },
                suggestion: { type: Type.STRING, description: "A suggested fix for the most common errors." }
              }
            },
            networkSummary: {
              type: Type.OBJECT,
              description: "Structured summary for the network analysis.",
              properties: {
                analysis: { type: Type.STRING, description: "An analysis of the network timing breakdown, highlighting bottlenecks like TTFB." },
                suggestion: { type: Type.STRING, description: "A targeted recommendation to address the primary network/server bottleneck." }
              }
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
                }
              }
            },
            recommendations: {
              type: Type.ARRAY,
              description: "A list of actionable recommendations for developers or administrators to improve performance.",
              items: { type: Type.STRING }
            }
          }
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
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
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

export async function getTrendAnalysis(runs: TestRunSummary[]): Promise<TrendAnalysisReport> {
  let jsonText = '';
  try {
    const client = getAiClient();

    const systemInstruction = `You are a senior Site Reliability Engineer (SRE) specializing in performance trend analysis. Your job is to analyze a series of load test results and produce a report for both managers and developers. Your output must be a structured JSON object. You MUST provide a value for every field in the schema. No field, especially 'conclusiveSummary', should ever be an empty string.`;
    
    const sortedRuns = [...runs].sort((a, b) => (Number(a.config?.users) || 0) - (Number(b.config?.users) || 0));
    
    const summaryData = sortedRuns.map(run => {
        const stats = run.stats;
        if (!stats) {
            return `- Test [${run.title || 'Untitled'}]: Data is corrupted or missing stats.`;
        }
        
        // FIX: Defensively access properties on the stats object, coercing them to numbers.
        // This prevents crashes from .toFixed() if a property is missing, null, or a non-numeric string.
        const totalRequests = Number(stats.totalRequests) || 0;
        const errorCount = Number(stats.errorCount) || 0;
        const avgResponseTime = Number(stats.avgResponseTime) || 0;
        const maxResponseTime = Number(stats.maxResponseTime) || 0;
        const throughput = Number(stats.throughput) || 0;

        const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
        
        const config: Partial<LoadTestConfig> = run.config || {};
        const runMode = config.runMode || 'duration';
        const users = config.users ?? 'N/A';
        let runContext = '';

        if (runMode === 'iterations') {
            const iterations = config.iterations ?? 'N/A';
            const pacing = config.pacing ?? 'N/A';
            runContext = `${iterations} Iterations, ${users} Concurrent Users, ${pacing}ms Pacing`;
        } else {
            const duration = config.duration ?? 'N/A';
            runContext = `${users} Peak Users, ${duration}s Duration`;
        }

        return `- Test [${runContext}]: Avg Latency=${avgResponseTime.toFixed(0)}ms, Max Latency=${maxResponseTime.toFixed(0)}ms, Error Rate=${errorRate.toFixed(1)}%, Throughput=${throughput.toFixed(1)} req/s`;
    }).join('\n');

    const userPrompt = `
      Analyze the following series of ${runs.length} load test results, sorted by increasing user load. Your response must be a JSON object that adheres to the provided schema.

      **Test Run Data:**
      (Each line represents a different test run with its configuration and key results)
      ${summaryData}

      **Analysis Guidelines:**
      - Provide a high-level summary, identify the performance "breaking point", suggest a technical root cause, and provide actionable recommendations.
      - Generate a simple array of strings for "keyObservations". Each string should be a specific, data-backed observation.
      
      **CRITICAL REQUIREMENT:** The 'conclusiveSummary' field is the most important part of this report. It MUST be a detailed, insightful paragraph synthesizing all findings, discussing the business and infrastructure impact. It cannot be null, empty, or a short, unhelpful sentence. Failure to provide a comprehensive conclusive summary will result in rejection.

      - **You MUST generate a value for every field defined in the JSON schema.** Do not omit any fields. All fields must be populated with non-empty, meaningful values.

      Ensure the 'analyzedRunsCount' in your JSON output is exactly ${runs.length}.
    `;
    
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analyzedRunsCount: { type: Type.INTEGER, description: "The number of test runs being analyzed." },
            overallTrendSummary: { type: Type.STRING, description: "A high-level, non-technical summary of the performance trend." },
            performanceThreshold: { type: Type.STRING, description: "A clear statement identifying the user load where performance began to significantly degrade." },
            keyObservations: {
              type: Type.ARRAY,
              description: "A list of specific, data-backed observations about performance trends as simple strings.",
              items: { type: Type.STRING }
            },
            rootCauseSuggestion: { type: Type.STRING, description: "The most likely technical root cause for performance degradation." },
            recommendations: {
              type: Type.ARRAY,
              description: "A list of actionable recommendations for developers.",
              items: { type: Type.STRING }
            },
            conclusiveSummary: { type: Type.STRING, description: "A final, one-paragraph summary of the findings, including business and infrastructure impact. This field is mandatory and must not be empty." }
          },
          required: [
              "analyzedRunsCount",
              "overallTrendSummary",
              "performanceThreshold",
              "keyObservations",
              "rootCauseSuggestion",
              "recommendations",
              "conclusiveSummary"
          ]
        }
      }
    });

    jsonText = response.text.trim();
    const parsedJson = JSON.parse(jsonText);
    
    // Final check to ensure the count is correct, which can sometimes be missed by the model.
    if (parsedJson.analyzedRunsCount !== runs.length) {
        console.warn(`AI returned an incorrect run count (${parsedJson.analyzedRunsCount}), correcting to ${runs.length}.`);
        parsedJson.analyzedRunsCount = runs.length;
    }

    return parsedJson as TrendAnalysisReport;

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

export async function getComparisonAnalysis(runA: TestRun, runB: TestRun): Promise<ComparisonAnalysisReport> {
    let jsonText = '';
    try {
        const client = getAiClient();
        const systemInstruction = `You are a senior performance engineer. Your task is to analyze two load test runs (a baseline and a comparison) and produce a detailed, data-driven comparison report in JSON format. The tone should be technical, insightful, and actionable. Be precise and use the provided data to back up your conclusions.`;

        const formatStats = (stats: TestStats) => ({
            throughput: `${stats.throughput.toFixed(2)} req/s`,
            avgLatency: `${stats.avgResponseTime.toFixed(0)} ms`,
            maxLatency: `${stats.maxResponseTime.toFixed(0)} ms`,
            errorRate: `${((stats.errorCount / stats.totalRequests) * 100).toFixed(1)}%`,
            apdex: stats.apdexScore.toFixed(2),
            consistency: `${stats.latencyCV.toFixed(1)}%`
        });
        
        const userPrompt = `
            Analyze the following two load test runs. 'Baseline' is the original run, and 'Comparison' is the new run.

            **Baseline Run Data ("${runA.title}"):**
            - Config: ${runA.config.users} users, ${runA.config.runMode === 'duration' ? `${runA.config.duration}s duration` : `${runA.config.iterations} iterations`}, ${runA.config.loadProfile} profile.
            - Stats: ${JSON.stringify(formatStats(runA.stats))}

            **Comparison Run Data ("${runB.title}"):**
            - Config: ${runB.config.users} users, ${runB.config.runMode === 'duration' ? `${runB.config.duration}s duration` : `${runB.config.iterations} iterations`}, ${runB.config.loadProfile} profile.
            - Stats: ${JSON.stringify(formatStats(runB.stats))}
            
            **Analysis Task:**
            1.  **Comparison Summary:** Write a 2-3 sentence summary explaining the overall outcome. Did performance improve, degrade, or stay the same? Mention the most significant change.
            2.  **Key Metric Changes:** For each key metric (Throughput, Avg. Latency, Max Latency, Error Rate), provide a detailed breakdown. Include the baseline value, comparison value, the percentage delta, a concise analysis of what the change means, and its impact (Positive/Negative/Neutral).
            3.  **Root Cause Analysis:** Based on the changes in configuration between the two runs (e.g., user count, duration, endpoint), explain *why* the performance changed. Be specific. For example, "The increase in virtual users from 50 to 100 likely caused server resource contention, leading to the 150% increase in average latency."
            4.  **Recommendations:** Provide 2-3 actionable recommendations for developers or testers based on your findings.

            **Required JSON Output:**
            Generate a JSON object that adheres to the defined schema.
        `;

        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userPrompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        comparisonSummary: { type: Type.STRING, description: "A high-level summary of the comparison outcome." },
                        keyMetricChanges: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    metric: { type: Type.STRING, description: "Name of the metric (e.g., 'Throughput')." },
                                    baselineValue: { type: Type.STRING, description: "The value from the baseline run, with units." },
                                    comparisonValue: { type: Type.STRING, description: "The value from the comparison run, with units." },
                                    delta: { type: Type.STRING, description: "The percentage change (e.g., '+15.2%')." },
                                    analysis: { type: Type.STRING, description: "A brief explanation of what this change signifies." },
                                    impact: { type: Type.STRING, description: "Must be 'Positive', 'Negative', or 'Neutral'." }
                                }
                            }
                        },
                        rootCauseAnalysis: { type: Type.STRING, description: "An explanation of why performance changed, linking to configuration differences." },
                        recommendations: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "A list of actionable recommendations."
                        }
                    },
                    required: ["comparisonSummary", "keyMetricChanges", "rootCauseAnalysis", "recommendations"]
                }
            }
        });
        
        jsonText = response.text.trim();
        return JSON.parse(jsonText) as ComparisonAnalysisReport;
    } catch (e: any) {
        console.error("Error during getComparisonAnalysis:", e);
        const errorString = (e.message || e.toString()).toLowerCase();
        if (errorString.includes("api key")) {
            throw new Error("Gemini API Error: The provided API key is invalid. Please verify the value of the API_KEY environment variable.");
        }
        if (e instanceof SyntaxError) {
            console.error("Raw Gemini response for comparison analysis:", jsonText);
            throw new Error("Could not parse the comparison analysis from the AI. The response was not valid JSON.");
        }
        throw new Error(`An unexpected error occurred while generating the comparison analysis: ${e.message || e.toString()}`);
    }
}

export async function generateConfigFromPrompt(prompt: string, apiSpec: any): Promise<Partial<LoadTestConfig>> {
  let jsonText = '';
  try {
    const client = getAiClient();
    const systemInstruction = `You are an API performance testing expert. Your task is to generate a valid load test configuration in JSON format based on a user's natural language prompt and an OpenAPI specification. You must infer the most appropriate endpoint and method from the user's request and the spec. Only output the raw JSON. The body must be a stringified JSON.`;

    const userPrompt = `
      Based on the following user request and the provided OpenAPI specification, generate a load test configuration.

      **User Request:**
      "${prompt}"

      **OpenAPI Specification (Paths):**
      ${JSON.stringify(apiSpec.paths, null, 2)}

      **Task:**
      - Identify the most relevant endpoint and method from the spec that matches the user's request.
      - If the request implies a request body (e.g., for a POST or PUT), use the spec to generate a simple, valid example body. The body must be a JSON string.
      - Infer the test parameters (users, duration, etc.) from the request. Use sensible defaults if not specified (e.g., 50 users, 60 seconds).
      - Construct the full URL using one of the servers defined in the spec if available, otherwise assume a placeholder.
      
      **Required JSON Output:**
      Generate a JSON object with the following fields.
    `;
    
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            url: { type: Type.STRING, description: "The full URL of the endpoint to test." },
            method: { type: Type.STRING, description: "The HTTP method (e.g., 'POST', 'GET')." },
            body: { type: Type.STRING, description: "The JSON request body as a string. Empty string for GET." },
            users: { type: Type.INTEGER, description: "Number of concurrent users." },
            duration: { type: Type.INTEGER, description: "Test duration in seconds." },
            loadProfile: { type: Type.STRING, description: "Load profile: 'ramp-up' or 'stair-step'." },
            rampUp: { type: Type.INTEGER, description: "Ramp-up period in seconds for 'ramp-up' profile." }
          },
          required: ["url", "method", "body", "users", "duration", "loadProfile", "rampUp"]
        }
      }
    });
    
    jsonText = response.text.trim();
    return JSON.parse(jsonText) as Partial<LoadTestConfig>;

  } catch (e: any) {
    console.error("Error during generateConfigFromPrompt:", e);
    if (e instanceof SyntaxError) {
        console.error("Raw Gemini response for config generation:", jsonText);
        throw new Error("Could not parse the test configuration from the AI. The response was not valid JSON.");
    }
    throw new Error(`An unexpected error occurred while generating the test configuration: ${e.message || e.toString()}`);
  }
}


export async function generateSampleBody(
  apiSpec: any,
  path: string,
  method: string,
  formFocus: string = 'all',
  customInstructions: string = '',
  existingBody: string | null = null,
  errorHistory: { status: number; body: string }[] | null = null
): Promise<string> {
   let potentialJson = '';
   try {
    const client = getAiClient();
    const learnedPayloads = await getLearnedPayloads(path, method);
    const now = new Date().toISOString();

    let systemInstruction = `You are an API testing assistant. Your task is to generate a valid JSON request body based on an OpenAPI specification and user instructions. The JSON should be realistic and ready to use for an API call. Only output the raw JSON, with no explanations or markdown.`;

    let prompt = `
      Generate a JSON request body for the endpoint: ${method.toUpperCase()} ${path}
      
      **CRITICAL INSTRUCTION:** The top-level \`submitDateTime\` field MUST be set to the exact current timestamp: \`${now}\`. You must use this exact value.

      ${learnedPayloads.length > 0 ? `
      Here are some examples of previously successful JSON bodies for this endpoint. Use them as a strong reference for the correct structure and data types:
      ${learnedPayloads.map(p => `\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\``).join('\n\n')}
      ` : ''}

      API Specification context (components/schemas section):
      ${JSON.stringify(apiSpec.components.schemas, null, 2)}
      
      The target schema for the request body is for the path '${path}'.
    `;

    if (formFocus !== 'all') {
      prompt += `\n\nThe user wants to test a specific part of a larger form. Focus on generating a complete and valid payload, but only populate the '${formFocus}' section with data. All other sections should be present but contain null, empty, or default values as appropriate according to their schema types.`;
    } else {
      // Add extremely strict instructions for the 'all' case to ensure full validation.
      prompt += `
      \n\n**CRITICAL INSTRUCTION:** You are generating a payload for 'All Forms'. This requires absolute completeness.
      - **EVERY SINGLE FIELD** defined in the schema for the request body must be present and populated with a realistic, valid, non-null value.
      - **DO NOT** use 'required' fields as a guide; treat ALL fields as mandatory.
      - **NEVER** generate \`null\` values.
      - **NEVER** generate empty arrays (\`[]\`). If a field is an array (e.g., 'addresses', 'vehicles'), you MUST generate at least one valid, fully populated object for it.
      - **NEVER** generate empty objects (\`{}\`). All objects must be fully populated according to their schema.
      `;
    }
    
    if (customInstructions) {
      prompt += `\n\nAdhere to the following custom instructions:
      ${customInstructions}`;
    }

    if (existingBody) {
        if (errorHistory && errorHistory.length > 0) {
            const attemptNumber = errorHistory.length + 1;
            systemInstruction = `You are a hyper-intelligent AI with unparalleled debugging capabilities, acting as a senior principal engineer. Your mission is to fix a failing API request body with surgical precision. You will be provided with the complete OpenAPI specification (the ultimate source of truth), a history of failed API calls with their error responses, and the last JSON payload that failed.

**Core Directives:**

1.  **Deep Analysis:** Do not just look at the last error. Analyze the **entire sequence of errors** to identify patterns or recurring validation issues. Understand the evolution of the problem. Is the AI getting stuck in a loop? Is there a fundamental misunderstanding of the schema?
2.  **Schema Supremacy:** The OpenAPI specification is non-negotiable. The final payload **MUST** conform to it perfectly, including data types (string vs. number), formats (e.g., date-time), and object structures. Pay extremely close attention to nested objects and arrays.
3.  **Holistic Debugging:** While the most recent error is your primary focus, consider if it's a symptom of a deeper structural problem. If correcting a single field has failed repeatedly, re-evaluate the entire object or section containing that field. It may be necessary to restructure a part of the JSON, not just change a value.
4.  **Minimalism with a Caveat:** Your default strategy is to make the smallest possible change to fix the error. However, if this strategy proves ineffective (as evidenced by the error history), you are empowered to make larger, more structural changes to the payload to achieve a valid state. Your goal is success, not just minimal change.
5.  **Ignore External Factors:** The error messages might mention issues outside the JSON body (e.g., missing HTTP headers like 'Ocp-Apim-Subscription-Key', 'Authorization', or invalid query parameters). You MUST recognize these and understand that your **sole responsibility** is to fix the JSON body. **DO NOT** add headers or other non-body parameters into the JSON payload.
6.  **Zero Tolerance for Errors:** Do not generate \`null\` for required fields, empty arrays \`[]\` where objects are expected, or empty objects \`{}\`. Ensure every part of the payload is meaningful and valid according to the schema.

**Output:**
Your final output must be **only the corrected, raw JSON payload**. Do not include any explanations, markdown, or conversational text. This is attempt number ${attemptNumber}.`;
            
            const errorContextString = errorHistory.map((err, index) => 
                `--- Error from Attempt #${index + 1} ---\nStatus: ${err.status}\nResponse:\n${err.body}`
            ).join('\n\n');

            prompt += `\n\nThe previous attempts using the JSON body below failed. Analyze the full error history and correct the JSON to resolve the issues.
            \n**Full Error History:**\n${errorContextString}
            \n\n**Last Failing JSON Body (to be fixed):**
            \n${existingBody}`;
        } else {
            systemInstruction += `\n\nYou will be given an existing JSON body. You must modify it according to the new custom instructions, preserving the overall structure.`;
            prompt += `\n\nHere is the existing JSON body to modify:
            \n${existingBody}`;
        }
    }

    const modelConfig: any = { systemInstruction };
    
    // When performing an auto-fix (indicated by a non-empty errorHistory),
    // allocate the maximum thinking budget to the AI. This gives it more
    // resources to reason about complex validation errors and produce a better fix.
    if (errorHistory && errorHistory.length > 0) {
        modelConfig.thinkingConfig = { thinkingBudget: 24576 }; // Max for gemini-2.5-flash
    }

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: modelConfig
    });

    const text = response.text.trim();
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    potentialJson = jsonMatch ? jsonMatch[1] : text;

    JSON.parse(potentialJson);
    return potentialJson;
  } catch (e: any) {
    console.error("Error during generateSampleBody:", e);
    const errorString = (e.message || e.toString()).toLowerCase();

    if (errorString.includes("api key")) {
      throw new Error("Gemini API Error: The provided API key is invalid. Please verify the value of the API_KEY environment variable.");
    }
    if (e instanceof SyntaxError) {
      console.error("Raw Gemini response:", potentialJson);
      throw new Error("The AI failed to generate a valid JSON body. Please try again or check your custom instructions.");
    }
    
    throw new Error(`An unexpected error occurred while generating the sample body: ${e.message || e.toString()}`);
  }
}

/**
 * Iteratively generates and validates a request body against a live endpoint.
 */
export async function generateAndValidateBody(
    apiSpec: any,
    path: string,
    method: string,
    baseUrl: string,
    formFocus: string,
    customInstructions: string,
    onLog: (log: string) => void,
    signal: AbortSignal,
    maxAttempts: number = 7,
    authToken?: string,
    useCorsProxy?: boolean,
    headersConfig?: Header[]
): Promise<string> {
    let currentBody: string | null = null;
    const errorHistory: { status: number; body: string }[] = [];

    onLog(`Starting automated payload validation for ${method} ${path}...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (signal.aborted) {
            throw new AutoFixStoppedError('Auto-fix process was stopped by the user.', currentBody);
        }

        onLog(`\n--- Attempt ${attempt} of ${maxAttempts} ---`);
        
        try {
            onLog('Instructing AI to generate/correct payload...');
            currentBody = await generateSampleBody(
                apiSpec,
                path,
                method,
                formFocus,
                customInstructions,
                currentBody,
                errorHistory
            );
            onLog('Payload received from AI.');
            try {
                onLog(`Payload:\n${JSON.stringify(JSON.parse(currentBody), null, 2)}`);
            } catch {
                onLog(`Raw Payload (Invalid JSON):\n${currentBody}`);
            }

            const targetUrl = (baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl) + path;
            onLog(`Sending test request to ${targetUrl}...`);

            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            
            if (headersConfig) {
                for (const header of headersConfig) {
                    if (header.enabled && header.key) {
                        (headers as Record<string, string>)[header.key] = header.value;
                    }
                }
            }
            
            if (authToken) {
                let authHeaderValue = authToken;
                if (!/^bearer /i.test(authHeaderValue)) {
                    authHeaderValue = `Bearer ${authHeaderValue}`;
                }
                (headers as Record<string, string>)['Authorization'] = authHeaderValue;
            }
            
            const fetchOptions: RequestInit = {
                method: method.toUpperCase(),
                headers,
                body: currentBody,
                signal,
            };

            let response;
            if (useCorsProxy) {
                onLog('Using CORS Proxy for validation request...');
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
                    body: JSON.stringify({ url: targetUrl, options: proxyOptions }),
                    signal,
                });
            } else {
                response = await fetch(targetUrl, fetchOptions);
            }


            if (response.ok) {
                onLog(`✅ Validation successful with status ${response.status}!`);
                try {
                    await saveSuccessfulPayload(path, method, currentBody);
                    onLog(`✅ Successfully saved payload to learning database.`);
                } catch (saveError) {
                    const errorMessage = saveError instanceof Error ? saveError.message : 'Unknown DB error';
                    onLog(`⚠️ Could not save payload to learning database: ${errorMessage}`);
                }
                return currentBody;
            } else {
                const errorBody = await response.text();
                errorHistory.push({ status: response.status, body: errorBody });
                onLog(`❌ Request failed with status ${response.status}. Preparing for next attempt.`);
                onLog(`Error Response:\n${errorBody}`);
                
                if (attempt === maxAttempts) {
                    throw new Error(`Auto-fix failed after ${maxAttempts} attempts. Last error: ${errorBody}`);
                }
            }
        } catch (err) {
             if (err instanceof AutoFixStoppedError) {
                throw err; // Re-throw to be caught by the caller
            }
            if (err instanceof Error && err.name === 'AbortError') {
                throw new AutoFixStoppedError('Auto-fix process was stopped by the user during validation.', currentBody);
            }
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            onLog(`An error occurred during attempt ${attempt}: ${errorMessage}`);
            if (attempt === maxAttempts) {
                throw new Error(`Auto-fix failed. Error during final attempt: ${errorMessage}`);
            }
            errorHistory.push({ status: 0, body: `Client-side error during validation: ${errorMessage}` });
        }
    }

    throw new Error('Auto-fix failed to produce a successful payload.');
}


/**
 * Generates a specific type of data field in a structured array format.
 * This is a highly specialized and efficient function for generating test data.
 */
async function generateFieldArray(
    fieldType: string, 
    count: number, 
    customInstructions: string,
    errorHistory: { status: number; body: string }[] | null,
    attemptNumber?: number,
    fieldSchema?: any
): Promise<any[]> {
    let jsonText = '';
    try {
        const client = getAiClient();
        let promptIntro = '';
        let schemaForPrompt: any;

        let systemInstruction = `You are a test data generation specialist. Your task is to generate a valid JSON array of objects based on the user's request. Only output the raw JSON, with no explanations or markdown.`;

        if (fieldType === 'pii') {
            schemaForPrompt = {
                type: 'object',
                properties: {
                    name: { type: 'string', description: "A unique first name." },
                    surName: { type: 'string', description: "A unique last name." },
                    email: { type: 'string', description: "A unique, realistic email address for the top-level field."},
                    phone: { type: 'string', description: "A unique 10-digit Australian mobile number." },
                }
            };
            promptIntro = `Each object must contain a unique name, surname, email, and phone number for a person.`;
        } else {
            if (!fieldSchema) {
                throw new Error(`Schema is required for generating field type: ${fieldType}`);
            }
            schemaForPrompt = fieldSchema;
            promptIntro = `Each object in the array must be a valid '${fieldType}' object.`;
        }
        
        let prompt = `
        Your task is to generate a raw JSON array containing exactly ${count} objects.
        ${promptIntro}

        Each object in the array must conform to the following JSON schema:
        \`\`\`json
        ${JSON.stringify(schemaForPrompt, null, 2)}
        \`\`\`
        
        CRITICAL RULES:
        1. All generated values MUST be unique across all ${count} objects, especially for identifying fields.
        2. The output must be ONLY the raw JSON array, without any markdown or explanatory text.
        `;
        
        if (customInstructions) {
          prompt += `\n\nUSER INSTRUCTIONS (High Priority):\n${customInstructions}`;
        }

        if (errorHistory && errorHistory.length > 0) {
            systemInstruction = `You are a hyper-intelligent AI with unparalleled debugging capabilities, acting as a senior principal engineer. Your mission is to fix a failing test data generation request. You will be given a schema for the data, a history of failed API calls with their error responses, and the user's instructions.

    **Core Directives:**

    1.  **Analyze Errors:** The API rejected the data you previously generated. Analyze the **entire sequence of errors** to understand why. The problem is likely in the format, uniqueness, or realism of the data for the field type: '${fieldType}'.
    2.  **Schema Supremacy:** The JSON Schema provided is non-negotiable. The final data array **MUST** conform to it perfectly, including data types (string vs. number) and formats.
    3.  **Holistic Debugging:** If correcting a value format has failed repeatedly, re-evaluate your entire generation strategy for this field type. For example, if 'passport numbers' are failing, they might require a specific format or checksum you missed.
    4.  **Ignore External Factors:** The error messages might mention issues outside the data itself (e.g., missing HTTP headers). You MUST recognize these and understand that your **sole responsibility** is to generate a valid array of data for the specified fields.
    5.  **Uniqueness is Key:** The user requires all generated values to be unique. Do not repeat values across the objects in the array.

    **Output:**
    Your final output must be **only the corrected, raw JSON array of data**. Do not include any explanations or markdown. This is attempt number ${attemptNumber}.`;
            
            const errorContextString = errorHistory.map((err, index) => 
                `--- Error from Attempt #${index + 1} ---\nStatus: ${err.status}\nResponse:\n${err.body}`
            ).join('\n\n');

            prompt += `
            \n---
            ERROR CORRECTION (HIGHEST PRIORITY):
            ---
            Previous attempts to use the generated data failed with API errors. 
            Analyze the ENTIRE error history below and modify your data generation to resolve all issues. The most recent error is the most relevant.
            
            **Full Error History:**
            ${errorContextString}
            `;
        }
        
        const modelConfig: any = {
            systemInstruction,
            responseMimeType: "application/json",
        };

        if (errorHistory && errorHistory.length > 0) {
            modelConfig.thinkingConfig = { thinkingBudget: 24576 };
        }

        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: modelConfig
        });

        jsonText = response.text.trim();
        const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```/);
        const parsableText = jsonMatch ? jsonMatch[1] : jsonText;

        const parsedData = JSON.parse(parsableText);

        if (!Array.isArray(parsedData)) {
            throw new Error(`AI did not return a JSON array for field type '${fieldType}'.`);
        }
        return parsedData;
    } catch (e: any) {
        console.error(`Error during generateFieldArray for type '${fieldType}':`, e);
        const errorString = (e.message || e.toString()).toLowerCase();
        if (errorString.includes("api key")) {
            throw new Error("Gemini API Error: The provided API key is invalid. Please verify the value of the API_KEY environment variable.");
        }
        if (e instanceof SyntaxError) {
            console.error("Raw Gemini response for field array generation:", jsonText);
            throw new Error(`Could not parse the data from the AI for '${fieldType}'. The response was not valid JSON.`);
        }
        throw new Error(`An unexpected error occurred while generating data for '${fieldType}': ${e.message || e.toString()}`);
    }
}

/**
 * Fetches all required personalized data sets in parallel.
 */
async function generatePersonalizationDataSets(
    requests: DataGenerationRequest[],
    totalRecords: number,
    customInstructions: string,
    errorHistory: { status: number; body: string }[] | null,
    attemptNumber?: number,
    apiSpec?: any
): Promise<Record<string, any[]>> {
    const dataPromises: Record<string, Promise<any[]>> = {};
    const uniqueRequestTypes = new Set(requests.map(r => r.formType));

    // Always fetch unique PII for the total number of records
    dataPromises['pii'] = generateFieldArray('pii', totalRecords, customInstructions, errorHistory, attemptNumber);

    if (apiSpec) {
        uniqueRequestTypes.forEach(formType => {
            const relevantRequests = requests.filter(r => r.formType === formType);
            const maxCount = Math.max(...relevantRequests.map(r => r.count));
            
            try {
                const formDataSchema = apiSpec.components?.schemas?.FormDataDto?.properties?.[formType];
                if (formDataSchema?.items?.$ref) {
                    const refName = formDataSchema.items.$ref.split('/').pop();
                    const itemSchema = refName ? apiSpec.components.schemas[refName] : null;
                    if (itemSchema) {
                        dataPromises[formType] = generateFieldArray(formType, maxCount, customInstructions, errorHistory, attemptNumber, itemSchema);
                    } else {
                         console.warn(`Could not resolve schema for form type: ${formType}`);
                    }
                } else {
                    console.warn(`Schema definition not found or is invalid for form type: ${formType}`);
                }
            } catch (e) {
                 console.error(`Error processing schema for ${formType}:`, e);
            }
        });
    }

    const promiseEntries = Object.entries(dataPromises);
    const results = await Promise.all(promiseEntries.map(entry => entry[1]));
    
    const dataSets: Record<string, any[]> = {};
    promiseEntries.forEach((entry, index) => {
        dataSets[entry[0]] = results[index];
    });

    return dataSets;
}


export async function generateAndValidatePersonalizedData(
    basePayloadString: string,
    requests: DataGenerationRequest[],
    apiSpec: any,
    baseUrl: string,
    endpointPath: string,
    customInstructions: string,
    onLog: (log: string) => void,
    signal: AbortSignal,
    maxAttempts: number = 7,
    authToken?: string,
    networkDiagnosticsEnabled?: boolean,
    useCorsProxy?: boolean,
    headersConfig?: Header[]
): Promise<string> {
    const errorHistory: { status: number; body: string }[] = [];
    let finalPayload: any[] = [];
    let assembledPayloadString: string | null = null;
    const totalRecords = Math.max(1, ...requests.map(r => r.count));

    onLog(`Starting efficient data generation for ${totalRecords} records.`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (signal.aborted) {
            throw new AutoFixStoppedError('Data generation was stopped by the user.', assembledPayloadString);
        }

        onLog(`\n--- Attempt ${attempt} of ${maxAttempts} ---`);
        
        try {
            onLog('Instructing AI to generate personalized data fields in parallel...');
            const dataSets = await generatePersonalizationDataSets(requests, totalRecords, customInstructions, errorHistory, attempt, apiSpec);
            onLog('AI returned all required data sets.');

            onLog('Assembling full data payload on the client...');
            const basePayload = JSON.parse(basePayloadString);
            finalPayload = []; // Reset on each attempt
            
            onLog(`For each of the ${totalRecords} records, a full copy of the base payload is created. Then, unique data is injected into specific fields.`);
            
            const firstPiiData = dataSets.pii[0];
            
            let injectionExample = `Example injection for Record #1:\n`
            if (firstPiiData) injectionExample += `  - PII: name=${firstPiiData.name}, email=${firstPiiData.email}\n`;
            
            const exampleReq = requests[0];
            if (exampleReq && dataSets[exampleReq.formType]) {
                const firstExampleData = dataSets[exampleReq.formType][0];
                if (firstExampleData) {
                    const firstKey = Object.keys(firstExampleData)[0];
                    if (firstKey) {
                        injectionExample += `  - ${exampleReq.formType} Form: ${firstKey}=${firstExampleData[firstKey]}\n`;
                    }
                }
            }
            onLog(injectionExample);
            
            for (let i = 0; i < totalRecords; i++) {
                const recordTemplate = JSON.parse(JSON.stringify(basePayload)); // Deep copy
                const piiData = dataSets.pii[i % dataSets.pii.length];

                // Inject base PII
                recordTemplate.name = piiData.name;
                recordTemplate.surName = piiData.surName;
                recordTemplate.phone = piiData.phone;
                recordTemplate.email = piiData.email; // Also update top-level email if possible
                recordTemplate.submitDateTime = new Date().toISOString();

                // Inject form-specific data
                requests.forEach(req => {
                    const dataSet = dataSets[req.formType];
                    if (!dataSet) return;
                    
                    const data = dataSet[i % dataSet.length];

                    // Generic injection: find the form data array and merge the first item
                    if (recordTemplate.formData[req.formType] && Array.isArray(recordTemplate.formData[req.formType]) && recordTemplate.formData[req.formType][0]) {
                        Object.assign(recordTemplate.formData[req.formType][0], data);
                    }
                });
                finalPayload.push(recordTemplate);
            }
            assembledPayloadString = JSON.stringify(finalPayload, null, 2);
            onLog(`✅ Successfully assembled a complete payload with ${finalPayload.length} records.`);
            
            const firstRecord = finalPayload[0];
            onLog(`\nTo ensure efficiency, only the first record will be sent to the API for a quick validation check.`);
            onLog(`First record sample being sent for validation:\n${JSON.stringify(firstRecord, null, 2)}`);
            
            const targetUrl = (baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl) + endpointPath;
            onLog(`Sending validation request to ${targetUrl}...`);

            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            
            if (headersConfig) {
                for (const header of headersConfig) {
                    if (header.enabled && header.key) {
                        (headers as Record<string, string>)[header.key] = header.value;
                    }
                }
            }
            
            if (authToken) {
                let authHeaderValue = authToken;
                if (!/^bearer /i.test(authHeaderValue)) {
                    authHeaderValue = `Bearer ${authHeaderValue}`;
                }
                (headers as Record<string, string>)['Authorization'] = authHeaderValue;
            }
            
            const fetchOptions: RequestInit = {
                method: 'POST',
                headers,
                body: JSON.stringify(firstRecord),
                signal,
            };

            if (networkDiagnosticsEnabled) {
                performance.clearResourceTimings();
            }

            let response;
            if (useCorsProxy) {
                 onLog('Using CORS Proxy for validation request...');
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
                    body: JSON.stringify({ url: targetUrl, options: proxyOptions }),
                    signal,
                });
            } else {
                response = await fetch(targetUrl, fetchOptions);
            }

            if (networkDiagnosticsEnabled) {
                await new Promise(resolve => setTimeout(resolve, 0)); // Wait for performance entry
                const entries = performance.getEntriesByName(targetUrl, 'resource');
                if (entries.length > 0) {
                    const perfEntry = entries[entries.length - 1] as PerformanceResourceTiming;
                    if (perfEntry) {
                        const networkTimings: NetworkTimings = {
                            dns: perfEntry.domainLookupEnd - perfEntry.domainLookupStart,
                            tcp: perfEntry.connectEnd - perfEntry.connectStart,
                            tls: (perfEntry.secureConnectionStart > 0) ? (perfEntry.connectEnd - perfEntry.secureConnectionStart) : 0,
                            ttfb: perfEntry.responseStart - perfEntry.requestStart,
                            download: perfEntry.responseEnd - perfEntry.responseStart,
                            total: perfEntry.duration
                        };
                        onLog(`\n--- Network Timing ---\nDNS:        ${networkTimings.dns.toFixed(0)} ms\nTCP:        ${networkTimings.tcp.toFixed(0)} ms\nTLS:        ${networkTimings.tls.toFixed(0)} ms\nTTFB:       ${networkTimings.ttfb.toFixed(0)} ms\nDownload:   ${networkTimings.download.toFixed(0)} ms\n--------------------\nTotal:      ${networkTimings.total.toFixed(0)} ms`);
                    }
                }
            }

            if (response.ok) {
                onLog(`✅ Validation successful with status ${response.status}! The generated data structure is valid.`);
                try {
                    await saveSuccessfulPayload(endpointPath, 'POST', JSON.stringify(firstRecord));
                    onLog(`✅ Successfully saved the first valid record to the learning database.`);
                } catch (saveError) {
                    const errorMessage = saveError instanceof Error ? saveError.message : 'Unknown DB error';
                    onLog(`⚠️ Could not save payload to learning database: ${errorMessage}`);
                }
                return assembledPayloadString;
            } else {
                const errorBody = await response.text();
                const newError = { status: response.status, body: errorBody };
                errorHistory.push(newError);
                onLog(`❌ Validation failed with status ${response.status}. The API rejected the data. Instructing AI to fix it.`);
                onLog(`Error Response:\n${errorBody}`);
                
                if (attempt === maxAttempts) {
                    throw new Error(`Data generation failed after ${maxAttempts} attempts. Last error: ${errorBody}`);
                }
            }
        } catch (err) {
             if (err instanceof AutoFixStoppedError) {
                throw err;
            }
            if (err instanceof Error && err.name === 'AbortError') {
                throw new AutoFixStoppedError('Data generation was stopped by the user during validation.', assembledPayloadString);
            }
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            onLog(`An error occurred during attempt ${attempt}: ${errorMessage}`);
            if (attempt === maxAttempts) {
                throw new Error(`Data generation failed. Error during final attempt: ${errorMessage}`);
            }
            errorHistory.push({ status: 0, body: `Client-side error during validation: ${errorMessage}` });
        }
    }

    throw new Error('Data generation failed to produce a valid payload.');
}