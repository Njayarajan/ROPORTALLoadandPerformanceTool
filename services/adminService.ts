import { supabase } from './supabaseClient';
import type { AdminUserWithProfile } from '../types';

/**
 * Helper function to invoke a Supabase Edge Function.
 * It relies on the Supabase client to automatically handle authentication.
 * Includes detailed error handling to guide the user in setting up backend functions.
 */
const invokeAdminFunction = async (functionName: string, body: object) => {
    const { data, error } = await supabase.functions.invoke(functionName, {
        body,
    });

    if (error) {
        // NOTE: console.error removed to avoid showing confusing raw errors in the console.
        // The error is thrown and handled gracefully in the UI, which provides better instructions.
        
        if (error.message.includes('Function not found')) {
            throw new Error(`Backend Action Required: The '${functionName}' Edge Function is not deployed. Please follow the setup instructions in the Admin Panel.`);
        }
        
        // The "Failed to send a request" error is almost always a CORS issue
        // that must be resolved in the server-side Edge Function code.
        if (error.message.includes('Failed to send a request')) {
             throw new Error("Backend Action Required\nThe user management features require Supabase Edge Functions to be deployed on your backend. It seems they are not set up yet.\n\n" +
             "Failed to send a request to the Edge Function. This is a CORS issue. Please ensure your server-side function handles OPTIONS requests correctly. See the step-by-step guide in the 'User Management' tab of the Admin Panel for the complete solution.");
        }

        // Fallback for other potential errors.
        throw new Error(`Error invoking ${functionName}:\n${error.message}`);
    }

    return data;
};

/**
 * Fetches all users and their profiles. Requires a 'list-users' Edge Function.
 * @returns A promise that resolves to an array of users with their profiles.
 */
export const listUsers = async (): Promise<AdminUserWithProfile[]> => {
    const data = await invokeAdminFunction('list-users', {});
    // The backend function returns { users: [...] }
    if (!data || !Array.isArray(data.users)) {
        console.error('Invalid response from list-users function. Expected an object with a "users" array.', data);
        throw new Error('Received an invalid response from the list-users function.');
    }
    return data.users as AdminUserWithProfile[];
};

/**
 * Invites a new user by email. Requires an 'invite-user' Edge Function.
 * @param email The email of the user to invite.
 * @param role The role to assign to the new user ('user' or 'admin').
 */
export const inviteUser = async (email: string, role: 'user' | 'admin'): Promise<void> => {
    await invokeAdminFunction('invite-user', { email, role });
};

/**
 * Updates a user's role. Requires an 'update-user-role' Edge Function.
 * @param userId The ID of the user to update.
 * @param role The new role to assign.
 */
export const updateUserRole = async (userId: string, role: 'user' | 'admin'): Promise<void> => {
    await invokeAdminFunction('update-user-role', { userId, role });
};

/**
 * Deletes a user. Requires a 'delete-user' Edge Function.
 * @param userId The ID of the user to delete.
 */
export const deleteUser = async (userId: string): Promise<void> => {
    await invokeAdminFunction('delete-user', { userId });
};