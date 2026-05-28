import { useState, useEffect } from 'react';
import { inferBaseUrl, normalizeBaseUrl, setActiveRuntimeBaseUrl, setStoredRuntimeBaseUrl } from '@mediagrid/api';
import { client, ensureRuntimeEndpoint, resetRuntimeEndpoint } from '../../services/runtime';
import { useAppStore } from '../../store/useAppStore';
import { Eye, EyeOff, Loader2, Globe, User, Lock, ShieldCheck, Zap, HardDrive } from 'lucide-react';

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
  const [isEndpointValid, setIsEndpointValid] = useState<'checking' | 'valid' | 'invalid'>('checking');

  const handleEndpointChange = (val: string) => {
    setRuntimeEndpoint(val);
    setIsEndpointValid('checking');
    resetRuntimeEndpoint();
  };

  useEffect(() => {
    let active = true;
    const checkInitial = async () => {
      const normalized = normalizeBaseUrl(runtimeEndpoint);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${normalized}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok && active) {
          setIsEndpointValid('valid');
        } else if (active) {
          setIsEndpointValid('invalid');
        }
      } catch {
        if (active) setIsEndpointValid('invalid');
      }
    };
    checkInitial();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!runtimeEndpoint.trim()) {
      setIsEndpointValid('invalid');
      return;
    }

    const timer = setTimeout(async () => {
      const normalized = normalizeBaseUrl(runtimeEndpoint);
      
      setActiveRuntimeBaseUrl(normalized);
      setStoredRuntimeBaseUrl(normalized);
      client.setBaseUrl(normalized);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${normalized}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          setIsEndpointValid('valid');
        } else {
          setIsEndpointValid('invalid');
        }
      } catch {
        setIsEndpointValid('invalid');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [runtimeEndpoint]);

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
      <div className="login-grid-bg" />
      <div className="login-bg-glow" />

      <div className="login-details-panel">
        <div className="login-details-content">
          <div className="login-details-brand">
            <img src="/logo.svg" alt="MediaGrid Logo" className="login-details-logo" />
            <h1 className="login-details-title">MediaGrid</h1>
          </div>
          <p className="login-details-tagline">Runtime-First Media Delivery Platform</p>
          <p className="login-details-description">
            Connect to your self-hosted high-performance storage node, streaming engine, and private tailnet.
          </p>
          
          <div className="login-details-features">
            <div className="feature-item">
              <span className="feature-icon-wrapper">
                <ShieldCheck size={20} className="text-sky-400" />
              </span>
              <div>
                <strong>Secure Transport</strong>
                <p>Protected by end-to-end encrypted Tailscale tunnels directly to your host.</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon-wrapper">
                <Zap size={20} className="text-amber-400" />
              </span>
              <div>
                <strong>Direct Streaming</strong>
                <p>Direct device-to-device transport without cloud mediation or surveillance.</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon-wrapper">
                <HardDrive size={20} className="text-emerald-400" />
              </span>
              <div>
                <strong>Self-Hosted Drive</strong>
                <p>Access movies, music, photos, and files securely from anywhere in the world.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-form-container">
          
          <div className="login-mobile-brand">
            <img src="/logo.svg" alt="MediaGrid Logo" className="login-mobile-logo" />
            <h1 className="login-title">MediaGrid</h1>
            <p className="login-subtitle">Runtime Authentication</p>
          </div>

          <div className="login-pc-brand">
            <h2 className="login-form-heading">Welcome Back</h2>
            <p className="login-form-subheading ">Sign in to control and stream from your node</p>
          </div>


          <div className="login-field mb-2">
            <label htmlFor="runtime-endpoint" className="login-label">
              Runtime IP / hostname
            </label>
            <div className="login-input-wrapper">
              <Globe size={16} className="login-input-icon-left" />
              <input
                id="runtime-endpoint"
                type="text"
                value={runtimeEndpoint}
                onChange={(event) => handleEndpointChange(event.target.value)}
                className="login-input login-input--with-icon-left font-mono text-xs pr-10"
                placeholder="100.x.x.x:3001"
                disabled={isLoading}
              />
              <span className={`endpoint-signal-dot absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-all duration-300 ${
                isEndpointValid === 'checking' 
                  ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                  : isEndpointValid === 'valid'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                  : 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]'
              }`} 
              title={
                isEndpointValid === 'checking'
                  ? 'Checking host availability...'
                  : isEndpointValid === 'valid'
                  ? 'Host is online and valid'
                  : 'Host is offline or invalid URL'
              }
              />
            </div>
          </div>

          <div className="login-divider" />

          <form onSubmit={handleSubmit} className="login-form" id="login-form">
            <div className="login-field">
              <label htmlFor="login-username" className="login-label">
                Username
              </label>
              <div className="login-input-wrapper">
                <User size={16} className="login-input-icon-left" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="login-input login-input--with-icon-left"
                  placeholder="admin"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="login-password" className="login-label">
                Password
              </label>
              <div className="login-input-wrapper">
                <Lock size={16} className="login-input-icon-left" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input login-input--password login-input--with-icon-left"
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

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              id="login-submit"
              className="login-btn"
              disabled={isLoading || !username.trim() || !password.trim() || isEndpointValid !== 'valid'}
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

          <p className="login-footer">
            First-time login? Enter any credentials to create the admin account.
          </p>
        </div>
      </div>
    </div>
  );
}
