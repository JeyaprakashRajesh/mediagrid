import { useEffect, useCallback, useRef, useState } from 'react';
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
import { ExpandedPlayer } from './music/components/ExpandedPlayer';
import { getThumbnailUrl } from './music/components/PlaylistCard';
import { getThumbnailTint } from './music/utils/coverTint';
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
    activeAudio,
    activeVideo,
    setActiveVideo,
    currentView,
    setCurrentView,
    setSelectedCategory,
    setCurrentFolderPath,
    currentFolderPath,
  } = useAppStore();
  const defaultSceneTint = 'rgba(24, 24, 28, 0.0)';
  const [sceneTint, setSceneTint] = useState(defaultSceneTint);
  const [sceneTintOpacity, setSceneTintOpacity] = useState(0);
  const [sceneTintPrev, setSceneTintPrev] = useState<string | null>(null);
  const [sceneTintPrevOpacity, setSceneTintPrevOpacity] = useState(0);
  const sceneTintTimer = useRef<number | null>(null);
  const sceneTintRef = useRef(defaultSceneTint);

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

  useEffect(() => {
    let cancelled = false;

    if (sceneTintTimer.current !== null) {
      window.clearTimeout(sceneTintTimer.current);
      sceneTintTimer.current = null;
    }

    if (!activeAudio) {
      setSceneTintPrev(sceneTintRef.current);
      setSceneTintPrevOpacity(0.34);
      setSceneTint(defaultSceneTint);
      setSceneTintOpacity(0);
      sceneTintRef.current = defaultSceneTint;
      sceneTintTimer.current = window.setTimeout(() => {
        setSceneTintPrev(null);
        setSceneTintPrevOpacity(0);
      }, 2000);
      return;
    }

    const previousTint = sceneTintRef.current;

    getThumbnailTint(getThumbnailUrl(activeAudio)).then((tint) => {
      if (!cancelled) {
        setSceneTintPrev(previousTint);
        setSceneTintPrevOpacity(0.82);
        setSceneTint(tint);
        sceneTintRef.current = tint;
        setSceneTintOpacity(0);
        window.requestAnimationFrame(() => {
          setSceneTintOpacity(0.92);
          setSceneTintPrevOpacity(0);
        });
        sceneTintTimer.current = window.setTimeout(() => {
          setSceneTintPrev(null);
        }, 2200);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeAudio?.id, activeAudio?.thumbnailPath]);

  // Failed State
  if (connectionState === 'failed') {
    return (
      <div className="login-screen">
        <div className="liquid-orb orb-1" />
        <div className="liquid-orb orb-2" />
        <div className="glass-modal flex flex-col items-center justify-center text-slate-300">
          <div className="p-5 rounded-3xl bg-rose-500/10 border border-rose-500/25 text-rose-400 mb-6 shadow-lg shadow-rose-500/5">
            <WifiOff size={36} />
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-tight text-center">
            Connection Failed
          </h2>
          <p className="text-xs text-slate-400 text-center mt-2.5 max-w-[32ch] leading-relaxed">
            Maximum connection attempts exceeded. Please check that the background runtime service is active.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="login-btn mt-6"
            style={{ background: 'linear-gradient(135deg, #ff453a, #ff9f0a)', border: '1px solid rgba(255, 69, 58, 0.15)', boxShadow: '0 6px 18px rgba(255, 69, 58, 0.25)' }}
          >
            FORCE MANUAL RETRY
          </button>
        </div>
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
    <div className="app-shell" style={{ ['--now-playing-tint' as any]: sceneTint }}>
      <div
        className="scene-tint-layer scene-tint-layer--current"
        style={{
          backgroundColor: sceneTint,
          opacity: activeAudio ? sceneTintOpacity : 0,
        }}
      />
      {sceneTintPrev ? (
        <div
          className="scene-tint-layer scene-tint-layer--previous"
          style={{
            backgroundColor: sceneTintPrev,
            opacity: sceneTintPrevOpacity,
          }}
        />
      ) : null}
      {/* Floating orbs in background */}
      <div className="liquid-orb orb-1" />
      <div className="liquid-orb orb-2" />
      <div className="liquid-orb orb-3" />

      {connectionState !== 'connected' ? (
        <div className="fixed top-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-5 py-2 text-xs font-mono tracking-wide text-slate-200 shadow-xl backdrop-blur-lg flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
          <span>
            {connectionState === 'connecting'
              ? 'Connecting to runtime endpoint...'
              : connectionState === 'reconnecting'
              ? 'Reconnecting to runtime endpoint...'
              : 'Runtime offline, retrying in background...'}
          </span>
        </div>
      ) : null}

      {/* Sidebar navigation system */}
      <Sidebar />

      {/* Main Content Area */}
      {currentView === 'library' && selectedCategory === 'music' ? (
        <main className="dashboard dashboard--music">
          <MediaContent />
        </main>

      ) : (
        <main className="dashboard">
          <header className="hero-panel">
            <div>
              <p className="eyebrow">
                Connected runtime overview
              </p>
              <h2>
                {currentView === 'devices' ? 'Devices' : getCategoryLabel(selectedCategory)}
              </h2>
              <p>
                {currentView === 'devices'
                  ? 'Review trusted devices, active sessions, and the current tailnet endpoint before browsing the library.'
                  : 'Visualizing runtime file allocations, repair records, and client socket activity in a unified surface.'}
              </p>
            </div>

            {/* Quick Metrics panel */}
            <div className="hero-metrics">
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
              <div>
                <span>Category Media</span>
                <strong>
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
                      <p className="eyebrow">Category View</p>
                      <h3 className="text-base font-bold text-white mt-1">
                        {getCategoryLabel(selectedCategory)} Library
                      </h3>
                    </div>
                    <span className="panel-badge">
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
      )}

      {/* Persistent global floating Music Player */}
      <MusicPlayer />

      {/* Expanded music popup */}
      <ExpandedPlayer />

      {/* Advanced Video Player Overlay */}
      {activeVideo && (
        <VideoPlayer mediaItem={activeVideo} onClose={() => setActiveVideo(null)} />
      )}
    </div>
  );
}

export default App;
