import { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import type { User } from '../types/auth';

export function AuthCard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Check existing session on load
  useEffect(() => {
    const token = authService.getToken();
    if (token) {
      authService
        .getMe()
        .then((user) => {
          setCurrentUser(user);
        })
        .catch(() => {
          authService.logout();
          setCurrentUser(null);
        });
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await authService.login({ email, password });
      setCurrentUser(res.user);
      setSuccessMsg(`Welcome back, ${res.user.name}!`);
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await authService.register({ name, email, password });
      setCurrentUser(res.user);
      setSuccessMsg(`Account created successfully! Welcome, ${res.user.name}.`);
      setName('');
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySession = async () => {
    setVerifying(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const user = await authService.getMe();
      setCurrentUser(user);
      setSuccessMsg(`JWT Verified live via GET /api/auth/me at ${new Date().toLocaleTimeString()}`);
    } catch (err: any) {
      setError(err.message || 'Session verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setSuccessMsg('Logged out successfully.');
    setError(null);
  };

  const fillDemoCredentials = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setActiveTab('login');
  };

  return (
    <div className="w-full max-w-xl p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-lg">
            🔐
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-base">Authentication & Authorization</h3>
            <p className="text-xs text-slate-400">JWT Bearer tokens & bcrypt hashing (M03)</p>
          </div>
        </div>

        <span
          className={`px-2.5 py-1 text-[11px] font-medium rounded-full border ${
            currentUser
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50'
              : 'bg-slate-800/60 text-slate-400 border-slate-700/50'
          }`}
        >
          {currentUser ? 'AUTHENTICATED' : 'ANONYMOUS'}
        </span>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 text-sm ml-2"
          >
            ×
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs flex items-center justify-between">
          <span>✓ {successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-200 text-sm ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Authenticated View */}
      {currentUser ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Name</span>
              <span className="text-xs font-semibold text-slate-200">{currentUser.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Email</span>
              <span className="text-xs font-mono text-indigo-300">{currentUser.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Role</span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  currentUser.role === 'admin'
                    ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                    : 'bg-indigo-950 text-indigo-300 border border-indigo-800/60'
                }`}
              >
                {currentUser.role}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">User ID</span>
              <span className="text-[11px] font-mono text-slate-400 truncate max-w-[220px]">
                {currentUser.id}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleVerifySession}
              disabled={verifying}
              className="flex-1 py-2 px-4 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
            >
              {verifying ? 'Verifying...' : 'Probe Protected /api/auth/me'}
            </button>
            <button
              onClick={handleLogout}
              className="py-2 px-4 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700/60"
            >
              Logout
            </button>
          </div>
        </div>
      ) : (
        /* Unauthenticated Login / Register Form */
        <div>
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/60 rounded-xl mb-6 border border-slate-800/80">
            <button
              onClick={() => {
                setActiveTab('login');
                setError(null);
              }}
              className={`py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'login'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => {
                setActiveTab('register');
                setError(null);
              }}
              className={`py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === 'register'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={activeTab === 'login' ? handleLogin : handleRegister} className="space-y-4">
            {activeTab === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alice Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                required
                placeholder={activeTab === 'register' ? 'At least 8 characters' : 'Enter password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-600/25 disabled:opacity-50 mt-2"
            >
              {loading
                ? 'Processing...'
                : activeTab === 'login'
                ? 'Log In to Account'
                : 'Create Account'}
            </button>
          </form>

          {/* Quick Demo Pre-fill */}
          <div className="mt-6 pt-4 border-t border-slate-800/60">
            <p className="text-[11px] text-slate-400 mb-2">Quick Demo Pre-fills (Seeded users, pass: password123):</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fillDemoCredentials('john@example.com')}
                className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
              >
                Customer (john@example.com)
              </button>
              <button
                type="button"
                onClick={() => fillDemoCredentials('admin@example.com')}
                className="px-2.5 py-1 text-[11px] rounded-lg bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 border border-purple-800/60 transition-colors"
              >
                Admin (admin@example.com)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
