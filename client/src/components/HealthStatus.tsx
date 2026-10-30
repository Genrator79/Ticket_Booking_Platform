import { useEffect, useState, useCallback } from 'react';
import { healthService } from '../services/healthService';
import type { HealthCheckData } from '../types/api';

export function HealthStatus() {
  const [health, setHealth] = useState<HealthCheckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const data = await healthService.checkHealth();
      const end = performance.now();
      setLatency(Math.round(end - start));
      setHealth(data);
      setLastChecked(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reach API server');
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return (
    <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl shadow-2xl transition-all">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
        <div className="flex items-center space-x-3">
          <div className="relative flex h-3.5 w-3.5">
            {loading ? (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            ) : health ? (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            ) : (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                loading
                  ? 'bg-amber-500'
                  : health
                  ? 'bg-emerald-500'
                  : 'bg-rose-500'
              }`}
            ></span>
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-lg">Backend API Health</h3>
            <p className="text-xs text-slate-400">Endpoint: GET /api/health</p>
          </div>
        </div>

        <button
          onClick={fetchHealth}
          disabled={loading}
          className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white transition-colors duration-150 flex items-center space-x-2"
        >
          <span>{loading ? 'Probing...' : 'Refresh'}</span>
        </button>
      </div>

      {loading && !health && (
        <div className="py-8 text-center text-slate-400 text-sm animate-pulse">
          Connecting to Express API server...
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-sm mb-2">
          <div className="font-semibold mb-1 flex items-center gap-2">
            <span>Connection Failure</span>
          </div>
          <p className="text-xs text-rose-200/80">{error}</p>
        </div>
      )}

      {health && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-left">
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Status
            </span>
            <span className="text-base font-semibold text-emerald-400">
              {health.status}
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Latency
            </span>
            <span className="text-base font-semibold text-slate-100">
              {latency !== null ? `${latency} ms` : 'N/A'}
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Uptime
            </span>
            <span className="text-base font-semibold text-slate-100">
              {health.uptime}s
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Environment
            </span>
            <span className="text-base font-semibold text-indigo-300">
              {health.environment}
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              RSS Memory
            </span>
            <span className="text-base font-semibold text-slate-100">
              {health.memoryUsage.rss}
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Database
            </span>
            <span className={`text-base font-semibold ${health.database === 'CONNECTED' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {health.database || 'UNKNOWN'}
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Redis
            </span>
            <span className={`text-base font-semibold ${health.redis === 'CONNECTED' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {health.redis || 'UNKNOWN'}
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Heap Used
            </span>
            <span className="text-base font-semibold text-slate-100">
              {health.memoryUsage.heapUsed}
            </span>
          </div>
        </div>
      )}

      {lastChecked && (
        <div className="mt-4 pt-3 border-t border-slate-800/60 text-right">
          <span className="text-[11px] text-slate-400">
            Last probe: {lastChecked.toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}
