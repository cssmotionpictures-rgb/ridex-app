import React, { useState, useMemo } from 'react';
import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3';
import { supabase } from '@/api/base44Client';

const PLATFORM_CUT_PCT = 1.0;
const FLUTTERWAVE_PCT = 2.0;
const VAT_PCT = 7.5;

export default function CrixDeposit({ onSuccess }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paymentParams, setPaymentParams] = useState(null);
  const quickAmounts = [1000, 2000, 5000, 10000, 20000, 50000];

  const breakdown = useMemo(() => {
    const net = Number(amount) || 0;
    if (net <= 0) return null;
    const fwFee = net * (FLUTTERWAVE_PCT / 100);
    const fwVat = fwFee * (VAT_PCT / 100);
    const platformFee = net * (PLATFORM_CUT_PCT / 100);
    const platformVat = platformFee * (VAT_PCT / 100);
    const totalFee = fwFee + fwVat + platformFee + platformVat;
    const grossCharge = net + totalFee;
    return {
      net: Math.round(net * 100) / 100,
      totalFee: Math.round(totalFee * 100) / 100,
      grossCharge: Math.round(grossCharge * 100) / 100,
    };
  }, [amount]);

  const config = paymentParams ? {
    public_key: import.meta.env.VITE_FLW_PUBLIC_KEY,
    tx_ref: paymentParams.tx_ref,
    amount: paymentParams.amount,
    currency: paymentParams.currency,
    payment_options: 'card,banktransfer,ussd',
    customer: {
      email: paymentParams.customer.email || '',
      phone_number: paymentParams.customer.phone || '',
      name: paymentParams.customer.name || '',
    },
    customizations: {
      title: 'CRIXCOIN Wallet',
      description: 'Fund your CRIX wallet',
      logo: 'https://app.crixcoin.de5.net/logo.png',
    },
  } : null;

  const handleFlutterPayment = useFlutterwave(config);

  const startPayment = async () => {
    setError(null);
    const amt = Number(amount);
    if (!amt || amt < 100) { setError('Minimum deposit is N100'); return; }
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Please log in first');

      const { data, error: fnError } = await supabase.functions.invoke('flutterwave-init', {
        body: {
          amount: amt,
          currency: 'NGN',
          email: authUser.email,
          name: authUser.user_metadata?.full_name || authUser.email,
          phone: authUser.user_metadata?.phone || '0000000000',
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setPaymentParams(data);
      setLoading(false);

      setTimeout(() => {
        handleFlutterPayment({
          callback: (response) => {
            closePaymentModal();
            if (response.status === 'successful') {
              onSuccess?.();
            }
          },
          onClose: () => setLoading(false),
        });
      }, 50);
    } catch (err) {
      setError(err.message || 'Could not start payment');
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
      <h3 className="text-white font-bold text-lg mb-1">Add Money</h3>
      <p className="text-gray-400 text-xs mb-4">Fund your CRIX wallet instantly with card, bank transfer, or USSD.</p>

      <div className="mb-4">
        <label className="text-gray-400 text-xs mb-2 block">Amount (NGN)</label>
        <div className="flex items-center bg-gray-800 rounded-lg px-3">
          <span className="text-gray-500 text-lg font-bold mr-2">N</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="w-full bg-transparent text-white text-lg py-3 outline-none" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {quickAmounts.map((amt) => (
          <button key={amt} onClick={() => setAmount(String(amt))} className="py-2 px-3 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg transition">
            N{amt.toLocaleString()}
          </button>
        ))}
      </div>

      {breakdown && (
        <div className="mb-4 p-3 bg-gray-800 rounded-lg space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">You deposit</span>
            <span className="text-white">N{breakdown.net.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Platform Fee</span>
            <span className="text-white">N{breakdown.totalFee.toLocaleString()}</span>
          </div>
          <div className="border-t border-gray-700 pt-1.5 flex justify-between text-sm">
            <span className="text-gray-300 font-semibold">Total to pay</span>
            <span className="text-orange-400 font-bold">N{breakdown.grossCharge.toLocaleString()}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-950 rounded-lg border border-red-800">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      <button onClick={startPayment} disabled={loading || !amount} className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded-lg transition">
        {loading ? 'Opening checkout...' : 'Continue to Payment'}
      </button>

      <p className="mt-3 text-[10px] text-gray-500 text-center">Secured by CRIX - Cards, bank transfer, USSD</p>
    </div>
  );
}
