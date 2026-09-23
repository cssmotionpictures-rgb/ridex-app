import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState({ id: 'crixcoin', public_settings: {} });

  useEffect(() => {
    let mounted = true;

    // Initial session check
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data?.session?.user || null);
      setIsAuthenticated(!!data?.session?.user);
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
      setAuthChecked(true);
    });

    // Live auth state changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user || null);
      setIsAuthenticated(!!session?.user);
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
      setAuthChecked(true);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(error.message);
      throw error;
    }
    return data;
  };

  const loginWithProvider = async (provider, returnTo) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider === 'google' ? 'google' : provider,
      options: { redirectTo: returnTo || window.location.origin }
    });
    if (error) {
      setAuthError(error.message);
      throw error;
    }
    return data;
  };

  const signup = async (email, password, options = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: options }
    });
    if (error) {
      setAuthError(error.message);
      throw error;
    }
    return data;
  };

  const logout = async (redirectUrl) => {
    await supabase.auth.signOut();
    if (redirectUrl) window.location.href = redirectUrl;
  };

  const redirectToLogin = (returnTo) => {
    window.location.href = '/login' + (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '');
  };

  const value = {
    user,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    authChecked,
    appPublicSettings,
    login,
    loginWithEmailPassword: login,
    loginWithProvider,
    signup,
    logout,
    redirectToLogin,
    checkUserAuth: async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user || null);
      setIsAuthenticated(!!data?.user);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export default AuthContext;
