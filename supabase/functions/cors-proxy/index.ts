
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

console.info('CORS Proxy server starting...');

// SECURITY: A strict allowlist of hostnames the proxy is allowed to connect to.
const ALLOWED_HOSTS = [
  'www2.communityprotection.wa.gov.au',
  'roportal-api-sys.npr-03-ase.appserviceenvironment.net',
];


serve(async (req) => {
  // --- DYNAMIC CORS HEADER GENERATION ---
  // This is the most robust way to handle CORS preflight requests.
  // It dynamically allows whatever headers the browser is requesting.
  const requestedHeaders = req.headers.get('Access-Control-Request-Headers');
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': requestedHeaders || 'authorization, x-client-info, apikey, content-type, x-proxy-target-url, x-proxy-target-authorization',
  };

  // Handle CORS preflight requests immediately.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get('content-type');

    // --- Mode 1: JSON-wrapped requests ---
    // This is for standard API tests from the performance runner.
    if (contentType?.includes('application/json')) {
        console.log('Proxying JSON-wrapped request...');
        const { url, options } = await req.json();

        if (!url) {
            throw new Error('URL is required in the request body for JSON proxy requests.');
        }

        const targetUrl = new URL(url);
        const isAllowed = ALLOWED_HOSTS.some(host => targetUrl.hostname === host) || targetUrl.hostname === 'localhost' || targetUrl.hostname === '127.0.0.1';

        if (!isAllowed) {
            return new Response(JSON.stringify({ error: `Proxy requests to '${targetUrl.hostname}' are not permitted.` }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        
        const response = await fetch(url, options);
        
        const newHeaders = new Headers(response.headers);
        for (const [key, value] of Object.entries(corsHeaders)) {
            newHeaders.set(key, value);
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
        });
    }

    // --- Mode 2: Pass-through requests (for FormData/file uploads) ---
    console.log('Proxying pass-through request (e.g., file upload)...');
    const targetUrlString = req.headers.get('x-proxy-target-url');
    if (!targetUrlString) {
        throw new Error('x-proxy-target-url header is required for non-JSON proxy requests.');
    }

    const targetUrl = new URL(targetUrlString);
    const isAllowed = ALLOWED_HOSTS.some(host => targetUrl.hostname === host) || targetUrl.hostname === 'localhost' || targetUrl.hostname === '127.0.0.1';

    if (!isAllowed) {
        return new Response(JSON.stringify({ error: `Proxy requests to '${targetUrl.hostname}' are not permitted.` }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // --- CRITICAL FIX ---
    // Read the entire request body into an ArrayBuffer before forwarding.
    // Passing the raw `req.body` (a ReadableStream) can be unreliable in Deno Deploy
    // and cause the connection to drop, resulting in a "Failed to fetch" error on the client.
    // Buffering it first ensures the entire payload is received before the proxy sends its own request.
    const bodyBuffer = await req.arrayBuffer();

    const targetHeaders = new Headers(req.headers);

    // Swap the proxy's auth token for the target API's auth token.
    const targetAuth = targetHeaders.get('x-proxy-target-authorization');
    targetHeaders.delete('x-proxy-target-authorization');
    
    // Remove all headers specific to the proxy or Supabase infra.
    targetHeaders.delete('x-proxy-target-url');
    targetHeaders.delete('host');
    targetHeaders.delete('authorization'); // This is the Supabase token
    targetHeaders.delete('apikey');
    
    // Add back the target API's auth token with the standard 'Authorization' header name.
    if (targetAuth) {
        targetHeaders.set('Authorization', targetAuth);
    }

    const response = await fetch(targetUrl.toString(), {
        method: req.method,
        headers: targetHeaders,
        body: bodyBuffer,
    });

    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
        newHeaders.set(key, value);
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });

  } catch (err) {
    console.error('Error in CORS proxy:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
