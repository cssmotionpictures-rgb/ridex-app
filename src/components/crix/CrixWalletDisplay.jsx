import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/base44Client';

export default function CrixWalletDisplay() {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchOrCreateWallet() {
      try {
        const { data, error } = await supabase.functions.invoke('crix-create-wallet');
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setWallet(data);
      } catch (err) {
        setError(err.message || 'Could not load wallet');
      } finally {
        setLoading(false);
      }
    }
    fetchOrCreateWallet();
  }, []);

  const copyAddress = () => {
    if (!wallet?.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="p-6 bg-gray-900 rounded-xl">
        <p className="text-gray-400 text-sm">Creating your CRIX wallet...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-950 rounded-xl border border-red-800">
        <p className="text-red-400 text-sm">Wallet error: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
      <h3 className="text-white font-bold text-lg mb-1">Your CRIX Wallet</h3>
      <p className="text-gray-400 text-xs mb-4">
        Send ETH, USDC, or CRIX on Base to this address from anywhere in the world.
      </p>

      <div className="p-3 bg-gray-800 rounded-lg">
        <p className="text-white font-mono text-xs break-all leading-relaxed">
          {wallet?.address}
        </p>
      </div>

      <button
        onClick={copyAddress}
        className="mt-3 w-full py-2 px-4 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition"
      >
        {copied ? 'Copied' : 'Copy Address'}
      </button>

      <p className="mt-3 text-[10px] text-gray-500 text-center">
        Network: Base Mainnet - Chain ID 8453
      </p>
    </div>
  );
}
