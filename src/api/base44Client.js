import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nnbrvveqhfadsmkjmzvb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_sWSYNBuWO8eXdWAgK77xng_HqCu4ioL';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function withRole(u) {
  if (!u) return null;
  return {
    ...u,
    role: u.user_metadata?.role || u.app_metadata?.role || 'user',
    name: u.user_metadata?.full_name || u.user_metadata?.name || u.email,
    email: u.email,
    id: u.id,
  };
}

const auth = {
  me: async () => {
    try { const { data } = await supabase.auth.getUser(); return withRole(data?.user); }
    catch { return null; }
  },
  getCurrentUser: async () => {
    try { const { data } = await supabase.auth.getUser(); return withRole(data?.user); }
    catch { return null; }
  },
  isAuthenticated: async () => {
    try { const { data } = await supabase.auth.getSession(); return !!data?.session; }
    catch { return false; }
  },
  logout: async (redirectUrl) => {
    await supabase.auth.signOut();
    if (redirectUrl) window.location.href = redirectUrl;
  },
  signOut: async () => supabase.auth.signOut(),
  redirectToLogin: (returnTo) => {
    window.location.href = '/login' + (returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : '');
  },
  loginViaEmailPassword: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  register: async (emailOrObj, password, options = {}) => {
    let email = emailOrObj, pwd = password, opts = options;
    if (typeof emailOrObj === 'object' && emailOrObj !== null) {
      email = emailOrObj.email; pwd = emailOrObj.password; opts = emailOrObj;
    }
    const metadata = {};
    if (opts.full_name) metadata.full_name = opts.full_name;
    if (opts.name) metadata.full_name = opts.name;
    if (opts.username) metadata.username = opts.username;
    const { data, error } = await supabase.auth.signUp({
      email, password: pwd, options: { data: metadata },
    });
    if (error) throw error;
    return data;
  },
  loginWithProvider: async (provider, returnTo) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider, options: { redirectTo: returnTo || window.location.origin },
    });
    if (error) throw error;
    return data;
  },
  signInWithGoogle: () => supabase.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: window.location.origin },
  }),
  signUp: (email, password, options = {}) => supabase.auth.signUp({
    email, password, options: { data: options },
  }),
  updateMe: async (updates) => {
    const { data, error } = await supabase.auth.updateUser({ data: updates });
    if (error) throw error;
    return withRole(data?.user);
  },
  resendOtp: async (email) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
    return { success: true };
  },
  verifyOtp: async ({ email, token, type = 'signup' }) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type });
    if (error) throw error;
    return data;
  },
  resetPasswordRequest: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    if (error) throw error;
    return { success: true };
  },
  resetPassword: async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return data;
  },
  setToken: () => {},
  onAuthStateChange: (cb) => supabase.auth.onAuthStateChange(cb),
  getSession: () => supabase.auth.getSession(),
};

const TABLE_MAP = {
  Wallet: 'crix_wallets', CrixWallet: 'crix_wallets', CrxsWallet: 'crix_wallets',
  Transaction: 'crix_transactions', CrixTransaction: 'crix_transactions', CrxsTransaction: 'crix_transactions',
  Bill: 'crix_bills', CrixBill: 'crix_bills',
  Deposit: 'crix_deposits', CrixDeposit: 'crix_deposits',
  CurveTrade: 'crix_curve_trades', CrixCurveTrade: 'crix_curve_trades',
  VirtualCard: 'crix_virtual_cards', CrixVirtualCard: 'crix_virtual_cards',
  Activity: 'crix_activity', CrixActivity: 'crix_activity',
};

const toSnake = (name) => {
  if (TABLE_MAP[name]) return TABLE_MAP[name];
  return name.replace(/[A-Z]/g, (c, i) => (i ? '_' : '') + c.toLowerCase());
};

const makeEntity = (tableName) => ({
  list: (sort, limit) => {
    let q = supabase.from(tableName).select('*');
    if (sort) {
      const col = sort.startsWith('-') ? sort.slice(1) : sort;
      q = q.order(col, { ascending: !sort.startsWith('-') });
    }
    if (limit) q = q.limit(limit);
    return q;
  },
  filter: (query, sort) => {
    let q = supabase.from(tableName).select('*');
    for (const [k, v] of Object.entries(query || {})) q = q.eq(k, v);
    if (sort) {
      const col = sort.startsWith('-') ? sort.slice(1) : sort;
      q = q.order(col, { ascending: !sort.startsWith('-') });
    }
    return q;
  },
  get: (id) => supabase.from(tableName).select('*').eq('id', id).single(),
  create: (data) => supabase.from(tableName).insert(data).select().single(),
  update: (id, data) => supabase.from(tableName).update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from(tableName).delete().eq('id', id),
  subscribe: () => () => {},
});

const entities = new Proxy({}, { get: (_t, prop) => makeEntity(toSnake(prop)) });

const functions = {
  invoke: async (name, body = {}) => {
    const { data, error } = await supabase.functions.invoke(name, { body: JSON.stringify(body) });
    if (error) return { error };
    return { data };
  },
};

export const base44 = { auth, entities, functions, supabase };
