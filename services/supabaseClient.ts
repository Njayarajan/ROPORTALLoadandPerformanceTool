import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Replace these values with your own Supabase project details.
// You can find these in your Supabase project dashboard under Settings > API.

// 1. Go to your Supabase project dashboard.
// 2. Navigate to the "Settings" page (the gear icon).
// 3. Click on "API" in the sidebar.
// 4. Under "Project URL", copy the URL and paste it into `supabaseUrl` below.
// 5. Under "Project API Keys", copy the `anon` `public` key and paste it into `supabaseAnonKey` below.

export const supabaseUrl = 'https://dteyjpergivuutnkvhmp.supabase.co'; // e.g., 'https://xyz.supabase.co'
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZXlqcGVyZ2l2dXV0bmt2aG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0ODg3ODEsImV4cCI6MjA3MTA2NDc4MX0.KnGghHEwqQGFjCkSsfx7sQW1yraL29Jrmo-NOdEvOC8'; // e.g., 'ey...'

if (!supabaseUrl) {
    console.error("Supabase URL is not set. Please update services/supabaseClient.ts");
}
if (!supabaseAnonKey) {
    console.error("Supabase Anon Key is not set. Please update services/supabaseClient.ts");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);