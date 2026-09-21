import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { describeAuthError, useAuth } from './AuthContext';

export function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('demo@pulseboard.dev');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === 'login' ? login(email, password) : register(email, password));
    } catch (caught) {
      setError(describeAuthError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-surface-700 bg-surface-900 p-8 shadow-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white">PulseBoard</h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === 'login' ? 'Sign in to watch the stream.' : 'Create an account to get started.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-white outline-none focus:border-metric-revenue"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Password
            </span>
            <input
              type="password"
              required
              minLength={mode === 'register' ? 8 : 1}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-white outline-none focus:border-metric-revenue"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-metric-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-metric-revenue px-3 py-2 text-sm font-semibold text-surface-950 transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          className="mt-4 w-full text-center text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
        >
          {mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
        </button>

        <p className="mt-6 text-center text-xs text-slate-500">
          Seeded demo account: demo@pulseboard.dev / demo1234
        </p>
      </div>
    </div>
  );
}
