import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/base44Client';
import { Loader2, CreditCard, Plus, Snowflake, Trash2, DollarSign, X } from 'lucide-react';

const ngn = (v) => "$" + Number(v || 0).toFixed(2);

export default function CrixDollarCardPanel({ onChanged }) {
  const [cards, setCards] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showFund, setShowFund] = useState(null);
  const [form, setForm] = useState({ bin: '49387519', amount: '20', name_on_card: '', dateOfBirth: '' });
  const [fundAmount, setFundAmount] = useState('10');

  const loadCards = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('kripicard-services', {
        body: { action: 'card_list' },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setCards(data.cards || []);
    } catch (e) {
      setError(e.message || 'Could not load cards');
      setCards([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadCards(); }, []);

  const createCard = async () => {
    setBusy(true);
    setError(null);
    try {
      if (Number(form.amount) < 10) throw new Error('Minimum card amount is $10');
      if (!form.name_on_card || form.name_on_card.length < 2) throw new Error('Cardholder name required');

      const { data, error: fnErr } = await supabase.functions.invoke('kripicard-services', {
        body: {
          action: 'card_create',
          bin: form.bin,
          amount: Number(form.amount),
          name_on_card: form.name_on_card,
          dateOfBirth: form.dateOfBirth || undefined,
        },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);

      setShowCreate(false);
      setForm({ bin: '49387519', amount: '20', name_on_card: '', dateOfBirth: '' });
      await loadCards();
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Could not create card');
    }
    setBusy(false);
  };

  const fundCard = async () => {
    setBusy(true);
    setError(null);
    try {
      if (Number(fundAmount) < 10) throw new Error('Minimum fund is $10');
      const { data, error: fnErr } = await supabase.functions.invoke('kripicard-services', {
        body: { action: 'card_fund', card_id: showFund.card_id, amount: Number(fundAmount) },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setShowFund(null);
      setFundAmount('10');
      await loadCards();
    } catch (e) {
      setError(e.message || 'Could not fund card');
    }
    setBusy(false);
  };

  const freezeCard = async (card, freeze) => {
    setBusy(true);
    try {
      await supabase.functions.invoke('kripicard-services', {
        body: { action: 'card_freeze', card_id: card.card_id, freeze },
      });
      await loadCards();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const deleteCard = async (card) => {
    if (!confirm('Delete this card permanently? Funds return to your account.')) return;
    setBusy(true);
    try {
      await supabase.functions.invoke('kripicard-services', {
        body: { action: 'card_delete', card_id: card.card_id },
      });
      await loadCards();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-lg">USD Virtual Cards</h3>
          <p className="text-gray-400 text-xs">Spend anywhere Mastercard is accepted. Load only what you need.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg"
        >
          <Plus className="w-4 h-4" /> New Card
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-950 border border-red-800 rounded-lg">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      {cards.length === 0 && (
        <div className="p-6 bg-gray-900 border border-gray-800 rounded-xl text-center">
          <CreditCard className="w-8 h-8 text-orange-500 mx-auto mb-2" />
          <p className="text-white text-sm">No cards yet</p>
          <p className="text-gray-400 text-xs mt-1">Create your first USD card to start spending online.</p>
        </div>
      )}

      {cards.map((card) => (
        <div key={card.card_id} className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-white font-semibold">{card.name_on_card || 'Cardholder'}</p>
              <p className="text-gray-400 text-xs font-mono">•••• •••• •••• {card.last4}</p>
              <p className="text-gray-500 text-[10px] mt-0.5">{card.card_brand || 'Mastercard'} · {card.status || 'active'}</p>
            </div>
            <div className="text-right">
              <p className="text-orange-400 font-bold">{ngn(card.balance)}</p>
              <p className="text-gray-500 text-[10px]">Balance</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setShowFund(card)}
              className="py-2 px-3 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg"
            >
              <DollarSign className="w-3.5 h-3.5 inline mr-1" /> Fund
            </button>
            <button
              onClick={() => freezeCard(card, card.status !== 'frozen')}
              disabled={busy}
              className="py-2 px-3 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
            >
              <Snowflake className="w-3.5 h-3.5 inline mr-1" /> {card.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
            </button>
            <button
              onClick={() => deleteCard(card)}
              disabled={busy}
              className="py-2 px-3 bg-gray-800 hover:bg-red-900 text-red-400 text-xs font-semibold rounded-lg disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Delete
            </button>
          </div>
        </div>
      ))}

      <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          ⚠️ Load only the exact amount you want to spend. Kripicard charges a $1 + 4% top-up fee and a $1.50 monthly fee. Loading $100 costs $4 in fees — you get $96 to spend.
        </p>
      </div>

      {/* CREATE MODAL */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Create USD Card</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Card Type</label>
                <select
                  value={form.bin}
                  onChange={(e) => setForm({ ...form, bin: e.target.value })}
                  className="w-full bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm"
                >
                  <option value="49387519">US Mastercard (recommended)</option>
                  <option value="441357">US Visa</option>
                  <option value="49387520">US Mastercard 2</option>
                </select>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">Cardholder Name</label>
                <input
                  type="text"
                  value={form.name_on_card}
                  onChange={(e) => setForm({ ...form, name_on_card: e.target.value })}
                  placeholder="John Alex"
                  className="w-full bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none"
                />
              </div>

              {form.bin === '537872' && (
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Date of Birth (required for US cards)</label>
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                    className="w-full bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none"
                  />
                </div>
              )}

              <div>
                <label className="text-gray-400 text-xs block mb-1">Initial Load (USD, min $10)</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none"
                />
                <p className="text-[10px] text-gray-500 mt-1">Fee: $1 + 4% will be added</p>
              </div>

              <button
                onClick={createCard}
                disabled={busy}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 text-white font-bold rounded-lg text-sm"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Create Card · $${form.amount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FUND MODAL */}
      {showFund && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Fund Card •••• {showFund.last4}</h3>
              <button onClick={() => setShowFund(null)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Amount (USD, min $10)</label>
                <input
                  type="number"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className="w-full bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm outline-none"
                />
                <p className="text-[10px] text-gray-500 mt-1">Fee: $1 + 4% = ${(Number(fundAmount) * 0.04 + 1).toFixed(2)}</p>
              </div>

              <button
                onClick={fundCard}
                disabled={busy}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 text-white font-bold rounded-lg text-sm"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Fund $${fundAmount}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
