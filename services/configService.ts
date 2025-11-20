
import { supabase } from './supabaseClient';
import type { UsageLimits } from '../types';

// Define a single source of truth for failsafe limits
const FAILSAFE_LIMITS: UsageLimits = { 
    role: 'default', 
    max_users: 100, 
    max_duration: 120, 
    max_ramp_up: 60, 
    min_pacing: 0 
};

/**
 * Fetches the usage limits for a specific user role.
 * This function is designed to be resilient. It attempts to fetch limits from the DB
 * for the specific role, falls back to a 'default' role, and if all else fails,
 * returns a hardcoded set of failsafe limits without crashing the app.
 *
 * @param role The role of the user ('admin' or 'user').
 * @returns A promise that resolves to the UsageLimits object.
 */
export const getUsageLimits = async (role: 'admin' | 'user'): Promise<UsageLimits> => {
    try {
        // 1. Try to get limits for the specific user role.
        const { data: roleData, error: roleError } = await (supabase
            .from('usage_limits') as any)
            .select()
            .eq('role', role)
            .single();

        // If we get data, we're done.
        if (roleData) {
            return roleData as UsageLimits;
        }

        // If there was an error BUT it wasn't the "no rows found" error, it's a real problem.
        if (roleError && roleError.code !== 'PGRST116') {
            throw roleError;
        }
        
        // 2. Fallback to getting 'default' limits.
        console.warn(`No specific limits found for role '${role}', falling back to default.`);
        const { data: defaultData, error: defaultError } = await (supabase
            .from('usage_limits') as any)
            .select()
            .eq('role', 'default')
            .single();

        // If we get default data, we're done.
        if (defaultData) {
            return defaultData as UsageLimits;
        }

        // If there was an error fetching default, and it wasn't "no rows", throw it.
        if (defaultError && defaultError.code !== 'PGRST116') {
            throw defaultError;
        }

        // 3. If we're here, neither role-specific nor default limits exist in the DB.
        // This is a recoverable situation. Log it and return the hardcoded failsafe.
        console.warn("CRITICAL: No default usage limits configured in the database. Falling back to in-app failsafe limits.");
        return FAILSAFE_LIMITS;

    } catch (error: any) {
        const errorMessage = error.message || 'An unknown database error occurred';
        // This catch block now handles more severe errors, like the table not existing at all.
        const isMissingTableError = errorMessage.includes('Could not find the table') || errorMessage.includes('relation "public.usage_limits" does not exist');
        
        if (isMissingTableError) {
            console.warn("Could not find 'usage_limits' table. Falling back to default in-app limits.");
            return FAILSAFE_LIMITS;
        }

        // For any other unexpected errors, re-throw them so they are visible.
        console.error(`Failed to fetch usage limits: ${errorMessage}`);
        throw new Error(`Failed to fetch usage limits: ${errorMessage}`);
    }
};

/**
 * Fetches the current test mode status from the database.
 * This was changed from an RPC call to a direct select to improve reliability
 * in environments where RPC calls might face network issues like 'Failed to fetch'.
 * @returns A promise that resolves to true if test mode is enabled, false otherwise.
 */
export const getTestModeStatus = async (): Promise<boolean> => {
    try {
        // Using a direct select. This might be subject to caching in some edge cases,
        // but is more reliable than RPC which can fail with network errors.
        const { data, error } = await (supabase as any)
            .from('app_config')
            .select('value')
            .eq('key', 'test_mode_enabled')
            .single();
        
        if (error) {
            // A 'PGRST116' error code means no row was found, which is not a critical failure.
            // We can safely assume test mode is disabled in this case.
            if (error.code !== 'PGRST116') {
                 console.error("Error fetching test mode status directly:", error.message);
            }
            return false;
        }
        
        return data?.value === true;
        
    } catch (err) {
        console.error("Unexpected error fetching test mode status:", err);
        return false;
    }
};

