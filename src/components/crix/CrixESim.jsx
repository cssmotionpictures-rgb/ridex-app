import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/base44Client';
import { Loader2, Globe, X } from 'lucide-react';

export default function CrixESim({ onChanged }) {
  const [country, setCountry] = useState('DE');
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);

  const COUNTRIES = [
    { code: 'DE', name: 'Germany' },
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'FR', name: 'France' },
    { code: 'TR', name: 'Turkey' },
    { code: 'AE', name: 'UAE' },
    { code: 'IN', name: 'India' },
    { code: 'CA', name: 'Canada' },
  ];

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('kripicard-services', {
        body: { action: 'esim_packages', country },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setPackages(data.packages || []);
    } catch (e) {
      setError(e.message || 'Could not load eSIM packages');
      setPackages([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [country]);

  const purchase = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('kripicard-services', {
        body: {
          action: 'esim_purchase',
          recipient_email: email,
          product_id: selected.product_id,
          price_usd: selected.price,
        },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setSuccess({ ref: data.order_ref, message: data.message });
      setSelected(null);
      setEmail('');
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Purchase failed');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-white font-bold text-lg">eSIM Data Plans</h3>
        <p className="text-gray-400 text-xs">Instant data for travel. QR code delivered to email.</p>
      </div>

      <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none">
        {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
      </select>

      {error && <div className="p-3 bg-red-950 border border-red-800 rounded-lg"><p className="text-red-400 text-xs">{error}</p></div>}

      {success && (
        <div className="p-3 bg-green-950 border border-green-800 rounded-lg">
          <p className="text-green-400 text-xs">✅ eSIM purchased. Ref: {success.ref}</p>
          <p className="text-gray-400 text-[10px] mt-1">QR code has been sent to {email}.</p>
        </div>
      )}

      {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}

      {!loading && packages.length === 0 && !error && (
        <div className="p-6 bg-gray-900 border border-gray-800 rounded-xl text-center">
          <Globe className="w-8 h-8 text-orange-500 mx-auto mb-2" />
          <p className="text-white text-sm">No eSIM plans for {country}</p>
          <p className="text-gray-400 text-xs mt-1">Try another country.</p>
        </div>
      )}

      <div className="space-y-2">
        {packages.map((p) => (
          <button
            key={p.product_id}
            onClick={() => setSelected(p)}
            className="w-full p-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg flex justify-between items-center"
          >
            <div className="text-left">
              <p className="text-white text-sm font-semibold">{p.name}</p>
              <p className="text-gray-400 text-xs">{p.data} · {p.validity} days</p>
            </div>
            <p className="text-orange-400 font-bold">${p.price}</p>
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
              <p className="text-gray-400 text-xs">{selected.data} · {selected.validity} days · <span className="text-orange-400 font-bold">${selected.price}</span></p>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Delivery Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none" />
              </div>
              <button onClick={purchase} disabled={busy || !email} className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 text-white font-bold rounded-lg text-sm">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Buy · $${selected.price}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
