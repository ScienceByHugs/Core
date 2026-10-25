import type { Session } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Same rule as the web app: a Supabase session alone is not access. The account
// must be confirmed with the Auth server and carry an owner or admin role.
export const adminRoles = ['owner', 'admin'] as const;
export const roleOf = (user: { app_metadata?: Record<string, unknown> } | null | undefined) =>
  String(user?.app_metadata?.role ?? '').trim().toLowerCase();

type AuthState = {
  session: Session | null;
  loading: boolean;
  deniedEmail: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [deniedEmail, setDeniedEmail] = useState<string | null>(null);

  const accept = useCallback(async (candidate: Session | null) => {
    if (!candidate) {
      setSession(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.auth.getUser();
    const user = data.user;
    if (error || !user) {
      setSession(null);
    } else if (!(adminRoles as readonly string[]).includes(roleOf(user))) {
      setDeniedEmail(user.email ?? 'This account');
      await supabase.auth.signOut();
      setSession(null);
    } else {
      setDeniedEmail(null);
      setSession(candidate);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => { if (mounted) void accept(data.session); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // Defer work out of the auth callback, as Supabase recommends.
      setTimeout(() => { if (mounted) void accept(next); }, 0);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [accept]);

  const value = useMemo<AuthState>(() => ({
    session,
    loading,
    deniedEmail,
    async signIn(email, password) {
      setDeniedEmail(null);
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message);
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error('Could not sign out. Try again.');
    },
  }), [session, loading, deniedEmail]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
