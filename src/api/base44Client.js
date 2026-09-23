import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nnbrvveqhfadsmkjmzvb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_sWSYNBuWO8eXdWAgK77xng_HqCu4ioL';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Auth ───
const auth = {
  signIn: (email, password) => 
    supabase.auth.signInWithPassword({ email, password }),

  signUp: (email, password, options = {}) => 
    supabase.auth.signUp({ 
      email, 
      password, 
      options: { data: options } 
    }),

  signOut: () => supabase.auth.signOut(),

  getCurrentUser: async () => {
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  },

  onAuthStateChange: (callback) => 
    supabase.auth.onAuthStateChange(callback),

  signInWithGoogle: () => 
    supabase.auth.signInWithOAuth({ 
      provider: 'google',
      options: { redirectTo: window.location.origin }
    }),

  getSession: () => supabase.auth.getSession(),
};

// ─── Entities ───
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

// ─── Functions ───
const functions = {
  invoke: async (name, body = {}) => {
    const { data, error } = await supabase.functions.invoke(name, {
      body: JSON.stringify(body),
    });
    if (error) return { error };
    return { data };
  },
};

export const base44 = {
  auth,
  entities,
  functions,
  supabase,
}import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nnbrvveqhfadsmkjmzvb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_sWSYNBuWO8eXdWAgK77xng_HqCu4ioL';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const auth = {
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  signUp: (email, password, options = {}) => supabase.auth.signUp({ email, password, options: { data: options } }),
  signOut: () => supabase.auth.signOut(),
  getCurrentUser: async () => { const { data } = await supabase.auth.getUser(); return data?.user || null; },
  onAuthStateChange: (callback) => supabase.auth.onAuthStateChange(callback),
  signInWithGoogle: () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }),
  getSession: () => supabase.auth.getSession(),
};

const toSnake = (str) => str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, '');

const makeEntity = (tableName) => ({
  list: () => supabase.from(tableName).select('*'),
  filter: (query) => { let q = supabase.from(tableName).select('*'); for (const [key, value] of Object.entries(query || {})) { q = q.eq(key, value); } return q; },
  get: (id) => supabase.from(tableName).select('*').eq('id', id).single(),
  create: (data) => supabase.from(tableName).insert(data).select().single(),
  update: (id, data) => supabase.from(tableName).update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from(tableName).delete().eq('id', id),
});

const entities = new Proxy({}, { get: (_target, prop) => makeEntity(toSnake(prop)) });

const functions = {
  invoke: async (name, body = {}) => {
    const { data, error } = await supabase.functions.invoke(name, { body: JSON.stringify(body) });
    if (error) return { error };
    return { data };
  },
};

