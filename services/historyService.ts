import { supabase } from './supabaseClient';
import type { TestRun, TestRunSummary, UnsavedTestRun } from '../types';

/**
 * Saves a completed test run to the database.
 * @param payload The complete data for the test run.
 * @returns The newly created TestRun record from the database.
 */
export const saveTestRun = async (payload: UnsavedTestRun): Promise<TestRun> => {
    const { data, error } = await (supabase
        .from('test_runs') as any)
        .insert([payload])
        .select()
        .single();

    if (error) {
        console.error('Error saving test run:', error.message);
        throw error;
    }
    return data;
};

/**
 * Fetches summary data for all test runs for the currently authenticated user.
 * This function intentionally excludes the large 'results' field to ensure fast load times.
 * @returns A promise that resolves to an array of TestRunSummary objects, sorted by most recent first.
 */
export const getTestHistory = async (): Promise<TestRunSummary[]> => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
        console.error('Error fetching session for history:', sessionError.message);
        throw sessionError;
    }

    if (!session?.user) {
        console.warn('No active user session. Cannot fetch test history.');
        return [];
    }

    // Attempt to select all columns, including new ones.
    const columnsToSelect = 'id, created_at, user_id, title, status, config, stats, report, api_spec_id, resource_samples';

    let { data, error } = await (supabase
        .from('test_runs') as any)
        .select(columnsToSelect)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

    // Handle missing columns for backward compatibility.
    if (error) {
        let retryColumns = columnsToSelect;
        if (error.message.includes('resource_samples')) {
            console.warn("Warning: 'resource_samples' column not found. Rerun with resource monitoring is disabled. Please run the latest database scripts.");
            retryColumns = retryColumns.replace(', resource_samples', '');
        }
        if (error.message.includes('api_spec_id')) {
            console.warn("Warning: 'api_spec_id' column not found. Rerun with spec context is disabled. Please run the latest database scripts.");
            retryColumns = retryColumns.replace(', api_spec_id', '');
        }

        if (retryColumns !== columnsToSelect) {
            const retryResult = await (supabase
                .from('test_runs') as any)
                .select(retryColumns)
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });
            
            data = retryResult.data;
            error = retryResult.error;
        }
    }

    if (error) {
        console.error('Error fetching test history:', error.message);
        throw error;
    }
    return data;
};

/**
 * Fetches the complete details for a single test run, including the full results log.
 * @param id The UUID of the test run to fetch.
 * @returns A promise that resolves to a full TestRun object.
 */
export const getTestRunDetails = async (id: string): Promise<TestRun> => {
    // Attempt to select all columns for full details.
    let { data, error } = await (supabase
        .from('test_runs') as any)
        .select('*')
        .eq('id', id)
        .single();

    // Handle missing columns for backward compatibility.
    if (error) {
        let retry = false;
        // Start with all known columns, and remove ones that cause errors.
        let selectString = 'id, created_at, user_id, title, status, config, stats, results, report, api_spec_id, resource_samples';
        
        if (error.message.includes('resource_samples')) {
            console.warn(`Warning: 'resource_samples' column not found for run ${id}. Retrying query.`);
            selectString = selectString.replace(', resource_samples', '');
            retry = true;
        }
        if (error.message.includes('api_spec_id')) {
            console.warn(`Warning: 'api_spec_id' column not found for run ${id}. Retrying query.`);
            selectString = selectString.replace(', api_spec_id', '');
            retry = true;
        }

        if (retry) {
            const retryResult = await (supabase.from('test_runs') as any).select(selectString).eq('id', id).single();
            data = retryResult.data;
            error = retryResult.error;
        }
        
        // Manually add null properties to satisfy the TestRun type if they were excluded.
        if (data) {
            if (!('api_spec_id' in data)) data.api_spec_id = null;
            if (!('resource_samples' in data)) data.resource_samples = undefined;
        }
    }

    if (error) {
        console.error('Error fetching test run details:', error.message);
        throw error;
    }
    return data;
};


/**
 * Deletes a specific test run by its ID.
 * @param id The UUID of the test run to delete.
 */
export const deleteTestRun = async (id: string): Promise<void> => {
    const { error } = await (supabase
        .from('test_runs') as any)
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting test run:', error.message);
        throw error;
    }
};

/**
 * Updates the title of a specific test run.
 * @param id The UUID of the test run to update.
 * @param newTitle The new title for the test run.
 */
export const updateTestRun = async (id: string, updates: { title?: string }): Promise<void> => {
    const { error } = await (supabase
        .from('test_runs') as any)
        .update(updates)
        .eq('id', id);

    if (error) {
        console.error('Error updating test run:', error.message);
        throw error;
    }
};


/**
 * Scans for and deletes duplicate test runs for the current user.
 * Duplicates are identified by having identical configurations and key stats.
 * The oldest run in a duplicate set is preserved.
 * @returns A promise that resolves to the number of deleted runs.
 */
export const cleanupDuplicateTestRuns = async (): Promise<number> => {
    // 1. Fetch all runs for the user. We need the full summary.
    const history = await getTestHistory();

    // 2. Group runs by a unique fingerprint.
    const groups = new Map<string, TestRunSummary[]>();

    for (const run of history) {
        // Fingerprint based on config and key stats. Should be identical for duplicates.
        // Rounding avgResponseTime to avoid floating point inconsistencies.
        const fingerprint = JSON.stringify({
            c: run.config,
            s: {
                tr: run.stats.totalRequests,
                sc: run.stats.successCount,
                ar: Math.round(run.stats.avgResponseTime),
            }
        });
        
        const group = groups.get(fingerprint);
        if (group) {
            group.push(run);
        } else {
            groups.set(fingerprint, [run]);
        }
    }

    // 3. Identify IDs to delete.
    const idsToDelete: string[] = [];
    for (const group of groups.values()) {
        if (group.length > 1) {
            // This is a group of duplicates. Sort by creation date (oldest first).
            group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            
            // Keep the first one (the original), mark the rest for deletion.
            const runsToDelete = group.slice(1);
            idsToDelete.push(...runsToDelete.map(r => r.id));
        }
    }

    // 4. Delete the identified duplicates from the database.
    if (idsToDelete.length > 0) {
        const { error } = await (supabase
            .from('test_runs') as any)
            .delete()
            .in('id', idsToDelete);

        if (error) {
            console.error('Error deleting duplicate test runs:', error.message);
            throw error;
        }
    }

    return idsToDelete.length;
};