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
 * Helper to strip HTML tags from a string.
 * Used to clean up HTML error responses so the AI focuses on the text content.
 */
function stripHtml(html: string): string {
    if (!html) return '';
    // Basic regex strip to avoid DOM overhead/security issues in non-browser envs (though this is client-side).
    // It replaces tags with a space to prevent words merging.
    let text = html.replace(/<[^>]*>?/gm, ' ');
    // Decode common entities
    text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    // Collapse whitespace
    return text.replace(/\s+/g, ' ').trim();
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
  requestIndex?: number,
  virtualUserId?: number
) {
  if (signal.aborted) return; // Prevent starting new requests if the test is already stopped.

  // Generate IDs early for tracing
  const requestId = crypto.randomUUID();
  const vuId = virtualUserId !== undefined ? `vu-${virtualUserId}` : 'vu-unknown';

  // --- PERFORMANCE FIX: Removed artificial jitter ---
  // Previously used to prevent thundering herd, but caused throughput slowdown.
  // Removing to maximize request rate.

  // --- CACHE BUSTING LOGIC ---
  // We intentionally append a unique nonce AND a timestamp to the URL. 
  // This forces every single request to be treated as unique by browsers, proxies, load balancers, and CDNs.
  // We also handle relative URLs gracefully by using window.location.origin as a base if needed.
  let targetUrl = config.url;
  try {
      const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
      const urlObj = new URL(targetUrl, base);
      urlObj.searchParams.set('_nonce', requestId);
      urlObj.searchParams.set('_ts', Date.now().toString()); // Add timestamp for absolute ordering/uniqueness
      targetUrl = urlObj.href;
  } catch (e) {
      console.warn("Failed to append cache-buster nonce to URL:", targetUrl);
  }

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

  // Handle dynamic ID injection and Body Tracing
  if (targetBody) {
    try {
      const bodyJson = JSON.parse(targetBody);
      let modified = false;

      // --- ROBUSTNESS FIX: Body Trace Injection ---
      // Inject hidden metadata fields to ensure the request body bytes are strictly unique.
      // This prevents aggressive WAFs or proxies from deduplicating requests based on identical body hashes.
      // Most APIs simply ignore unknown fields.
      if (typeof bodyJson === 'object' && bodyJson !== null && !Array.isArray(bodyJson)) {
          bodyJson._trace_id = requestId;
          bodyJson._trace_ts = Date.now();
          modified = true;
      }

      // Priority 1: ID Pooling from file
      if (config.idPool && config.idPool.length > 0) {
          const pool = config.idPool;
          let idFromPool: string;

          if (config.idPoolingMode === 'random') {
              idFromPool = pool[Math.floor(Math.random() * pool.length)];
          } else { // 'sequential' is the default
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
      // Priority 2: Auto-Incrementing (if enabled)
      } else if (config.isIdAutoIncrementEnabled !== false) {
            bodyJson.id = crypto.randomUUID();
            modified = true;
      }
      
      if (modified) {
        targetBody = JSON.stringify(bodyJson);
      }
    } catch (e) {
      // If body is not JSON, we simply skip injection.
    }
  }

  // --- DISCREPANCY FIX: Strict Abort Check ---
  // Check if the signal has aborted *after* preparation but *before* the network call.
  // If we abort here, we return silently. This prevents "phantom" requests that the frontend
  // counts (as failed/aborted) but the backend never received because they never left the browser.
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
      cache: 'no-store', // CRITICAL: Disable browser caching
      priority: 'high',  // Hint to browser to prioritize these requests (fixes background tab throttling)
      headers: {
          // Inject tracing headers to correlate frontend requests with backend logs
          'X-Request-ID': requestId,
          'X-Virtual-User-ID': vuId,
          // Explicitly tell intermediate proxies not to cache
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
      },
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
                url: targetUrl, // Proxy handles the cache busting URL
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
    id: requestId, // Correlate this ID with X-Request-ID in backend logs
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
            }, 2000); // Poll every 2 seconds

            softStopSignal.addEventListener('abort', () => {
                clearInterval(intervalId);
                resourcePollController.abort();
            });
        }
        
        // --- ITERATION MODE (Worker Pool) ---
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
        // --- DURATION MODE (Continuous Runners) ---
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
            } else { // stair-step
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
        // FIX: Defensively access properties on the stats object, coercing them to numbers.
        // This prevents crashes from .toFixed() if a property is missing, null, or a non-numeric string.
        const stats: Partial<TestStats> = run.stats || {};
        const totalRequests = Number(stats.totalRequests) || 0;
        const errorCount = Number(stats.errorCount) || 0;
        const avgResponseTime = Number(stats.avgResponseTime) || 0;
        const maxResponseTime = Number(stats.maxResponseTime) || 0;
        const throughput = Number(stats.throughput) || 0;

        if (totalRequests === 0 && avgResponseTime === 0) {
            return `- Test [${run.title || 'Untitled'}]: Data is corrupted or missing stats.`;
        }

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
              description: "A list of simple text strings, each describing a specific observation from the data.",
              items: { type: Type.STRING }
            },
            rootCauseSuggestion: { type: Type.STRING, description: "A technical hypothesis for the performance degradation." },
            recommendations: {
              type: Type.ARRAY,
              description: "A list of actionable recommendations.",
              items: { type: Type.STRING }
            },
            conclusiveSummary: { type: Type.STRING, description: "A detailed, concluding paragraph summarizing the overall health and scalability of the system based on these tests." }
          }
        }
      }
    });
    
    jsonText = response.text.trim();
    return JSON.parse(jsonText) as TrendAnalysisReport;

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

