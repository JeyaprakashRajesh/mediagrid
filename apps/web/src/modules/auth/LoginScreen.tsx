import { useState } from 'react';
import { inferBaseUrl, normalizeBaseUrl, setActiveRuntimeBaseUrl, setStoredRuntimeBaseUrl } from '@mediagrid/api';
import { client, ensureRuntimeEndpoint } from '../../services/runtime';
import { useAppStore } from '../../store/useAppStore';
import { Shield, Eye, EyeOff, Loader2, Zap } from 'lucide-react';

interface LoginScreenProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const { setAuth } = useAppStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeEndpoint, setRuntimeEndpoint] = useState(() => inferBaseUrl());

  const handleSaveEndpoint = () => {
    const normalized = normalizeBaseUrl(runtimeEndpoint);
    setActiveRuntimeBaseUrl(normalized);
    setStoredRuntimeBaseUrl(normalized);
    window.location.reload();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      await ensureRuntimeEndpoint();
      const data = await client.login({
        username: username.trim(),
        password,
        deviceName: 'Web Browser',
        platform: 'Web',
      });

      if (!data?.token) {
        throw new Error('No token received from server');
      }

      setAuth(data.token, data.user ?? null, data.device ?? null);
      onLogin();
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('credentials')) {
        setError('Invalid username or password.');
      } else if (msg.includes('429') || msg.includes('rate')) {
        setError('Too many login attempts. Please wait a moment.');
      } else {
        setError('Failed to connect to the runtime server. Please ensure it is running.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-screen">
      {/* Ambient background glow */}
      <div className="login-bg-glow" />

      <div className="login-card">
        {/* Logo / Brand area */}
        <div className="login-brand">
          <div className="login-icon-ring">
            <Zap size={26} className="text-sky-300" />
          </div>
          <h1 className="login-title">MediaGrid</h1>
          <p className="login-subtitle">Runtime Authentication</p>
        </div>

        {/* Security notice */}
        <div className="login-notice">
          <Shield size={13} className="text-sky-400 shrink-0 mt-px" />
          <span>Secure connection to the Tailscale runtime endpoint</span>
        </div>

        <div className="login-field">
          <label htmlFor="runtime-endpoint" className="login-label">
            Runtime IP / hostname
          </label>
          <div className="flex gap-2">
            <input
              id="runtime-endpoint"
              type="text"
              value={runtimeEndpoint}
              onChange={(event) => setRuntimeEndpoint(event.target.value)}
              className="login-input flex-1"
              placeholder="100.x.x.x:3001"
              disabled={isLoading}
            />
            <button
              type="button"
              className="px-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 hover:bg-slate-800 transition"
              onClick={handleSaveEndpoint}
              disabled={isLoading || !runtimeEndpoint.trim()}
            >
              Save
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Store the Tailscale IP here once, then all runtime requests use that address.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form" id="login-form">
          <div className="login-field">
            <label htmlFor="login-username" className="login-label">
              Username
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="login-input"
              placeholder="admin"
              disabled={isLoading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password" className="login-label">
              Password
            </label>
            <div className="login-input-wrapper">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input login-input--password"
                placeholder="••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowPassword((p) => !p)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff size={15} className="text-slate-400" />
                ) : (
                  <Eye size={15} className="text-slate-400" />
                )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            id="login-submit"
            className="login-btn"
            disabled={isLoading || !username.trim() || !password.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Authenticating…
              </>
            ) : (
              'Sign in to Runtime'
            )}
          </button>
        </form>

        {/* Footer hint */}
        <p className="login-footer">
          First-time login? Enter any credentials to create the admin account.
        </p>
      </div>
    </div>
  );
}
