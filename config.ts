// --- Application Configuration ---

/**
 * Development Mode Switch for Authentication.
 *
 * Set this to `false` to disable the Supabase login screen and bypass all authentication.
 * The app will run in a "dev mode" with a mock admin user, allowing full access
 * to all features without needing to log in.
 *
 * Set this to `true` for production or staging environments to enable the full
 * Supabase authentication flow, requiring users to sign in.
 */
export const AUTH_ENABLED = true;