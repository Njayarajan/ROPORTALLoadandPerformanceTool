import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

console.info('CORS Proxy server starting...');

// SECURITY: A strict allowlist of hostnames the proxy is allowed to connect to.
const ALLOWED_HOSTS = [
  'www2.communityprotection.wa.gov.au',
  // Add other known, trusted API domains here.
  'roportal-api-sys.npr-03-ase.appserviceenvironment.net',
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-proxy-target-url',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // The original logic for JSON-based proxy requests (used by main test runner)
    if (req.headers.get('content-type')?.includes('application/json')) {
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

    // New pass-through logic for FormData (file uploads) and other content types
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

    // Reconstruct headers for the target request, removing proxy-specific ones.
    const targetHeaders = new Headers(req.headers);
    targetHeaders.delete('x-proxy-target-url');
    targetHeaders.delete('host'); // Let Deno's fetch set the correct host

    const response = await fetch(targetUrl.toString(), {
        method: req.method,
        headers: targetHeaders,
        body: req.body,
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
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
