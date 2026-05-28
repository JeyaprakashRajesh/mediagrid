import React, { useState, useEffect } from 'react';
import { ChevronDown, Heart, Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Volume2, VolumeX, ListMusic, Disc } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { usePlayerStore } from '../store/playerStore';
import { ProgressBar } from './ProgressBar';
import { QueuePanel } from './QueuePanel';
import { getThumbnailUrl } from './PlaylistCard';
import { getThumbnailGlow } from '../utils/coverTint';


const getBackdropColors = (title: string) => {
  const h1 = Math.abs(title.charCodeAt(0) % 360);
  const h2 = (h1 + 140) % 360;
  return {
    c1: `hsl(${h1}, 80%, 40%)`,
    c2: `hsl(${h2}, 60%, 15%)`,
    raw: `hsl(${h1}, 85%, 55%)`
  };
};

export const ExpandedPlayer: React.FC = () => {
  const {
    activeAudio,
    audioPlaying,
    audioQueue,
    audioShuffle,
    audioRepeat,
    setAudioPlaying,
    setAudioShuffle,
    setAudioRepeat,
    playNextAudio,
    playPrevAudio,
  } = useAppStore();

  const {
    currentTime,
    duration,
    volume,
    isMuted,
    isExpanded,
    likedSongs,
    setCurrentTime,
    setVolume,
    setIsMuted,
    setIsExpanded,
    toggleLikeSong,
  } = usePlayerStore();

  const [showQueueDrawer, setShowQueueDrawer] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [imgError, setImgError] = useState(false);
  const [thumbnailGlow, setThumbnailGlow] = useState('0 0 0 1px rgba(255, 255, 255, 0.06)');

  // Resize listener
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setImgError(false);
  }, [activeAudio?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!activeAudio) return;

    getThumbnailGlow(getThumbnailUrl(activeAudio)).then((glow) => {
      if (!cancelled) {
        setThumbnailGlow(glow);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeAudio?.id, activeAudio?.thumbnailPath]);

  if (!activeAudio) return null;

  const isLiked = likedSongs.includes(activeAudio.id);
  const colors = getBackdropColors(activeAudio.title);

  // Swipe Down gesture to collapse
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const diffY = e.changedTouches[0].clientY - touchStartY;
    if (diffY > 80) {
      setIsExpanded(false);
    }
    setTouchStartY(null);
  };

  const toggleMute = () => setIsMuted(!isMuted);

  const cycleRepeat = () => {
    const modes: ('none' | 'all' | 'one')[] = ['none', 'all', 'one'];
    const currentIdx = modes.indexOf(audioRepeat);
    const nextIdx = (currentIdx + 1) % modes.length;
    setAudioRepeat(modes[nextIdx]);
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: '50vh', // Half screen height
        zIndex: 999,
        background: 'rgba(18, 18, 22, 0.32)',
        backdropFilter: 'blur(30px) saturate(210%)',
        WebkitBackdropFilter: 'blur(30px) saturate(210%)',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '32px 32px 0 0', // Rounded top corners
        boxShadow: '0 -12px 32px rgba(0, 0, 0, 0.28)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        userSelect: 'none',
        transform: isExpanded ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.45s cubic-bezier(0.32, 0.94, 0.6, 1)',
        pointerEvents: isExpanded ? 'auto' : 'none',
      }}
    >
      {/* Solid Charcoal Backdrop */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          zIndex: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(circle at top, rgba(255,255,255,0.03), rgba(14, 14, 16, 0.9) 70%)',
        }}
      />

      {/* Drag handle decoration */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 2, position: 'relative', zIndex: 2 }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.1)' }} />
      </div>

      {/* Header Controls */}
      <header
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 24px 10px',
          background: 'transparent',
          borderBottom: 'none', // Remove unnecessary separator
        }}
      >
        <button
          onClick={() => setIsExpanded(false)}
          className="spring-click"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronDown size={18} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.4)' }}>
            Now Playing
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
            {activeAudio.album || 'MediaGrid Library'}
          </span>
        </div>
        <button
          onClick={() => setShowQueueDrawer(!showQueueDrawer)}
          className="spring-click"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: showQueueDrawer ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: `1px solid ${showQueueDrawer ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.06)'}`,
            color: showQueueDrawer ? '#38bdf8' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ListMusic size={16} />
        </button>
      </header>

      {/* Main Core Section */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          flex: 1,
          display: 'flex',
          flexDirection: 'column', // Stack vertically
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '8px 24px 16px' : '12px 36px 20px',
          maxWidth: 440,
          margin: '0 auto',
          width: '100%',
          minHeight: 0,
          gap: 12,
        }}
      >
        {/* Section 1: Artwork */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: isMobile ? '110px' : '140px',
              aspectRatio: '1/1',
              borderRadius: 24,
              background: '#1c1c1e',
              boxShadow: `0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05), ${thumbnailGlow}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              position: 'relative',
              overflow: 'hidden',
              transition: 'box-shadow 280ms ease',
            }}
          >
            {activeAudio && !imgError ? (
              <img
                src={getThumbnailUrl(activeAudio)}
                alt=""
                onError={() => setImgError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', boxShadow: '0 0 40px rgba(56, 189, 248, 0.4)' }}
              />
            ) : (
              <Disc 
                size={isMobile ? 50 : 70} 
                className={`spin-art ${!audioPlaying ? 'spin-art-paused' : ''}`}
                style={{ 
                  color: 'rgba(255, 255, 255, 0.4)', 
                  filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.2))'
                }} 
              />
            )}
          </div>
        </div>

        {/* Section 2: Details & Controls */}
        <div 
          style={{ 
            width: '100%',
            display: 'flex', 
            flexDirection: 'column', 
            gap: 10,
            justifyContent: 'center',
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Song Description */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 
                style={{ 
                  margin: 0, 
                  fontSize: isMobile ? 15 : 18, 
                  fontWeight: 900, 
                  color: '#fff', 
                  letterSpacing: '-0.02em', 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis' 
                }}
              >
                {activeAudio.title}
              </h1>
              <p 
                style={{ 
                  margin: '2px 0 0 0', 
                  fontSize: isMobile ? 11 : 13, 
                  color: '#94a3b8', 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis',
                  fontWeight: 600
                }}
              >
                {activeAudio.artist || 'Unknown Artist'}
              </p>
            </div>
            
            {/* Glass UI Heart Button */}
            <button
              onClick={() => toggleLikeSong(activeAudio.id)}
              className="spring-click"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: isLiked ? '#38bdf8' : 'rgba(255,255,255,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
            >
              <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
            </button>
          </div>

          {/* Progress Slider */}
          <ProgressBar 
            value={currentTime} 
            max={duration} 
            onChange={(val) => setCurrentTime(val)} 
            accentColor={colors.raw}
          />

          {/* Playback Controls with Frosted Glass Orb */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
            <button
              onClick={() => setAudioShuffle(!audioShuffle)}
              className="spring-click"
              style={{
                padding: 6,
                color: audioShuffle ? '#38bdf8' : 'rgba(255,255,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shuffle size={16} />
            </button>

            <button
              onClick={() => playPrevAudio()}
              disabled={audioQueue.length <= 1}
              className="spring-click"
              style={{
                padding: 6,
                color: '#fff',
                opacity: audioQueue.length <= 1 ? 0.3 : 0.85,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SkipBack size={20} fill="currentColor" />
            </button>

            {/* Glowing Frosted Glass Play Orb */}
            <button
              onClick={() => setAudioPlaying(!audioPlaying)}
              className="spring-click"
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.12)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 8px 24px rgba(0, 0, 0, 0.25), 0 0 20px ${colors.raw}35`,
                textShadow: '0 2px 4px rgba(0,0,0,0.5)',
              }}
            >
              {audioPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>

            <button
              onClick={() => playNextAudio()}
              disabled={audioQueue.length <= 1}
              className="spring-click"
              style={{
                padding: 6,
                color: '#fff',
                opacity: audioQueue.length <= 1 ? 0.3 : 0.85,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SkipForward size={20} fill="currentColor" />
            </button>

            <button
              onClick={cycleRepeat}
              className="spring-click"
              style={{
                padding: 6,
                color: audioRepeat !== 'none' ? '#38bdf8' : 'rgba(255,255,255,0.3)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Repeat size={16} />
              {audioRepeat === 'one' && (
                <span style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
              )}
            </button>
          </div>

          {/* Volume control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px' }}>
            <button onClick={toggleMute} style={{ color: 'rgba(255,255,255,0.4)', padding: 4 }}>
              {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="premium-slider"
              style={{
                background: `linear-gradient(to right, #fff 0%, #fff ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.1) ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.1) 100%)`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Queue Drawer Panel (Confined inside the 50vh container) */}
      {showQueueDrawer && (
        <div
          style={{
            position: 'absolute',
            inset: '48px 0 0 0',
            width: '100%',
            height: 'calc(100% - 48px)',
            zIndex: 100,
            animation: 'slide-up-queue 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <QueuePanel onClose={() => setShowQueueDrawer(false)} />
        </div>
      )}

      {/* Bottom spacer */}
      <footer style={{ height: 12, position: 'relative', zIndex: 1 }} />

      <style>{`
        @keyframes slide-up-queue {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
