import React from 'react';
import { buildRuntimeUrl } from '@mediagrid/api';
import { useAppStore } from '../store/useAppStore';
import { Play, Film, Tv } from 'lucide-react';

export const ContinueWatching: React.FC = () => {
  const { continueWatchingItems, setActiveVideo } = useAppStore();

  if (continueWatchingItems.length === 0) {
    return null;
  }

  const getMediaThumbnail = (id: string) => buildRuntimeUrl(`/media/thumbnail/${id}`);

  return (
    <section className="panel mb-6 animate-in fade-in duration-500">
      <div className="panel-header mb-4">
        <div>
          <p className="eyebrow text-xs text-sky-400 uppercase font-mono tracking-wider">RESUME PLAYBACK</p>
          <h3 className="text-base font-extrabold text-white mt-0.5">
            Continue Watching
          </h3>
        </div>
        <span className="panel-badge text-xs font-semibold px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300 font-mono">
          {continueWatchingItems.length} in progress
        </span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {continueWatchingItems.map((item) => {
          const Icon = item.category === 'shows' ? Tv : Film;
          const progressPercent = Math.min(100, Math.max(0, item.progress * 100));

          return (
            <div
              key={item.id}
              className="flex-shrink-0 w-64 group relative bg-slate-950/40 rounded-2xl border border-slate-900 overflow-hidden hover:border-slate-700/60 transition-all duration-300 cursor-pointer"
              onClick={() => setActiveVideo(item)}
            >
              {/* Thumbnail Container */}
              <div className="aspect-video w-full bg-slate-900 flex items-center justify-center relative overflow-hidden">
                <img
                  src={getMediaThumbnail(item.id)}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => {
                    // Fallback to hidden image or placeholder
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                
                {/* Dark Overlay on Hover */}
                <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <div className="p-3.5 rounded-full bg-sky-500 text-slate-950 scale-90 group-hover:scale-100 transition-transform duration-300 shadow-lg shadow-sky-500/20">
                    <Play size={20} fill="currentColor" className="translate-x-0.5" />
                  </div>
                </div>

                {/* Category Icon Badge */}
                <div className="absolute top-2 left-2 p-1.5 rounded-xl bg-slate-950/70 border border-slate-800/40 text-slate-400 group-hover:text-white transition">
                  <Icon size={14} />
                </div>

                {/* Progress bar overlay at the bottom of thumbnail */}
                <div className="absolute bottom-0 inset-x-0 h-1 bg-slate-800">
                  <div
                    className="h-full bg-sky-500 transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Body */}
              <div className="p-3">
                <h4 className="text-xs font-bold text-white truncate group-hover:text-sky-400 transition" title={item.title}>
                  {item.title}
                </h4>
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-1">
                  <span>{Math.round(progressPercent)}% watched</span>
                  <span>{item.kind.toUpperCase()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