// --- NEW: Comparison Analysis ---

export async function getComparisonAnalysis(runA: TestRun, runB: TestRun): Promise<ComparisonAnalysisReport> {
    let jsonText = '';
    try {
        const client = getAiClient();

        const systemInstruction = `You are a senior performance engineer. Your task is to compare two specific load test runs (a Baseline and a Comparison) and generate a detailed comparison report in JSON format. Focus on the *differences* and their implications.`;

        const prompt = `
            Compare the following two load test runs.

            **Baseline Run:**
            - Title: ${runA.title}
            - Config: ${runA.config.users} Users, ${runA.config.duration}s Duration
            - Metrics: Avg Latency=${runA.stats.avgResponseTime.toFixed(0)}ms, Throughput=${runA.stats.throughput.toFixed(2)}/s, Error Rate=${((runA.stats.errorCount / runA.stats.totalRequests) * 100).toFixed(2)}%, Apdex=${runA.stats.apdexScore.toFixed(2)}

            **Comparison Run:**
            - Title: ${runB.title}
            - Config: ${runB.config.users} Users, ${runB.config.duration}s Duration
            - Metrics: Avg Latency=${runB.stats.avgResponseTime.toFixed(0)}ms, Throughput=${runB.stats.throughput.toFixed(2)}/s, Error Rate=${((runB.stats.errorCount / runB.stats.totalRequests) * 100).toFixed(2)}%, Apdex=${runB.stats.apdexScore.toFixed(2)}

            **Required JSON Output:**
            Generate a JSON object with:
            - "comparisonSummary": A high-level summary of how the performance changed.
            - "keyMetricChanges": An array of objects, each describing a specific metric change (e.g., Latency, Throughput).
              - "metric": Name of the metric.
              - "baselineValue": Value from run A.
              - "comparisonValue": Value from run B.
              - "delta": The change (e.g., "+15%", "-200ms").
              - "analysis": A brief sentence explaining if this is good or bad.
              - "impact": "Positive", "Negative", or "Neutral".
            - "rootCauseAnalysis": A suggestion for why the changes occurred (e.g., "Increased user load caused database contention").
            - "recommendations": A list of actionable steps.
        `;

        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        comparisonSummary: { type: Type.STRING, description: "High-level summary of the comparison." },
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
                                    impact: { type: Type.STRING, enum: ["Positive", "Negative", "Neutral"] }
                                }
                            }
                        },
                        rootCauseAnalysis: { type: Type.STRING, description: "Hypothesis for performance changes." },
                        recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        });

        jsonText = response.text.trim();
        return JSON.parse(jsonText) as ComparisonAnalysisReport;

    } catch (e: any) {
        console.error("Error during getComparisonAnalysis:", e);
        throw new Error(`Failed to generate comparison analysis: ${e.message || e.toString()}`);
    }
}

// --- NEW: Config Generation & Payload Validation ---

