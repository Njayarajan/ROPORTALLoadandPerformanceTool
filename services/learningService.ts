
import { supabase } from './supabaseClient';

/**
 * Computes a SHA-256 hash for a given string payload.
 * Used to uniquely identify a payload to prevent duplicates in the learning database.
 * @param payload The string content of the payload.
 * @returns A promise that resolves to the hex string of the hash.
 */
const computePayloadHash = async (payload: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Saves a successfully validated payload to the Supabase database for future learning.
 * It computes a hash to avoid storing duplicate payloads for the same endpoint.
 * This function will now throw an error if the save operation fails, allowing the UI to give feedback.
 * @param path The endpoint path (e.g., /api/Submission).
 * @param method The HTTP method (e.g., POST).
 * @param payload The raw string of the JSON payload.
 */
export const saveSuccessfulPayload = async (path: string, method: string, payload: string): Promise<void> => {
    try {
        const payloadJson = JSON.parse(payload);
        const hash = await computePayloadHash(payload);

        // This table name must match the one in your Supabase setup
        const { error } = await (supabase
            .from('successful_payloads') as any)
            .upsert({
                endpoint_path: path,
                http_method: method.toUpperCase(),
                payload: payloadJson,
                payload_hash: hash,
            }, {
                onConflict: 'endpoint_path,http_method,payload_hash',
            });
        
        if (error) {
            console.error('Could not save learned payload:', error.message);
            throw new Error(`Database error: ${error.message}`);
        }
    } catch (err) {
        if (err instanceof SyntaxError) {
             throw new Error("The provided body is not valid JSON.");
        }
        console.error('Error processing payload for learning service:', err);
        if (err instanceof Error) {
            throw err;
        }
        throw new Error('An unexpected error occurred while processing the payload.');
    }
};

/**
 * Retrieves recent successful payloads for a given endpoint to be used as examples.
 * @param path The endpoint path.
 * @param method The HTTP method.
 * @param limit The maximum number of examples to retrieve.
 * @returns A promise that resolves to an array of payload objects.
 */
export const getLearnedPayloads = async (path: string, method: string, limit: number = 3): Promise<any[]> => {
    try {
        const { data, error } = await (supabase
            .from('successful_payloads') as any)
            .select('payload')
            .eq('endpoint_path', path)
            .eq('http_method', method.toUpperCase())
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            const isMissingTable = error.message.includes('relation "public.successful_payloads" does not exist');
            if (!isMissingTable) {
               console.warn(`Could not retrieve learned payloads for ${method} ${path}:`, error.message);
            }
            // If the table doesn't exist, it's not an error, just means no learning has happened.
            return [];
        }
        
        return data.map((item: { payload: any }) => item.payload);
    } catch (err) {
        console.warn('Error fetching learned payloads:', err);
        return [];
    }
};
