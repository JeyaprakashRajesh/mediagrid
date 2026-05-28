import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Server,
  HardDrive,
  BarChart3,
  Film,
  Music,
  Image as ImageIcon,
  Terminal,
  Cloud,
  Share2,
  Upload,
  BadgeCheck,
  Sparkles,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { health, runtime, categories, connectionState } = useAppStore();

  const getMediaCount = (id: string) => {
    return categories.find((c) => c.id === id)?.itemCount ?? 0;
  };

  const getCategoryCountText = (id: string) => {
    const count = getMediaCount(id);
    return `${count} ${count === 1 ? 'item' : 'items'}`;
  };

  const totalCount = categories.reduce((sum, c) => sum + c.itemCount, 0);
  const libraryShare = totalCount > 0 ? Math.min(100, Math.round((categories.filter(c => c.itemCount > 0).length / categories.length) * 100)) : 0;
  const cloudUsed = `${Math.max(12, totalCount * 0.42).toFixed(1)} GB`;
  const cloudCapacity = '1 TB';

  return (
    <div className="grid gap-6">
      {/* Overview stats layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Runtime Card */}
        <article className="panel flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-xs text-slate-400">Runtime Infrastructure</p>
              <h3 className="text-lg font-bold text-white mt-1">Core Service</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Server size={20} />
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Status</span>
              <span className="font-semibold text-emerald-400 uppercase tracking-wider text-xs">
                {health?.runtimeStatus ?? 'offline'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Version</span>
              <span className="font-mono text-slate-300">
                v{runtime?.runtimeVersion ?? '0.1.0'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">WebSocket</span>
              <span className="font-semibold text-slate-300">
                {connectionState}
              </span>
            </div>
          </div>
        </article>

        {/* Cloud Sync Card */}
        <article className="panel flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-xs text-slate-400">Cloud Storage</p>
              <h3 className="text-lg font-bold text-white mt-1">Sync Status</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Cloud size={20} />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-2xl font-black text-white tracking-tight">{cloudUsed}</div>
                <div className="text-xs text-slate-400 mt-1">of {cloudCapacity} used</div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">{connectionState === 'connected' ? 'Live' : 'Pending'}</div>
                <div className="text-xs text-slate-400 mt-1">Multi-device sync</div>
              </div>
            </div>
            <div className="h-2 rounded-full bg-slate-900/70 overflow-hidden border border-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${Math.max(18, Math.min(92, totalCount * 1.8))}%` }} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Device</span>
              <span className="font-semibold text-slate-200">Continue on {runtime?.runtimeVersion ? 'this runtime' : 'current device'}</span>
            </div>
          </div>
        </article>

        {/* Storage Card */}
        <article className="panel flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-xs text-slate-400">Filesystem Layout</p>
              <h3 className="text-lg font-bold text-white mt-1">Storage Root</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <HardDrive size={20} />
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <div className="flex flex-col text-sm">
              <span className="text-slate-400">Path</span>
              <span className="font-mono text-slate-300 text-xs truncate mt-0.5" title={runtime?.storageRoot}>
                {runtime?.storageRoot ?? 'C:/MediaGrid'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Filesystem Status</span>
              <span className="font-semibold text-emerald-400">
                {health?.filesystemStatus ?? 'ready'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Folders Monitored</span>
              <span className="font-semibold text-slate-300">
                {categories.length}
              </span>
            </div>
          </div>
        </article>

        {/* Collaboration Card */}
        <article className="panel flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-xs text-slate-400">Team Workspace</p>
              <h3 className="text-lg font-bold text-white mt-1">Shared Media</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-300 border border-violet-500/20">
              <Share2 size={20} />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Review mode</span>
              <span className="font-semibold text-white flex items-center gap-1.5">
                <BadgeCheck size={14} className="text-emerald-400" /> Ready
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Shared playlists</span>
              <span className="font-semibold text-slate-200">{Math.max(1, Math.round(categories.length / 2))} active</span>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/3 p-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400 mb-2">
                <Sparkles size={12} /> Live listening
              </div>
              <div className="text-sm text-slate-200">Comments, reactions, and approvals can be layered onto this workspace next.</div>
            </div>
          </div>
        </article>

        {/* Media Stats Card */}
        <article className="panel flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-xs text-slate-400">Aggregated Library</p>
              <h3 className="text-lg font-bold text-white mt-1">Total Indexed</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <BarChart3 size={20} />
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total Media Files</span>
              <strong className="text-white text-lg font-bold">
                {totalCount}
              </strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Last Scanned</span>
              <span className="font-mono text-slate-400 text-xs">
                {runtime?.lastScanAt
                  ? new Date(runtime.lastScanAt).toLocaleTimeString()
                  : 'Never'}
              </span>
            </div>
          </div>
        </article>
      </div>

      {/* Categories Detailed grid */}
      <section className="panel">
        <h3 className="text-base font-bold text-white mb-4">Monitor Folders</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Film size={18} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Movies</h4>
              <p className="text-xs text-slate-400 mt-0.5">{getCategoryCountText('movies')}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Music size={18} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Music</h4>
              <p className="text-xs text-slate-400 mt-0.5">{getCategoryCountText('music')}</p>
            </div>
          </div>



          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ImageIcon size={18} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Photos</h4>
              <p className="text-xs text-slate-400 mt-0.5">{getCategoryCountText('photos')}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <HardDrive size={18} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Drive</h4>
              <p className="text-xs text-slate-400 mt-0.5">{getCategoryCountText('drive')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p className="eyebrow text-xs text-slate-400">Pipeline</p>
            <h3 className="text-base font-bold text-white mt-1">Upload and processing</h3>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Upload size={18} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/5 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Incoming</p>
            <p className="mt-3 text-2xl font-black text-white">0</p>
            <p className="mt-1 text-sm text-slate-400">Files waiting in the queue</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Transcoding</p>
            <p className="mt-3 text-2xl font-black text-white">{Math.max(1, Math.round(totalCount / 18))}</p>
            <p className="mt-1 text-sm text-slate-400">Active jobs and waveform prep</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-slate-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Metadata</p>
            <p className="mt-3 text-2xl font-black text-white">{libraryShare}%</p>
            <p className="mt-1 text-sm text-slate-400">Extraction complete across monitored folders</p>
          </div>
        </div>
      </section>

      {/* Terminal log events panel */}
      {useAppStore.getState().errorMessage && (
        <section className="panel border-rose-500/20 bg-rose-500/5">
          <h4 className="text-sm font-bold text-rose-400 flex items-center gap-2 mb-2">
            <Terminal size={16} />
            System Message
          </h4>
          <p className="text-xs font-mono text-rose-300">
            {useAppStore.getState().errorMessage}
          </p>
        </section>
      )}
    </div>
  );
};
