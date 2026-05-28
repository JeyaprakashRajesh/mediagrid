import { useEffect, useCallback } from 'react';
import { useAppStore } from './store/useAppStore';
import { connectRuntime, fetchInitialData, fetchMedia, openWebSocket } from './services/runtime';
import { Sidebar } from './components/sidebar/Sidebar';
import { Dashboard } from './modules/dashboard/Dashboard';
import { MediaContent } from './modules/media/MediaContent';
import { SetupWizard } from './modules/setup/SetupWizard';
import { LoginScreen } from './modules/auth/LoginScreen';
import { ContinueWatching } from './watch/ContinueWatching';
import { StreamingDashboard } from './sessions/StreamingDashboard';
import { DevicesDashboard } from './modules/devices/DevicesDashboard';
import { MusicPlayer } from './audio/MusicPlayer';
import { VideoPlayer } from './player/VideoPlayer';
import { WifiOff } from 'lucide-react';
import type { CategoryId } from '@mediagrid/types';
import './App.css';

const getCategoryLabel = (id: CategoryId) => {
  switch (id) {
    case 'movies':
      return 'Movies';
    case 'music':
      return 'Music';
    case 'shows':
      return 'Shows';
    case 'photos':
      return 'Photos';
    case 'drive':
      return 'Drive';
  }
};

const parseHash = () => {
  const hash = window.location.hash || '';
  if (!hash.startsWith('#/')) {
    return { view: 'devices', category: 'movies' as CategoryId, folderPath: '' };
  }
  const parts = hash.substring(2).split('/');
  const route = parts[0];
  if (route === 'library') {
    const category = (parts[1] || 'movies') as CategoryId;
    const folderPath = parts.slice(2).map(decodeURIComponent).join('/');
    return { view: 'library', category, folderPath };
  } else if (route === 'streaming') {
    return { view: 'admin', category: 'movies' as CategoryId, folderPath: '' };
  } else {
    return { view: route as any, category: 'movies' as CategoryId, folderPath: '' };
  }
};

