import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

console.info('CORS Proxy server starting...');

// SECURITY: A strict allowlist of hostnames the proxy is allowed to connect to.
// This prevents the proxy from being abused to attack internal networks or other sites.
const ALLOWED_HOSTS = [
  'www2.communityprotection.wa.gov.au',
  // Add other known, trusted API domains here.
  // Example: 'api.production.example.com',
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // This is needed for CORS preflight requests.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Extract the target URL and fetch options from the request body.
    const { url, options } = await req.json();

    if (!url) {
      throw new Error('URL is required in the request body.');
    }
    
    const targetUrl = new URL(url);
    const targetHostname = targetUrl.hostname;

    // Security check: only allow requests to whitelisted hosts or localhost for development.
    const isAllowed = ALLOWED_HOSTS.some(host => targetHostname === host) || 
                      targetHostname === 'localhost' ||
                      targetHostname === '127.0.0.1';

    if (!isAllowed) {
      return new Response(JSON.stringify({ error: `Proxy requests to '${targetHostname}' are not permitted.` }), {
        status: 403, // Forbidden
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Make the actual request to the target URL from the server.
    const response = await fetch(url, options);

    // Create a new response. We forward the original status, statusText, and body.
    // Crucially, we add our own CORS headers to this new response so the browser
    // will allow our app to read it.
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
    // If anything goes wrong, return a 500 error with a message.
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});