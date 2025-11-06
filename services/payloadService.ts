
import { supabase } from './supabaseClient';
import type { SavedBasePayload, Header, SavedHeaderSet } from '../types';

/**
 * Fetches all saved base payloads for the currently authenticated user.
 * @returns A promise that resolves to an array of SavedBasePayload objects.
 */
export const getSavedPayloads = async (): Promise<SavedBasePayload[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        // Return empty array if not logged in, as this can be called on initial load.
        return [];
    }
    
    const { data, error } = await (supabase
        .from('base_payloads') as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        const isMissingTableError = error.message.includes('relation "public.base_payloads" does not exist') || error.message.includes("Could not find the table");
        
        if (isMissingTableError) {
            console.warn("Warning: 'base_payloads' table not found. Please run the v1.1.0 database script from the 'Setup Cache' modal to enable saving payloads.");
            return []; // Gracefully return an empty array if the table doesn't exist yet.
        }

        console.error('Error fetching saved payloads:', error.message);
        throw error;
    }
    return data;
};

/**
 * Saves a new base payload to the database.
 * @param description A user-provided description for the payload.
 * @param payload The JSON payload object to save.
 * @returns A promise that resolves to the newly created SavedBasePayload object.
 */
export const savePayload = async (description: string, payload: any): Promise<SavedBasePayload> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error("User must be logged in to save a payload.");
    }

    const { data, error } = await (supabase
        .from('base_payloads') as any)
        .insert([{
            user_id: user.id,
            description,
            payload,
        }])
        .select()
        .single();
    
    if (error) {
        console.error('Error saving payload:', error);

        const isSchemaCacheError = error.message.includes("schema cache") || error.message.includes("relation \"public.base_payloads\" does not exist");
        if (isSchemaCacheError) {
            throw new Error("Database schema error. Go to 'Setup Cache', ensure you have run the latest script (v1.1.0), and then click the 'Reload Application & Schema' button.");
        }
        
        throw new Error(error.message || 'An unknown database error occurred while saving the payload.');
    }
    return data;
};

/**
 * Updates an existing saved base payload.
 * @param id The UUID of the payload to update.
 * @param updates An object containing the fields to update (e.g., { description, payload }).
 * @returns A promise that resolves to the updated SavedBasePayload object.
 */
export const updatePayload = async (id: string, updates: { description?: string; payload?: any }): Promise<SavedBasePayload> => {
    const { data, error } = await (supabase
        .from('base_payloads') as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating payload:', error.message);
        const isSchemaCacheError = error.message.includes("schema cache") || error.message.includes("relation \"public.base_payloads\" does not exist");
        if (isSchemaCacheError) {
            throw new Error("Database schema error. Please run the latest database script and reload the application.");
        }
        throw new Error(error.message || 'An unknown database error occurred while updating the payload.');
    }
    return data;
};

/**
 * Deletes a saved base payload.
 * @param id The UUID of the payload to delete.
 */
export const deletePayload = async (id: string): Promise<void> => {
     const { error } = await (supabase
        .from('base_payloads') as any)
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting payload:', error.message);

        const isSchemaCacheError = error.message.includes("schema cache") || error.message.includes("relation \"public.base_payloads\" does not exist");
        if (isSchemaCacheError) {
            throw new Error("Database schema error. Go to 'Setup Cache', ensure you have run the latest script (v1.1.0), and then click the 'Reload Application & Schema' button.");
        }

        throw new Error(error.message || 'An unknown database error occurred while deleting the payload.');
    }
};


/**
 * Fetches all saved header sets for the currently authenticated user.
 */
export const getHeaderSets = async (): Promise<SavedHeaderSet[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    const { data, error } = await (supabase
        .from('header_sets') as any)
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

    if (error) {
        const isMissingTableError = error.message.includes('relation "public.header_sets" does not exist') || error.message.includes("Could not find the table");
        if (isMissingTableError) {
            console.warn("Warning: 'header_sets' table not found. Please run the v1.0.2 database script from the 'Setup Database & Cache' modal to enable saved header sets.");
            return []; // Gracefully return empty array
        }
        console.error('Error fetching header sets:', error.message);
        throw error;
    }
    return data;
};

/**
 * Saves a new header set to the database.
 */
export const saveHeaderSet = async (name: string, headers: Header[]): Promise<SavedHeaderSet> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User must be logged in to save a header set.");

    const { data, error } = await (supabase
        .from('header_sets') as any)
        .insert([{ user_id: user.id, name, headers }])
        .select()
        .single();
    
    if (error) {
        const isMissingTableError = error.message.includes('relation "public.header_sets" does not exist') || error.message.includes("Could not find the table");
        if (isMissingTableError) {
            throw new Error("Database feature not available: 'header_sets' table is missing. Please run the v1.0.2 database script.");
        }
        console.error('Error saving header set:', error);
        throw error;
    }
    return data;
};

/**
 * Updates an existing header set.
 */
export const updateHeaderSet = async (id: string, name: string, headers: Header[]): Promise<SavedHeaderSet> => {
    const { data, error } = await (supabase
        .from('header_sets') as any)
        .update({ name, headers })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        const isMissingTableError = error.message.includes('relation "public.header_sets" does not exist') || error.message.includes("Could not find the table");
        if (isMissingTableError) {
            throw new Error("Database feature not available: 'header_sets' table is missing. Please run the v1.0.2 database script.");
        }
        console.error('Error updating header set:', error);
        throw error;
    }
    return data;
};

/**
 * Deletes a saved header set.
 */
export const deleteHeaderSet = async (id: string): Promise<void> => {
     const { error } = await (supabase
        .from('header_sets') as any)
        .delete()
        .eq('id', id);

    if (error) {
        const isMissingTableError = error.message.includes('relation "public.header_sets" does not exist') || error.message.includes("Could not find the table");
        if (isMissingTableError) {
            throw new Error("Database feature not available: 'header_sets' table is missing. Please run the v1.0.2 database script.");
        }
        console.error('Error deleting header set:', error);
        throw error;
    }
};
