import { useState, useEffect, useCallback } from 'react';
import type { SystemStatusState, ApiSpecMetadata, SystemCheck } from '../types';
import { checkSupabaseConnection } from '../services/configService';

const useSystemStatus = (currentlyLoadedSpec: ApiSpecMetadata | null) => {
    const [systemStatus, setSystemStatus] = useState<SystemStatusState>([
        { name: 'Supabase DB', status: 'PENDING', message: 'Checking connection...' },
        { name: 'Gemini API', status: 'PENDING', message: 'Checking API key...' },
        { name: 'API Spec', status: 'PENDING', message: 'Checking for loaded spec...' },
    ]);

    const updateCheckStatus = (name: SystemCheck['name'], status: Partial<SystemCheck>) => {
        setSystemStatus(prev => prev.map(check => check.name === name ? { ...check, ...status } : check));
    };

    const runChecks = useCallback(async () => {
        // Reset all to pending
        setSystemStatus([
            { name: 'Supabase DB', status: 'PENDING', message: 'Checking connection...' },
            { name: 'Gemini API', status: 'PENDING', message: 'Checking API key...' },
            { name: 'API Spec', status: 'PENDING', message: 'Checking for loaded spec...' },
        ]);

        // 1. Check Supabase
        const dbResult = await checkSupabaseConnection();
        updateCheckStatus('Supabase DB', {
            status: dbResult.success ? 'OK' : 'ERROR',
            message: dbResult.success ? 'Connection successful.' : dbResult.error || 'Connection failed.',
            solution: dbResult.success ? undefined : 'Verify Supabase URL, Anon Key in `supabaseClient.ts`, and check network/RLS policies.',
        });

        // 2. Check Gemini API Key
        const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : null;
        updateCheckStatus('Gemini API', {
            status: apiKey ? 'OK' : 'ERROR',
            message: apiKey ? 'API key is configured.' : 'API_KEY is not set.',
            solution: apiKey ? undefined : 'Ensure the API_KEY environment variable is configured in your hosting environment.',
        });

        // 3. Check API Spec (this is also handled by the useEffect below)
        updateCheckStatus('API Spec', {
            status: currentlyLoadedSpec ? 'OK' : 'WARN',
            message: currentlyLoadedSpec ? `Using: ${currentlyLoadedSpec.description}` : 'No API spec is loaded.',
            solution: currentlyLoadedSpec ? undefined : 'Load a spec from the Configuration panel to enable API-aware features.',
        });

    }, [currentlyLoadedSpec]); // Re-run all checks if spec changes

    // Run all checks on initial mount
    useEffect(() => {
        runChecks();
    }, [runChecks]);

    return { systemStatus, runChecks };
};



export default useSystemStatus;
