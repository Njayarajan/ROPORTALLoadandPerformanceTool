
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

console.info('[PROXY] Service starting...');

// SECURITY: A strict allowlist of hostnames the proxy is allowed to connect to.
const ALLOWED_HOSTS = [
  'www2.communityprotection.wa.gov.au',
  'roportal-api-sys.npr-03-ase.appserviceenvironment.net',
];


serve(async (req) => {
  // Generate a unique ID for this request to make logs easier to trace.
  const reqId = crypto.randomUUID().slice(0, 8);
  console.log(`\n[PROXY][${reqId}] Received request: ${req.method} ${req.url}`);
  
  // --- DYNAMIC CORS HEADER GENERATION ---
  const requestedHeaders = req.headers.get('Access-Control-Request-Headers');
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': requestedHeaders || 'authorization, x-client-info, apikey, content-type, x-proxy-target-url, x-proxy-target-authorization',
  };

  // Handle CORS preflight requests immediately.
  if (req.method === 'OPTIONS') {
    console.log(`[PROXY][${reqId}] Responding to OPTIONS preflight.`);
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get('content-type');
    console.log(`[PROXY][${reqId}] Content-Type: ${contentType || 'Not specified'}`);

    // --- Mode 1: JSON-wrapped requests ---
    if (contentType?.includes('application/json')) {
        console.log(`[PROXY][${reqId}] Mode: JSON-wrapped.`);
        const { url, options } = await req.json();

        if (!url) throw new Error('URL is required in the request body for JSON proxy requests.');

        const targetUrl = new URL(url);
        console.log(`[PROXY][${reqId}] Target URL: ${targetUrl.toString()}`);

        const isAllowed = ALLOWED_HOSTS.some(host => targetUrl.hostname === host) || targetUrl.hostname === 'localhost' || targetUrl.hostname === '127.0.0.1';

        if (!isAllowed) {
            console.error(`[PROXY][${reqId}] FORBIDDEN request to host: ${targetUrl.hostname}`);
            return new Response(JSON.stringify({ error: `Proxy requests to '${targetUrl.hostname}' are not permitted.` }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        
        console.log(`[PROXY][${reqId}] Forwarding JSON request to target...`);
        const response = await fetch(url, options);
        console.log(`[PROXY][${reqId}] Received response from target: ${response.status} ${response.statusText}`);
        
        const newHeaders = new Headers(response.headers);
        for (const [key, value] of Object.entries(corsHeaders)) { newHeaders.set(key, value); }

        console.log(`[PROXY][${reqId}] Sending final response to client.`);
        return new Response(response.body, {
            status: response.status, statusText: response.statusText, headers: newHeaders,
        });
    }

    // --- Mode 2: Pass-through requests (for FormData/file uploads) ---
    console.log(`[PROXY][${reqId}] Mode: Pass-through (FormData).`);
    const targetUrlString = req.headers.get('x-proxy-target-url');
    if (!targetUrlString) throw new Error('x-proxy-target-url header is required for non-JSON proxy requests.');

    const targetUrl = new URL(targetUrlString);
    console.log(`[PROXY][${reqId}] Target URL: ${targetUrl.toString()}`);

    const isAllowed = ALLOWED_HOSTS.some(host => targetUrl.hostname === host) || targetUrl.hostname === 'localhost' || targetUrl.hostname === '127.0.0.1';
    if (!isAllowed) {
        console.error(`[PROXY][${reqId}] FORBIDDEN request to host: ${targetUrl.hostname}`);
        return new Response(JSON.stringify({ error: `Proxy requests to '${targetUrl.hostname}' are not permitted.` }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    console.log(`[PROXY][${reqId}] Parsing incoming request body as FormData...`);
    const body = await req.formData();
    console.log(`[PROXY][${reqId}] FormData parsed successfully.`);

    const targetHeaders = new Headers(req.headers);
    
    const targetAuth = targetHeaders.get('x-proxy-target-authorization');
    targetHeaders.delete('x-proxy-target-authorization');
    targetHeaders.delete('x-proxy-target-url');
    targetHeaders.delete('host');
    targetHeaders.delete('authorization');
    targetHeaders.delete('apikey');
    
    if (targetAuth) {
        targetHeaders.set('Authorization', targetAuth);
    }

    console.log(`[PROXY][${reqId}] Constructed target headers:`, Object.fromEntries(targetHeaders.entries()));

    let response;
    try {
        console.log(`[PROXY][${reqId}] Forwarding FormData request to target...`);
        response = await fetch(targetUrl.toString(), {
            method: req.method,
            headers: targetHeaders,
            body: body,
        });
        console.log(`[PROXY][${reqId}] Received response from target: ${response.status} ${response.statusText}`);
        // console.log(`[PROXY][${reqId}] Target response headers:`, Object.fromEntries(response.headers.entries()));

    } catch (fetchError) {
        console.error(`[PROXY][${reqId}] CRITICAL: The fetch from the proxy to the target API failed! This is the likely source of the client's 'Failed to fetch' error.`, fetchError);
        throw new Error(`Proxy failed to connect to target server '${targetUrl.hostname}': ${fetchError.message}. Check for firewall issues or if the target server is down.`);
    }

    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) { newHeaders.set(key, value); }
    
    console.log(`[PROXY][${reqId}] Sending final response to client with status ${response.status}`);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });

  } catch (err) {
    console.error(`[PROXY][${reqId}] Error in main proxy handler:`, err);
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});