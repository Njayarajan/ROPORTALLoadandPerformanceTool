import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Session, AuthError } from '@supabase/supabase-js';
import type { AppUser } from '../types';
import { getTestModeStatus } from '../services/configService';
import { useDebugActions } from '../components/DebugContext';

interface AuthContextType {
  user: AppUser | null;
  session: Session | null;
  isLoading: boolean;
  isTestMode: boolean;
  signIn: (email: string, password:string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  logout: (actionId: string) => Promise<{ error: AuthError | null }>;
  refreshTestMode: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTestMode, setIsTestMode] = useState(false);
  const { log, updateLiveState } = useDebugActions();
  
  useEffect(() => {
      updateLiveState('Auth User', user ? user.email : 'null');
      updateLiveState('Auth Session', session ? 'Active' : 'null');
  }, [user, session, updateLiveState]);

  const refreshTestMode = useCallback(async () => {
    try {
        const status = await getTestModeStatus();
        setIsTestMode(status);
    } catch (error) {
        console.error("Failed to refresh test mode status:", error);
        setIsTestMode(false);
    }
  }, []);

  const updateUserProfile = useCallback(async (session: Session | null) => {
    try {
      log('AUTH', 'updateUserProfile called.', { hasSession: !!session });
      if (session?.user) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        const isExpectedError = error && (error.code === 'PGRST116' || error.message.includes('relation "public.profiles" does not exist'));

        if (error && !isExpectedError) {
           throw error;
        }
        
        const appUser: AppUser = { ...session.user, profile: profile ?? undefined };
        setUser(appUser);
        setSession(session);
      } else {
        setUser(null);
        setSession(null);
      }
    } catch (e: any) {
       log('ERROR', 'Caught critical error in updateUserProfile. Clearing state and signing out.', { error: e.message });
       setUser(null);
       setSession(null);
       // This call might also fail if network is down, but we want to ensure the local state is cleared.
       await supabase.auth.signOut().catch(err => log('ERROR', 'Sign out failed within updateUserProfile catch block', { error: err.message }));
    }
  }, [log]);
    
  useEffect(() => {
    // This effect provides a robust, two-part authentication flow.
    // 1. A self-contained async function (`initialize`) runs ONCE to check the
    //    initial state and, critically, guarantees the loading spinner is removed.
    // 2. A listener is set up to handle all subsequent auth changes.

    // Part 2: Set up the listener for ongoing auth changes (login, logout, token refresh).
    // This is safe because `updateUserProfile` has a comprehensive internal try/catch.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        log('AUTH', `Auth state changed. Event: ${_event}`, { hasSession: !!session });
        updateUserProfile(session);
    });

    // Part 1: Perform the one-time initialization check.
    const initialize = async () => {
        try {
            log('AUTH', 'AuthProvider: Initializing session and config...');
            // First, get the session. A network error here (like 'Failed to fetch') will be caught.
            const { data: { session } } = await supabase.auth.getSession();
            // Manually update the profile with this initial session. The listener may also
            // fire, but this is fine. This ensures we await the first profile load.
            await updateUserProfile(session);
            // Also fetch other initial config.
            await refreshTestMode();
        } catch (error) {
            log('ERROR', 'A critical error occurred during initial auth check.', { 
                error: error instanceof Error ? error.message : String(error)
            });
            // If initialization fails, the user/session state will be null, which is correct.
            // No need to sign out, as we couldn't connect anyway.
        } finally {
            // CRITICAL: This block is guaranteed to execute, even if an error is thrown
            // in the try block. This ensures the loading spinner is always removed.
            log('AUTH', 'AuthProvider: Initialization finished.');
            setIsLoading(false);
        }
    };
    
    initialize();

    // Cleanup function: Unsubscribe from the listener when the component unmounts.
    return () => {
      log('AUTH', 'AuthProvider unmounting. Unsubscribing from auth state changes.');
      subscription.unsubscribe();
    };
  }, [log, updateUserProfile, refreshTestMode]); // These dependencies are stable callbacks, so the effect runs once.

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // The onAuthStateChange listener will handle the success case. We just need to report the error.
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  }, []);

  const logout = useCallback(async (actionId: string) => {
    log('AUTH', 'AuthContext logout function called.', undefined, actionId);
    const { error } = await supabase.auth.signOut();
    if (error) {
        log('ERROR', 'Supabase sign out returned an error.', { error }, actionId);
    } else {
        // Manually clear state on logout for immediate UI update, though the listener will also fire.
        setUser(null);
        setSession(null);
        log('SUCCESS', 'Supabase sign out call completed successfully. Local state cleared.', undefined, actionId);
    }
    return { error };
  }, [log]);

  const value = { user, session, isLoading, isTestMode, signIn, signUp, logout, refreshTestMode };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
