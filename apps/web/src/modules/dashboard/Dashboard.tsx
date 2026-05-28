import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Server,
  HardDrive,
  BarChart3,
  Film,
  Music,
  Tv,
  Image as ImageIcon,
  Terminal,
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

  return (
    <div className="grid gap-6">
      {/* Overview stats layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            <div className="p-3 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/20">
              <Tv size={18} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Shows</h4>
              <p className="text-xs text-slate-400 mt-0.5">{getCategoryCountText('shows')}</p>
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
