import { useEffect, useMemo, useState } from 'react';
import {
  inferBaseUrl,
  normalizeBaseUrl,
  setActiveRuntimeBaseUrl,
  setStoredRuntimeBaseUrl,
} from '@mediagrid/api';
import { client } from '../../services/runtime';
import { useAppStore } from '../../store/useAppStore';
import { RefreshCw, Server, Shield, TriangleAlert, Wifi } from 'lucide-react';

type DeviceRecord = {
  id: string;
  userId: string;
  name: string;
  platform: string;
  trusted: boolean;
  lastConnected: string;
};

type SessionRecord = {
  id: string;
  userId: string;
  deviceId: string;
  token: string;
  expiresAt: string;
};

type RemoteRuntimeInfo = {
  tailscale?: { isConnected?: boolean; ip?: string; hostname?: string };
  activeSessionsCount?: number;
  registeredDevicesCount?: number;
  isRemoteAccessEnabled?: boolean;
};

const sessionIsActive = (session?: SessionRecord | null) => {
  if (!session) return false;
  const expires = new Date(session.expiresAt).getTime();
  return Number.isFinite(expires) && expires > Date.now();
};

export function DevicesDashboard() {
  const connectionState = useAppStore((state) => state.connectionState);
  const health = useAppStore((state) => state.health);
  const runtime = useAppStore((state) => state.runtime);

  const [endpoint, setEndpoint] = useState(() => inferBaseUrl());
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [remoteRuntime, setRemoteRuntime] = useState<RemoteRuntimeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const [deviceList, sessionList, runtimeInfo] = await Promise.all([
        client.getDevices(),
        client.getRemoteSessions(),
        client.getRemoteRuntime(),
      ]);

      setDevices(deviceList ?? []);
      setSessions(sessionList ?? []);
      setRemoteRuntime(runtimeInfo ?? null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const activeSessionDeviceIds = useMemo(() => {
    return new Set(sessions.filter(sessionIsActive).map((session) => session.deviceId));
  }, [sessions]);

  const savedBaseUrl = inferBaseUrl();
  const isLocalFallback = savedBaseUrl.includes('127.0.0.1') || savedBaseUrl.includes('localhost');

  const handleSaveEndpoint = () => {
    const normalized = normalizeBaseUrl(endpoint);
    setActiveRuntimeBaseUrl(normalized);
    setStoredRuntimeBaseUrl(normalized);
    window.location.reload();
  };

  return (
    <div className="grid gap-5">
      <section className="panel border-sky-500/15 bg-slate-950/40">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="eyebrow text-xs text-slate-400 uppercase">Tailnet endpoint</p>
            <h3 className="text-lg font-bold text-white mt-1">Runtime communication URL</h3>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Store the Tailscale IP or hostname here. After saving, every runtime request and websocket connection will use this endpoint.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold font-mono tracking-wide text-slate-300 hover:text-white transition active:scale-95 disabled:opacity-50"
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleSaveEndpoint}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold font-mono tracking-wide transition shadow shadow-sky-500/15 active:scale-95"
            >
              <Shield size={13} />
              Save IP
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">Base URL</span>
            <input
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="100.x.x.x:3001"
              className="w-full rounded-2xl bg-slate-950/80 border border-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-sky-500/50"
            />
          </label>

          {isLocalFallback ? (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-amber-200 text-sm">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <span>Localhost is still configured. Replace it with the Tailscale IP before using the connected runtime.</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <article className="panel">
          <p className="eyebrow text-xs text-slate-400 uppercase">Connection</p>
          <div className="mt-2 flex items-center gap-2 text-white font-semibold">
            <Wifi size={16} className={connectionState === 'connected' ? 'text-emerald-400' : 'text-amber-400'} />
            {connectionState}
          </div>
          <p className="text-xs text-slate-500 mt-1">{savedBaseUrl}</p>
        </article>

        <article className="panel">
          <p className="eyebrow text-xs text-slate-400 uppercase">Devices</p>
          <div className="mt-2 text-2xl font-black text-white">{devices.length}</div>
          <p className="text-xs text-slate-500 mt-1">Registered devices</p>
        </article>

        <article className="panel">
          <p className="eyebrow text-xs text-slate-400 uppercase">Active</p>
          <div className="mt-2 text-2xl font-black text-emerald-400">
            {devices.filter((device) => activeSessionDeviceIds.has(device.id)).length}
          </div>
          <p className="text-xs text-slate-500 mt-1">Devices with live sessions</p>
        </article>

        <article className="panel">
          <p className="eyebrow text-xs text-slate-400 uppercase">Tailnet</p>
          <div className="mt-2 flex items-center gap-2 text-white font-semibold">
            <Server size={16} className={remoteRuntime?.isRemoteAccessEnabled ? 'text-sky-400' : 'text-rose-400'} />
            {remoteRuntime?.isRemoteAccessEnabled ? 'Enabled' : 'Offline'}
          </div>
          <p className="text-xs text-slate-500 mt-1">{remoteRuntime?.tailscale?.ip ?? 'Waiting for status'}</p>
        </article>
      </section>

      <section className="panel">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-white">Trusted and active devices</h3>
            <p className="text-xs text-slate-500 mt-1">Active means the device still has a valid runtime session; idle sessions expire after one hour.</p>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
            {health?.runtimeStatus ?? 'offline'} / {runtime?.runtimeVersion ?? '0.1.0'}
          </span>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-rose-200 text-sm">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3">
          {devices.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/60 bg-slate-950/40 px-4 py-6 text-sm text-slate-400">
              No devices are registered yet.
            </div>
          ) : (
            devices.map((device) => {
              const active = activeSessionDeviceIds.has(device.id);
              const session = sessions.find((item) => item.deviceId === device.id && sessionIsActive(item));

              return (
                <article key={device.id} className="rounded-2xl border border-slate-800/60 bg-slate-950/40 px-4 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-white font-semibold">{device.name}</h4>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${active ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
                        {active ? 'active' : 'inactive'}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${device.trusted ? 'border-sky-500/20 bg-sky-500/10 text-sky-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>
                        {device.trusted ? 'trusted' : 'pending'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono break-all">{device.id}</p>
                    <p className="text-xs text-slate-400">{device.platform}</p>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="block text-slate-500 uppercase tracking-widest font-mono">Last connected</span>
                      <span className="block text-slate-300 mt-1">{device.lastConnected ? new Date(device.lastConnected).toLocaleString() : 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="block text-slate-500 uppercase tracking-widest font-mono">Session</span>
                      <span className="block text-slate-300 mt-1">{session ? new Date(session.expiresAt).toLocaleTimeString() : 'Expired'}</span>
                    </div>
                    <div>
                      <span className="block text-slate-500 uppercase tracking-widest font-mono">Access</span>
                      <span className="block text-slate-300 mt-1">{active ? 'Connected' : 'Idle'}</span>
                    </div>
                    <div>
                      <span className="block text-slate-500 uppercase tracking-widest font-mono">Mode</span>
                      <span className="block text-slate-300 mt-1">{device.platform}</span>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}