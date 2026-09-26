import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/api/base44Client';
import { Loader2, RefreshCw, Volume2, VolumeX, TrendingUp, TrendingDown, Target, Shield, Clock, Activity } from 'lucide-react';

export default function FxBeast() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [stats, setStats] = useState({ total: 0, won: 0, lost: 0, pending: 0, winRate: 0 });
  const [lastScan, setLastScan] = useState(null);
  const seenIdsRef = useRef(new Set());

  const playAlert = () => {
    if (!soundOn) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, now + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.4);
      });
    } catch (_) {}
  };

  const loadSignals = async () => {
    const { data } = await supabase
      .from('fx_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    const list = data || [];
    let hasNew = false;
    for (const s of list) {
      if (s.status === 'pending' && !seenIdsRef.current.has(s.id)) {
        seenIdsRef.current.add(s.id);
        hasNew = true;
      }
    }
    if (hasNew && seenIdsRef.current.size > 1) playAlert();
    setSignals(list);
    const won = list.filter(s => s.outcome === 'won').length;
    const lost = list.filter(s => s.outcome === 'lost').length;
    const pending = list.filter(s => s.status === 'pending').length;
    const closed = won + lost;
    setStats({
      total: list.length, won, lost, pending,
      winRate: closed > 0 ? Math.round(won / closed * 100) : 0,
    });
    setLoading(false);
  };

  const runScan = async () => {
    setScanning(true);
    try {
      await supabase.functions.invoke('fx-signals', { body: {} });
      await loadSignals();
      setLastScan(new Date().toLocaleTimeString());
    } catch (_) {}
    setScanning(false);
  };

  useEffect(() => {
    loadSignals();
    const t = setInterval(loadSignals, 30000);
    return () => clearInterval(t);
  }, []);

  const fmt = (n, pair) => Number(n).toFixed(pair?.includes('JPY') ? 3 : 5);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5 text-white">
      <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-transparent p-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-orange-500" />
            <h1 className="text-2xl font-extrabold">FX Beast</h1>
          </div>
          <button onClick={() => setSoundOn(s => !s)} className="p-2 rounded-lg bg-secondary hover:bg-secondary/80">
            {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Auto-scans 26 pairs · Only fires signals with 82%+ confidence
        </p>
        <button onClick={runScan} disabled={scanning}
          className="w-full mt-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 font-bold text-sm">
          {scanning ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <><RefreshCw className="w-4 h-4 inline mr-1.5" /> Scan Now</>}
        </button>
        {lastScan && <p className="text-[11px] text-muted-foreground mt-2 text-center">Last scan: {lastScan}</p>}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-xl bg-secondary/40 p-3 text-center">
          <p className="text-[11px] text-muted-foreground">Total</p>
          <p className="text-xl font-bold">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-secondary/40 p-3 text-center">
          <p className="text-[11px] text-muted-foreground">Pending</p>
          <p className="text-xl font-bold text-amber-400">{stats.pending}</p>
        </div>
        <div className="rounded-xl bg-secondary/40 p-3 text-center">
          <p className="text-[11px] text-muted-foreground">Won</p>
          <p className="text-xl font-bold text-emerald-400">{stats.won}</p>
        </div>
        <div className="rounded-xl bg-secondary/40 p-3 text-center">
          <p className="text-[11px] text-muted-foreground">Win %</p>
          <p className="text-xl font-bold text-orange-400">{stats.winRate}%</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
      ) : signals.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Target className="w-10 h-10 text-orange-500 mx-auto mb-3" />
          <p className="font-bold">No signals yet</p>
          <p className="text-sm text-muted-foreground mt-1">Tap Scan Now to check the 26 pairs</p>
        </div>
      ) : (
        <div className="space-y-3">
          {signals.map(s => {
            const isBuy = s.direction === 'BUY';
            return (
              <div key={s.id} className={`rounded-2xl border p-4 ${isBuy ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {isBuy ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
                    <span className="font-bold text-lg">{s.pair}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isBuy ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                      {s.direction}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Confidence</p>
                    <p className="font-bold text-orange-400">{s.confidence}%</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                  <div className="rounded-lg bg-secondary/60 p-2">
                    <p className="text-[10px] text-muted-foreground">Entry</p>
                    <p className="font-mono font-bold">{fmt(s.entry, s.pair)}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/60 p-2">
                    <p className="text-[10px] text-muted-foreground">Stop</p>
                    <p className="font-mono font-bold text-red-400">{fmt(s.stop_loss, s.pair)}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/60 p-2">
                    <p className="text-[10px] text-muted-foreground">Target</p>
                    <p className="font-mono font-bold text-emerald-400">{fmt(s.take_profit, s.pair)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{s.signal_type}</span><span>·</span><span>{s.timeframe}</span><span>·</span>
                  <span>{new Date(s.created_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2 italic">{s.reason}</p>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground text-center pt-4">
        Signals are probabilities, not guarantees. Risk 1% per trade. Never risk money you cannot afford to lose.
      </p>
    </div>
  );
}
