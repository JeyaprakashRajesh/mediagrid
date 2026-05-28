import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Film,
  Music,
  Tv,
  Image as ImageIcon,
  Wifi,
  WifiOff,
  Database,
  Activity,
  HardDrive,
  Users,
  QrCode,
} from 'lucide-react';
import type { CategoryId } from '@mediagrid/types';

const categoryIcons: Record<CategoryId, React.ComponentType<any>> = {
  movies: Film,
  music: Music,
  shows: Tv,
  photos: ImageIcon,
  drive: HardDrive,
};

export const Sidebar: React.FC = () => {
  const {
    websocketStatus,
    categories,
    selectedCategory,
    health,
    runtime,
    currentView,
  } = useAppStore();

  const handleCategorySelect = (categoryId: CategoryId) => {
    window.location.hash = `#/library/${categoryId}`;
  };

  const getStatusText = () => {
    switch (websocketStatus) {
      case 'connected':
        return 'Runtime Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Runtime Offline';
    }
  };

  const getBannerClass = () => {
    switch (websocketStatus) {
      case 'connected':
        return 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400';
      case 'connecting':
        return 'border-amber-500/20 bg-amber-500/5 text-amber-400';
      case 'disconnected':
        return 'border-rose-500/20 bg-rose-500/5 text-rose-400';
    }
  };

  const getDotClass = () => {
    switch (websocketStatus) {
      case 'connected':
        return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]';
      case 'connecting':
        return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)] animate-pulse';
      case 'disconnected':
        return 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]';
    }
  };

  return (
    <aside className="sidebar flex flex-col justify-between h-full">
      <div>
        {/* Brand Lockup */}
        <div className="brand-lockup flex items-center gap-3.5 mb-6">
          <span className="brand-mark">MG</span>
          <div>
            <p className="eyebrow text-[10px] tracking-[0.2em] uppercase text-slate-400">Runtime-first</p>
            <h1 className="text-xl font-bold tracking-tight text-white leading-tight">MediaGrid</h1>
          </div>
        </div>

        {/* Connection status banner */}
        <div className={`connection-banner ${getBannerClass()} transition-colors duration-300`}>
          <span className={`connection-dot ${getDotClass()} transition-all duration-300`} />
          <span className="text-sm font-medium tracking-wide flex items-center gap-1.5">
            {websocketStatus === 'connected' ? (
              <Wifi size={14} className="opacity-80" />
            ) : (
              <WifiOff size={14} className="opacity-80" />
            )}
            {getStatusText()}
          </span>
        </div>

        {/* Category Pill navigation */}
        <nav className="category-nav gap-2.5 flex flex-col" aria-label="Media categories">
          {categories.map((category) => {
            const Icon = categoryIcons[category.id] || Film;
            const isActive = category.id === selectedCategory;

            return (
              <button
                key={category.id}
                type="button"
                className={`category-pill flex items-center justify-between transition-all duration-200 ${
                  isActive ? 'active' : ''
                }`}
                onClick={() => handleCategorySelect(category.id)}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    size={18}
                    className={`transition-colors ${
                      isActive ? 'text-sky-400' : 'text-slate-400'
                    }`}
                  />
                  <span>
                    <strong className="text-sm font-semibold tracking-wide text-white block">
                      {category.name}
                    </strong>
                    <small className="text-[11px] text-slate-400 font-mono tracking-tight block">
                      {category.folder}
                    </small>
                  </span>
                </span>
                <b className="text-xs px-2.5 py-1 rounded-full bg-slate-900/60 border border-slate-800/40 text-blue-100 font-semibold font-mono">
                  {category.itemCount}
                </b>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-900/60 my-4" />

        <div className="px-3.5 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
          Devices
        </div>
        <button
          type="button"
          onClick={() => { window.location.hash = '#/devices'; }}
          className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all duration-200 mb-2 ${
            currentView === 'devices'
              ? 'bg-sky-500/10 border-sky-500/20 text-sky-400'
              : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-slate-900/30'
          }`}
        >
          <span className="flex items-center gap-3">
            <Users
              size={18}
              className={`transition-colors ${
                currentView === 'devices' ? 'text-sky-400' : 'text-slate-400'
              }`}
            />
            <span>
              <strong className="text-sm font-semibold tracking-wide text-white block">
                Device Status
              </strong>
              <small className="text-[10px] text-slate-400 font-mono tracking-tight block">
                Trusted and active devices
              </small>
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => { window.location.hash = '#/pairing'; }}
          className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all duration-200 ${
            currentView === 'pairing'
              ? 'bg-sky-500/10 border-sky-500/20 text-sky-400'
              : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-slate-900/30'
          }`}
        >
          <span className="flex items-center gap-3">
            <QrCode
              size={18}
              className={`transition-colors ${
                currentView === 'pairing' ? 'text-sky-400' : 'text-slate-400'
              }`}
            />
            <span>
              <strong className="text-sm font-semibold tracking-wide text-white block">
                Pair Device
              </strong>
              <small className="text-[10px] text-slate-400 font-mono tracking-tight block">
                QR or access code onboarding
              </small>
            </span>
          </span>
        </button>

        <div className="px-3.5 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
          Administration
        </div>
        <button
          type="button"
          onClick={() => { window.location.hash = '#/streaming'; }}
          className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all duration-200 ${
            currentView === 'admin'
              ? 'bg-sky-500/10 border-sky-500/20 text-sky-400'
              : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-slate-900/30'
          }`}
        >
          <span className="flex items-center gap-3">
            <Activity
              size={18}
              className={`transition-colors ${
                currentView === 'admin' ? 'text-sky-400' : 'text-slate-400'
              }`}
            />
            <span>
              <strong className="text-sm font-semibold tracking-wide text-white block">
                Streaming Monitor
              </strong>
              <small className="text-[10px] text-slate-400 font-mono tracking-tight block">
                Active jobs & sessions
              </small>
            </span>
          </span>
        </button>
      </div>

      {/* Sidebar Summary footer */}
      <section className="sidebar-summary">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
          <Activity size={12} className="text-sky-400" />
          Runtime Summary
        </h2>
        <dl className="grid gap-2 text-xs">
          <div className="flex justify-between py-1 border-b border-slate-800/20">
            <dt className="text-slate-400 flex items-center gap-1">
              <Activity size={10} /> Status
            </dt>
            <dd className="font-semibold text-white uppercase tracking-wider text-[10px]">
              {health?.runtimeStatus ?? 'offline'}
            </dd>
          </div>
          <div className="flex flex-col py-1 border-b border-slate-800/20">
            <dt className="text-slate-400 flex items-center gap-1">
              <HardDrive size={10} /> Storage
            </dt>
            <dd className="font-semibold font-mono text-[10px] text-slate-300 break-all leading-tight mt-0.5">
              {runtime?.storageRoot ?? 'C:/MediaGrid'}
            </dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-slate-400 flex items-center gap-1">
              <Database size={10} /> Database
            </dt>
            <dd className="font-semibold text-emerald-400">
              {health?.databaseStatus ?? 'missing'}
            </dd>
          </div>
        </dl>
      </section>
    </aside>
  );
};