/**
 * Sets the test mode status in the database. Requires admin privileges.
 * @param enabled The new status for test mode.
 */
export const setTestModeStatus = async (enabled: boolean): Promise<void> => {
    // Reverted from a Supabase RPC call to a direct database update.
    // This fixes the "function not found" error.
    // We use `update` instead of `upsert` to avoid a "new row violates RLS policy" error,
    // assuming the configuration row already exists.
    const { error } = await (supabase
        .from('app_config') as any)
        .update({ value: enabled })
        .eq('key', 'test_mode_enabled');
    
    if (error) {
        console.error("Error setting test mode status:", error.message);
        if (error.message.includes('security policy')) {
             throw new Error("Permission denied. Your role may not have permission to change application settings.");
        }
        throw new Error(error.message);
    }
};

/**
 * Fetches all usage limits configurations from the database. Requires admin privileges.
 * @returns A promise that resolves to an array of UsageLimits objects.
 */
export const getAllUsageLimits = async (): Promise<UsageLimits[]> => {
    const { data, error } = await (supabase
        .from('usage_limits') as any)
        .select();
    
    if (error) {
        console.error("Error fetching all usage limits:", error.message);
        throw new Error(error.message);
    }

    return data as UsageLimits[];
};

/**
 * Updates a usage limits configuration in the database. Requires admin privileges.
 * @param limits The UsageLimits object to update.
 */
export const updateUsageLimits = async (limits: UsageLimits): Promise<void> => {
    // Reverted from a Supabase RPC call to a direct database update
    // to fix the "function not found" error.
    const { error } = await (supabase
        .from('usage_limits') as any)
        .update({
            max_users: limits.max_users,
            max_duration: limits.max_duration,
            max_ramp_up: limits.max_ramp_up,
            min_pacing: limits.min_pacing
        })
        .eq('role', limits.role);

    if (error) {
        console.error(`Error updating limits for role ${limits.role}:`, error.message);
        if (error.message.includes('security policy')) {
             throw new Error(`Permission denied. Your role may not have permission to change usage limits for '${limits.role}'.`);
        }
        throw new Error(error.message);
    }
};

/**
 * Performs a lightweight query to verify the Supabase connection and basic permissions.
 * @returns A promise that resolves to an object indicating success or failure.
 */
export const checkSupabaseConnection = async (): Promise<{ success: boolean; error?: string }> => {
    try {
        // This is a lightweight query to a small, expected table.
        // It checks connectivity, authentication, and RLS policies simultaneously.
        const { error } = await (supabase
            .from('app_config') as any)
            .select('key')
            .limit(1);
        
        if (error) {
             throw error;
        }
        return { success: true };
    } catch (error: any) {
        const errorMessage = error.message || 'An unknown error occurred';
        if (errorMessage.includes('fetch')) {
             return { success: false, error: 'Network error. Could not reach the Supabase server.' };
        }
         if (errorMessage.includes('relation "public.app_config" does not exist')) {
            return { success: false, error: 'DB is connected, but the required \'app_config\' table is missing.' };
        }
        if (errorMessage.includes('permission denied')) {
            return { success: false, error: 'Permission denied. Check Row Level Security (RLS) policies for the \'app_config\' table.' };
        }
        return { success: false, error: errorMessage };
    }
};


/**
 * Fetches real-time system statistics for the admin dashboard using a secure RPC function.
 * @returns A promise that resolves to an object with totals, or null if the function is missing.
 */
export const getAdminStats = async (): Promise<{ total_users: number; total_test_runs: number } | null> => {
    try {
        const { data, error } = await supabase.rpc('get_admin_stats');

        if (error) {
            console.warn("Could not fetch admin stats (function might be missing):", error.message);
            return null;
        }

        return data as { total_users: number; total_test_runs: number };
    } catch (e) {
        console.error("Error calling get_admin_stats:", e);
        return null;
    }
};
