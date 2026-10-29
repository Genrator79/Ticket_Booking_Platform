import { HealthStatus } from './components/HealthStatus';
import { AuthCard } from './components/AuthCard';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-400 flex items-center justify-center font-bold text-lg shadow-lg shadow-indigo-500/25">
              🎟️
            </div>
            <div>
              <span className="font-bold text-base tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                SeatForge
              </span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                M03 Authentication
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-xs text-slate-400">
            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700/50">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              JWT & DB Active
            </span>
            <span className="font-mono text-slate-400">v1.0.0</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col items-center">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/70 border border-indigo-800/60 text-xs font-medium text-indigo-300 mb-6">
            <span>High-Concurrency Architecture</span>
            <span className="text-slate-600">•</span>
            <span>Zero Double Booking</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            High-Concurrency <br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400 bg-clip-text text-transparent">
              Ticket Booking Platform
            </span>
          </h1>
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            A production-grade distributed booking engine engineered to withstand 10,000+ simultaneous requests per second with strict transactional consistency and real-time state synchronization.
          </p>
        </div>

        {/* Live Backend Communication & Auth Verification */}
        <section className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mb-12">
          <HealthStatus />
          <AuthCard />
        </section>

        {/* Architectural Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-800/50 flex items-center justify-center text-xl mb-4">
              🛡️
            </div>
            <h2 className="text-base font-semibold text-slate-100 mb-2">Transactional Consistency</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              PostgreSQL row-level locking (<code className="text-indigo-300">FOR UPDATE</code>) with composite show-seat constraints to physically prevent double-booking.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-violet-950/80 border border-violet-800/50 flex items-center justify-center text-xl mb-4">
              ⚡
            </div>
            <h2 className="text-base font-semibold text-slate-100 mb-2">Atomic Temporary Holds</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Redis atomic conditional keys with strict TTLs power 10-minute hold reservation windows without holding long-lived DB transactions.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-xl mb-4">
              🔄
            </div>
            <h2 className="text-base font-semibold text-slate-100 mb-2">Real-Time Sync & Queue</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Socket.IO show-specific broadcast rooms for instant seat layout updates coupled with BullMQ background worker reliability.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-400">
        <p>Built for SDE System Design & High-Concurrency Pair Programming • M01 Ready</p>
      </footer>
    </div>
  );
}
