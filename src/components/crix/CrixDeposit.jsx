import React, { useState } from 'react';
import { supabase } from '@/api/base44Client';

export default function CrixDeposit({ onSuccess }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const quickAmounts = [1000, 2000, 5000, 10000, 20000, 50000];

  const handleDeposit = async () => {
    setError(null);
    const amt = Number(amount);
    if (!amt || amt < 100) {
      setError('Minimum deposit is N100');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please log in first');

      const { data, error: fnError } = await supabase.functions.invoke('flutterwave-init', {
        body: {
          amount: amt,
          currency: 'NGN',
          email: user.email,
          name: user.user_metadata?.full_name || user.email,
          phone: user.user_metadata?.phone || '0000000000',
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      if (!data?.link) throw new Error('No payment link returned');

      window.location.href = data.link;
    } catch (err) {
      setError(err.message || 'Could not start payment');
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
      <h3 className="text-white font-bold text-lg mb-1">Add Money</h3>
      <p className="text-gray-400 text-xs mb-4">
        Fund your CRIX wallet instantly with card, bank transfer, or USSD.
      </p>

      <div className="mb-4">
        <label className="text-gray-400 text-xs mb-2 block">Amount (NGN)</label>
        <div className="flex items-center bg-gray-800 rounded-lg px-3">
          <span className="text-gray-500 text-lg font-bold mr-2">N</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-transparent text-white text-lg py-3 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {quickAmounts.map((amt) => (
          <button
            key={amt}
            onClick={() => setAmount(String(amt))}
            className="py-2 px-3 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg transition"
          >
            N{amt.toLocaleString()}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-950 rounded-lg border border-red-800">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      <button
        onClick={handleDeposit}
        disabled={loading || !amount}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded-lg transition"
      >
        {loading ? 'Opening checkout...' : 'Continue to Payment'}
      </button>

      <p className="mt-3 text-[10px] text-gray-500 text-center">
        Secured by CRIX - Cards, bank transfer, USSD supported
      </p>
    </div>
  );
}