function App() {
  const {
    connectionState,
    websocketStatus,
    selectedCategory,
    mediaItems,
    isConfigured,
    isAuthenticated,
    activeVideo,
    setActiveVideo,
    currentView,
    setCurrentView,
    setSelectedCategory,
    setCurrentFolderPath,
    currentFolderPath,
  } = useAppStore();

  const syncHashState = useCallback(() => {
    const { view, category, folderPath } = parseHash();
    if (currentView !== view) {
      setCurrentView(view as any);
    }
    if (selectedCategory !== category) {
      setSelectedCategory(category);
    }
    if (currentFolderPath !== folderPath) {
      setCurrentFolderPath(folderPath);
    }
  }, [currentView, selectedCategory, currentFolderPath, setCurrentView, setSelectedCategory, setCurrentFolderPath]);

  // Sync hash on mount and listen to changes
  useEffect(() => {
    if (isAuthenticated && isConfigured) {
      syncHashState();
      window.addEventListener('hashchange', syncHashState);
      return () => window.removeEventListener('hashchange', syncHashState);
    }
  }, [isAuthenticated, isConfigured, syncHashState]);

  // Default hash redirect
  useEffect(() => {
    if (isAuthenticated && isConfigured && !window.location.hash) {
      window.location.hash = '#/devices';
    }
  }, [isAuthenticated, isConfigured]);

  // Fetch category media when selection or view changes
  useEffect(() => {
    if (isAuthenticated && isConfigured && currentView === 'library') {
      fetchMedia(selectedCategory);
    }
  }, [selectedCategory, currentView, isAuthenticated, isConfigured]);

  // Re-fetch all data and connect WebSocket after a successful login
  const handleLogin = useCallback(async () => {
    const result = await fetchInitialData();
    if (result === 'success') {
      fetchMedia(selectedCategory);
      // Kick off the WebSocket channel that was deferred at startup
      openWebSocket?.();
    }
  }, [selectedCategory]);

  useEffect(() => {
    // Connect to runtime on mount and cleanup on unmount
    const cleanup = connectRuntime();
    return () => {
      cleanup();
    };
  }, []);

  // Failed State
  if (connectionState === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#07111d] p-6 text-slate-300">
        <div className="p-5 rounded-3xl bg-red-500/10 border border-red-500/20 text-red-500 mb-6">
          <WifiOff size={40} />
        </div>
        <h2 className="text-xl font-bold text-white tracking-wide text-center">
          Connection Failed
        </h2>
        <p className="text-sm text-slate-400 text-center mt-2 max-w-[36ch] leading-relaxed">
          Maximum connection attempts exceeded. Please check that the background runtime service is active.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold font-mono tracking-wide transition-all shadow-lg shadow-red-500/20 border border-red-400/20 active:scale-95"
        >
          FORCE MANUAL RETRY
        </button>
      </div>
    );
  }

  // 3. Connected State: Setup wizard
  if (!isConfigured) {
    return <SetupWizard />;
  }

  // 4. Connected & configured but not authenticated → show login
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      {connectionState !== 'connected' ? (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-slate-800/60 bg-slate-950/90 px-4 py-2 text-[11px] font-mono tracking-wide text-slate-300 shadow-lg shadow-black/20 backdrop-blur">
          {connectionState === 'connecting'
            ? 'Connecting to runtime endpoint...'
            : connectionState === 'reconnecting'
            ? 'Reconnecting to runtime endpoint...'
            : 'Runtime offline, retrying in background...'}
        </div>
      ) : null}

      {/* Sidebar navigation system */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="dashboard">
        <header className="hero-panel">
          <div>
            <p className="eyebrow text-xs tracking-widest text-slate-400 uppercase">
              Connected runtime overview
            </p>
            <h2 className="text-white text-3xl font-extrabold my-2">
              {currentView === 'devices' ? 'Devices' : getCategoryLabel(selectedCategory)}
            </h2>
            <p className="text-sm text-slate-300 max-w-[64ch] leading-relaxed mt-1">
              {currentView === 'devices'
                ? 'Review trusted devices, active sessions, and the current tailnet endpoint before browsing the library.'
                : 'Visualizing runtime file allocations, repair records, and client socket activity in a unified surface.'}
            </p>
          </div>

          {/* Quick Metrics panel */}
          <div className="hero-metrics min-w-[220px]">
            <div>
              <span>WebSocket</span>
              <strong className={`${
                websocketStatus === 'connected'
                  ? 'text-emerald-400'
                  : websocketStatus === 'connecting'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              } capitalize font-semibold flex items-center gap-1.5 mt-1`}>
                {websocketStatus}
              </strong>
            </div>
            <div className="flex flex-col justify-between">
              <span>Category Media</span>
              <strong className="text-white text-lg font-bold mt-1">
                {mediaItems.length}
              </strong>
            </div>
          </div>
        </header>

        {/* Continue Watching (Wide screen) */}
        {currentView === 'library' && <ContinueWatching />}

        {/* Content grid */}
        <section className="content-grid">
          {/* Category-specific Media content (Wide panel) */}
          <article className="panel panel-wide">
            {currentView === 'devices' ? (
              <DevicesDashboard />
            ) : currentView === 'library' ? (
              <>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow text-xs text-slate-400 uppercase">Category View</p>
                    <h3 className="text-base font-bold text-white mt-1">
                      {getCategoryLabel(selectedCategory)} Library
                    </h3>
                  </div>
                  <span className="panel-badge text-xs font-semibold px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300 font-mono">
                    {mediaItems.length} items
                  </span>
                </div>

                <MediaContent />
              </>
            ) : (
              <StreamingDashboard />
            )}
          </article>

          {/* Infrastructure Health stats (Side panel) */}
          <aside className="panel-side">
            <Dashboard />
          </aside>
        </section>
      </main>

      {/* Persistent global floating Music Player */}
      <MusicPlayer />

      {/* Advanced Video Player Overlay */}
      {activeVideo && (
        <VideoPlayer mediaItem={activeVideo} onClose={() => setActiveVideo(null)} />
      )}
    </div>
  );
}

export default App;
