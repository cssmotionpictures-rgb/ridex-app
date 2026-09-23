import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nnbrvveqhfadsmkjmzvb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_sWSYNBuWO8eXdWAgK77xng_HqCu4ioL';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Auth — matching the method names the app expects
const auth = {
  me: async () => {
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  },

  getCurrentUser: async () => {
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  },

  logout: async (redirectUrl) => {
    await supabase.auth.signOut();
    if (redirectUrl) window.location.href = redirectUrl;
  },

  signOut: async () => supabase.auth.signOut(),

  redirectToLogin: (returnTo) => {
    window.location.href = '/login' + (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '');
  },

  loginViaEmailPassword: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  signIn: async (email, password) =>
    supabase.auth.signInWithPassword({ email, password }),

  loginWithProvider: async (provider, returnTo) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider === 'google' ? 'google' : provider,
      options: { redirectTo: returnTo || window.location.origin }
    });
    if (error) throw error;
    return data;
  },

  signInWithGoogle: () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    }),

  signUp: async (email, password, options = {}) =>
    supabase.auth.signUp({ email, password, options: { data: options } }),

  onAuthStateChange: (callback) => supabase.auth.onAuthStateChange(callback),
  getSession: () => supabase.auth.getSession(),
};

// Entities
const toSnake = (str) =>
  str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, '');

const makeEntity = (tableName) => ({
  list: () => supabase.from(tableName).select('*'),
  filter: (query) => {
    let q = supabase.from(tableName).select('*');
    for (const [key, value] of Object.entries(query || {})) {
      q = q.eq(key, value);
    }
    return q;
  },
  get: (id) => supabase.from(tableName).select('*').eq('id', id).single(),
  create: (data) => supabase.from(tableName).insert(data).select().single(),
  update: (id, data) => supabase.from(tableName).update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from(tableName).delete().eq('id', id),
});

const entities = new Proxy({}, {
  get: (_target, prop) => makeEntity(toSnake(prop)),
});

const functions = {
  invoke: async (name, body = {}) => {
    const { data, error } = await supabase.functions.invoke(name, {
      body: JSON.stringify(body),
    });
    if (error) return { error };
    return { data };
  },
};

export const base44 = { auth, entities, functions, supabase };
