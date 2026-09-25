import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/base44Client';
import { Loader2, Gift, X } from 'lucide-react';

export default function CrixGiftCards({ onChanged }) {
  const [country, setCountry] = useState('US');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);

  const COUNTRIES = ['US', 'GB', 'TR', 'NG', 'CA', 'DE', 'FR', 'IN', 'AE'];

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('kripicard-services', {
        body: { action: 'gift_products', country, search: search || undefined },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setProducts(data.products || []);
    } catch (e) {
      setError(e.message || 'Could not load gift cards');
      setProducts([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [country]);

  const purchase = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const localAmount = Number(amount) || Number(selected.fixed_denominations?.[0]) || Number(selected.min_amount) || 10;
      const { data, error: fnErr } = await supabase.functions.invoke('kripicard-services', {
        body: {
          action: 'gift_purchase',
          recipient_email: email,
          product_id: selected.product_id,
          country_iso: selected.country_iso,
          local_amount: localAmount,
          service_name: selected.name,
          total_usd: localAmount,
        },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setSuccess({ ref: data.order_ref, message: data.message });
      setSelected(null);
      setEmail('');
      setAmount('');
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Purchase failed');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-white font-bold text-lg">Gift Cards</h3>
        <p className="text-gray-400 text-xs">Buy global gift cards with your CRIX wallet. Code delivered to email.</p>
      </div>

      <div className="flex gap-2">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none"
        >
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search brands..."
          className="flex-1 bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none"
        />
        <button onClick={load} disabled={loading} className="px-4 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-lg disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-950 border border-red-800 rounded-lg">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-950 border border-green-800 rounded-lg">
          <p className="text-green-400 text-xs">✅ Order placed. Ref: {success.ref}</p>
          <p className="text-gray-400 text-[10px] mt-1">Code will be emailed once approved (usually within 1–24 hours).</p>
        </div>
      )}

      {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}

      {!loading && products.length === 0 && !error && (
        <div className="p-6 bg-gray-900 border border-gray-800 rounded-xl text-center">
          <Gift className="w-8 h-8 text-orange-500 mx-auto mb-2" />
          <p className="text-white text-sm">No gift cards for {country}</p>
          <p className="text-gray-400 text-xs mt-1">Try another country or search term.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {products.slice(0, 30).map((p) => (
          <button
            key={p.product_id}
            onClick={() => { setSelected(p); setAmount(String(p.fixed_denominations?.[0] || p.min_amount || 10)); }}
            className="p-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-left"
          >
            <p className="text-white text-xs font-semibold truncate">{p.name}</p>
            <p className="text-gray-500 text-[10px] mt-1">{p.currency} · {p.denomination_type || 'FIXED'}</p>
            <p className="text-orange-400 text-[10px] mt-1">
              {p.fixed_denominations ? p.fixed_denominations.join(' / ') : `${p.min_amount || '-'}–${p.max_amount || '-'}`}
            </p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-sm">{selected.name}</h3>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Recipient Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Amount ({selected.currency})</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none" />
              </div>
              <p className="text-[10px] text-gray-500">Charge will be deducted from your CRXS wallet at current rate. Code arrives by email.</p>
              <button onClick={purchase} disabled={busy || !email} className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 text-white font-bold rounded-lg text-sm">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Buy Gift Card'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