export async function generateConfigFromPrompt(prompt: string, apiSpec: any): Promise<Partial<LoadTestConfig>> {
    let jsonText = '';
    try {
        const client = getAiClient();
        const systemInstruction = "You are a QA automation expert. Your task is to generate a valid load test configuration JSON based on a user's natural language request and a provided OpenAPI specification.";
        
        const userPrompt = `
            User Request: "${prompt}"
            
            OpenAPI Spec Summary (Focus on paths and methods):
            ${JSON.stringify(apiSpec.paths).substring(0, 15000)}... (truncated)

            Based on the user request and the available API paths, generate a JSON configuration object with:
            - url: The full target URL (using a placeholder host like 'https://api.example.com' if not specified, appended with the correct path).
            - method: The HTTP method.
            - body: A valid JSON request body sample if needed (e.g. for POST/PUT).
            - users: Recommended number of users (default 10).
            - duration: Recommended duration in seconds (default 30).
            - loadProfile: 'ramp-up' or 'stair-step'.
            - rampUp: Seconds to ramp up (if applicable).
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
                        url: { type: Type.STRING },
                        method: { type: Type.STRING },
                        body: { type: Type.STRING },
                        users: { type: Type.INTEGER },
                        duration: { type: Type.INTEGER },
                        loadProfile: { type: Type.STRING },
                        rampUp: { type: Type.INTEGER }
                    }
                }
            }
        });

        jsonText = response.text.trim();
        return JSON.parse(jsonText) as Partial<LoadTestConfig>;
    } catch (e: any) {
        console.error("Error generating config:", e);
        throw new Error(`Failed to generate config: ${e.message}`);
    }
}

export async function generateAndValidateBody(
    apiSpec: any, 
    path: string, 
    method: string, 
    baseUrl: string,
    focus: string,
    customInstructions: string,
    onLog: (msg: string) => void,
    signal: AbortSignal,
    maxAttempts: number = 7,
    authToken: string = '',
    useCorsProxy: boolean = false,
    headers: Header[] = []
): Promise<string> {
    const client = getAiClient();
    const specSnippet = JSON.stringify(apiSpec.paths[path]?.[method.toLowerCase()] || {});
    
    let currentBody = '';
    let attempts = 0;
    let errorHistory: string[] = [];

    onLog(`Starting AI payload generation for ${method} ${path}...`);

    while (attempts < maxAttempts) {
        if (signal.aborted) {
             throw new Error("Process aborted by user.");
        }
        attempts++;
        onLog(`\n[Attempt ${attempts}/${maxAttempts}] Generating payload...`);

        try {
            // 1. Generate Payload
            const prompt = `
                Generate a valid JSON request body for ${method.toUpperCase()} ${path}.
                
                OpenAPI Definition for this endpoint:
                ${specSnippet}

                Focus: ${focus === 'minimal' ? 'Minimal valid payload (required fields only)' : 'Full payload (all fields)'}
                ${customInstructions ? `Custom Instructions: ${customInstructions}` : ''}
                
                ${errorHistory.length > 0 ? `Previous Attempts Failed. Fix these errors:\n${errorHistory.join('\n')}` : ''}

                Return ONLY the JSON string. No markdown formatting.
            `;

            const response = await client.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { 
                    responseMimeType: "application/json" 
                }
            });
            
            currentBody = response.text.trim();
            onLog(`Generated Body:\n${currentBody.substring(0, 150)}...`);

            // 2. Validate (Dry Run)
            onLog(`Validating against live endpoint...`);
            
            const fetchOptions: RequestInit = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken ? { 'Authorization': authToken.startsWith('Bearer') ? authToken : `Bearer ${authToken}` } : {}),
                    // Inject user defined headers for validation request
                    ...headers.reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {})
                },
                body: currentBody,
                signal
            };

            let res;
            let targetUrl = `${baseUrl.replace(/\/$/, '')}${path}`;

            if (useCorsProxy) {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error("Not logged in (CORS Proxy required).");
                
                const functionsUrl = `${supabaseUrl}/functions/v1/cors-proxy`;
                res = await fetch(functionsUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                        'apikey': supabaseAnonKey,
                    },
                    body: JSON.stringify({
                        url: targetUrl,
                        options: fetchOptions
                    }),
                    signal
                });
            } else {
                res = await fetch(targetUrl, fetchOptions);
            }

            const resText = await res.text();

            if (res.ok) {
                onLog(`✅ Validation Successful! (Status: ${res.status})`);
                
                // Save successful payload for future learning
                saveSuccessfulPayload(path, method, currentBody).catch(e => console.error("Failed to learn payload:", e));
                
                return currentBody;
            } else {
                onLog(`❌ Validation Failed (Status: ${res.status}). Server Response: ${resText.substring(0, 200)}`);
                errorHistory.push(`Attempt ${attempts}: Status ${res.status} - ${stripHtml(resText).substring(0, 300)}`);
            }

        } catch (e: any) {
            if (e.name === 'AbortError') throw new Error("Process stopped by user.");
            onLog(`❌ Error: ${e.message}`);
            errorHistory.push(`Attempt ${attempts} Exception: ${e.message}`);
        }
    }

    throw new AutoFixStoppedError(`Failed to generate a valid payload after ${maxAttempts} attempts.`, currentBody);
}

// --- NEW: Synthetic Data Generation ---

export async function generateAndValidatePersonalizedData(
    basePayloadTemplate: string,
    requests: DataGenerationRequest[],
    apiSpec: any,
    baseUrl: string,
    path: string,
    customInstructions: string,
    onLog: (msg: string) => void,
    signal: AbortSignal,
    maxAttempts: number = 5,
    authToken: string = '',
    networkDiagnostics: boolean = false,
    useCorsProxy: boolean = false,
    headers: Header[] = []
): Promise<string> {
    const client = getAiClient();
    onLog(`Starting batch data generation for ${requests.reduce((sum, r) => sum + r.count, 0)} total records...`);

    const method = 'POST'; // Assuming POST for data generation
    const specSnippet = JSON.stringify(apiSpec.paths[path]?.[method.toLowerCase()] || {});

    let fullPayloadResult: any[] = []; // To store the final array of all generated payloads

    // Process each variation request
    for (const req of requests) {
        onLog(`\nGenerating ${req.count} records for form type: '${req.formType}'...`);
        
        let generatedBatch: any[] = [];
        let attempts = 0;

        // Retry loop for the *generation* phase of this batch
        while (attempts < maxAttempts && generatedBatch.length === 0) {
            if (signal.aborted) throw new Error("Process aborted.");
            attempts++;
            
            try {
                const prompt = `
                    You are a test data generator.
                    
                    **Task:**
                    Generate ${req.count} UNIQUE JSON objects.
                    Each object must follow the structure of the 'Base Template' below, but with specific fields modified according to the 'Variation Requirement'.
                    
                    **Base Template:**
                    ${basePayloadTemplate}
                    
                    **Variation Requirement:**
                    - Form Type: ${req.formType}
                    - Context: The user needs data suitable for a "${req.formType}" submission.
                    - Ensure fields relevant to "${req.formType}" (e.g. email addresses for 'emails', passport numbers for 'passports') are UNIQUE and realistic for each record.
                    - ${customInstructions}
                    
                    **Output Format:**
                    Return ONLY a JSON Array containing exactly ${req.count} objects.
                `;

                const response = await client.models.generateContent({
                    model: 'gemini-2.5-flash', // Using pro for better data diversity
                    contents: prompt,
                    config: { responseMimeType: "application/json" }
                });

                const json = JSON.parse(response.text.trim());
                if (Array.isArray(json)) {
                    generatedBatch = json;
                    onLog(`  - Successfully generated ${json.length} unique records.`);
                } else {
                    throw new Error("AI returned valid JSON but not an array.");
                }

            } catch (e: any) {
                onLog(`  - Generation attempt ${attempts} failed: ${e.message}`);
            }
        }

        if (generatedBatch.length === 0) {
            throw new Error(`Failed to generate data for ${req.formType} after multiple attempts.`);
        }

        // Validate a sample from the batch
        onLog(`  - Validating a sample record against ${baseUrl}${path}...`);
        const sample = generatedBatch[0];
        
        const fetchOptions: RequestInit = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { 'Authorization': authToken.startsWith('Bearer') ? authToken : `Bearer ${authToken}` } : {}),
                ...headers.reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {})
            },
            body: JSON.stringify(sample),
            signal
        };

        let res;
        let targetUrl = `${baseUrl.replace(/\/$/, '')}${path}`;

        try {
             if (useCorsProxy) {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error("Not logged in (CORS Proxy required).");
                
                const functionsUrl = `${supabaseUrl}/functions/v1/cors-proxy`;
                res = await fetch(functionsUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                        'apikey': supabaseAnonKey,
                    },
                    body: JSON.stringify({
                        url: targetUrl,
                        options: fetchOptions
                    }),
                    signal
                });
            } else {
                res = await fetch(targetUrl, fetchOptions);
            }

            if (res.ok) {
                onLog(`  - ✅ Sample validation passed.`);
                fullPayloadResult = [...fullPayloadResult, ...generatedBatch];
            } else {
                const errorText = await res.text();
                onLog(`  - ❌ Sample validation failed (Status ${res.status}): ${stripHtml(errorText).substring(0, 100)}`);
                onLog(`  - ⚠️ Skipping this batch due to validation failure.`);
                // We continue to the next request type instead of aborting everything
            }
        } catch (e: any) {
             onLog(`  - ❌ Validation network error: ${e.message}`);
        }
    }

    onLog(`\nGeneration complete. ${fullPayloadResult.length} total valid records compiled.`);
    return JSON.stringify(fullPayloadResult, null, 2);
}