import React, { useEffect, useState } from 'react';
import { buildRuntimeUrl } from '@mediagrid/api';
import {
  Activity,
  Cpu,
  Layers,
  Wifi,
  Clock,
  RefreshCw,
  Server,
  Database,
  Tv,
  Film,
} from 'lucide-react';

interface StatsData {
  uptimeSeconds: number;
  activeJobs: number;
  scanProgress: number;
  indexingProgress: number;
  websocketConnections: number;
  apiRequests: number;
  indexedMediaCount: number;
  categoryCounts: Record<string, number>;
  activeSessions: number;
  bandwidth: {
    activeStreams: number;
    totalBitrateBps: number;
    currentEgressBps: number;
  };
}

interface TranscodingJob {
  id: string;
  mediaId: string;
  status: string;
  quality: string;
  createdAt: string;
}

export const StreamingDashboard: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [jobs, setJobs] = useState<TranscodingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    const token = localStorage.getItem('mediagrid_token');
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const [statsRes, jobsRes] = await Promise.all([
        fetch(buildRuntimeUrl('/stats'), { headers: authHeaders }).then((r) => r.json()),
        fetch(buildRuntimeUrl('/jobs'), { headers: authHeaders }).then((r) => r.json()),
      ]);
      setStats(statsRes);
      setJobs(jobsRes.jobs || []);
    } catch (err) {
      console.error('Failed to fetch dashboard metrics', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const triggerRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatBandwidth = (bps?: number) => {
    if (bps === undefined) return '0.00 Mbps';
    const mbps = bps / 1_000_000;
    return `${mbps.toFixed(2)} Mbps`;
  };

  const formatUptime = (secs?: number) => {
    if (!secs) return '0s';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <RefreshCw size={36} className="animate-spin text-sky-400 mb-4" />
        <h4 className="text-base font-semibold text-white">Loading Admin Monitor...</h4>
        <p className="text-xs text-slate-500 mt-1">Requesting active transcoder jobs and stats</p>
      </div>
    );
  }

  const activeJobCount = jobs.filter((j) => j.status === 'processing' || j.status === 'pending').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header controls */}
      <div className="flex justify-between items-center border-b border-slate-900 pb-4">
        <div>
          <p className="eyebrow text-xs text-slate-400 uppercase font-mono tracking-widest">ADMIN PORTAL</p>
          <h3 className="text-2xl font-extrabold text-white mt-1">Streaming Monitor</h3>
        </div>
        <button
          onClick={triggerRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold font-mono tracking-wide text-slate-300 hover:text-white transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'REFRESHING...' : 'REFRESH METRICS'}
        </button>
      </div>

      {/* Grid Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Active Streams */}
        <article className="panel flex flex-col justify-between p-5 bg-slate-950/20 border-slate-800/40">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-xs text-slate-500 uppercase font-mono tracking-wider">Active Streams</p>
              <h4 className="text-3xl font-extrabold text-white mt-2">
                {stats?.activeSessions ?? 0}
              </h4>
            </div>
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
              <Wifi size={20} />
            </div>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-4">
            Active streaming connection handles
          </div>
        </article>

        {/* Egress Bandwidth */}
        <article className="panel flex flex-col justify-between p-5 bg-slate-950/20 border-slate-800/40">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-xs text-slate-500 uppercase font-mono tracking-wider">Egress Rate</p>
              <h4 className="text-2xl font-extrabold text-white mt-2.5">
                {formatBandwidth(stats?.bandwidth?.currentEgressBps)}
              </h4>
            </div>
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
              <Activity size={20} />
            </div>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-4">
            Total adaptive stream outbound rate
          </div>
        </article>

        {/* Transcoding Queue */}
        <article className="panel flex flex-col justify-between p-5 bg-slate-950/20 border-slate-800/40">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-xs text-slate-500 uppercase font-mono tracking-wider">Active Jobs</p>
              <h4 className="text-3xl font-extrabold text-white mt-2">
                {activeJobCount}
              </h4>
            </div>
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
              <Cpu size={20} />
            </div>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-4">
            FFmpeg backend scale/copy routines
          </div>
        </article>

        {/* Uptime */}
        <article className="panel flex flex-col justify-between p-5 bg-slate-950/20 border-slate-800/40">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-xs text-slate-500 uppercase font-mono tracking-wider">Uptime</p>
              <h4 className="text-lg font-bold text-white mt-4">
                {formatUptime(stats?.uptimeSeconds)}
              </h4>
            </div>
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
              <Clock size={20} />
            </div>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-4">
            MediaGrid runtime process lifetime
          </div>
        </article>
      </div>

      {/* Main Stats sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Transcoding Queue Details */}
        <div className="lg:col-span-2 space-y-6">
          <section className="panel bg-slate-950/20 border-slate-800/40 p-5">
            <div className="panel-header mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers size={18} className="text-slate-400" />
                Transcoding Jobs Queue
              </h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                {jobs.length} total
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">Job ID</th>
                    <th className="py-2.5 px-3">Media Item</th>
                    <th className="py-2.5 px-3">Quality</th>
                    <th className="py-2.5 px-3">Created</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/50">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-900/20 transition-colors">
                      <td className="py-3 px-3 font-mono text-slate-400 font-semibold" title={job.id}>
                        {job.id.slice(0, 8)}...
                      </td>
                      <td className="py-3 px-3 text-white font-semibold truncate max-w-[180px]" title={job.mediaId}>
                        {job.mediaId}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {job.quality}
                      </td>
                      <td className="py-3 px-3 text-slate-400 font-mono text-[10px]">
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold font-mono uppercase border ${
                          job.status === 'completed'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : job.status === 'processing'
                            ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 animate-pulse'
                            : job.status === 'pending'
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        }`}>
                          {job.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {jobs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 font-mono">
                        No transcoding jobs found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right 1 Column: Additional Info and System stats */}
        <div className="space-y-6">
          <section className="panel bg-slate-950/20 border-slate-800/40 p-5">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Server size={18} className="text-slate-400" />
              Runtime Stats
            </h3>
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-900/60">
                <span className="text-slate-400">Total Indexed Items</span>
                <span className="text-white font-semibold">{stats?.indexedMediaCount ?? 0}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-900/60">
                <span className="text-slate-400">Active WS Clients</span>
                <span className="text-emerald-400 font-bold">{stats?.websocketConnections ?? 0}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-900/60">
                <span className="text-slate-400">API Handshakes</span>
                <span className="text-white font-mono">{stats?.apiRequests ?? 0}</span>
              </div>
            </div>
          </section>

          <section className="panel bg-slate-950/20 border-slate-800/40 p-5">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Database size={18} className="text-slate-400" />
              Library Allocations
            </h3>
            <div className="space-y-3 text-xs">
              {stats?.categoryCounts && Object.entries(stats.categoryCounts).map(([cat, count]) => (
                <div key={cat} className="flex justify-between items-center py-1">
                  <span className="text-slate-400 capitalize flex items-center gap-2">
                    {cat === 'movies' ? <Film size={12} className="text-slate-400" /> : <Tv size={12} className="text-slate-400" />}
                    {cat}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-bold font-mono text-slate-300">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
