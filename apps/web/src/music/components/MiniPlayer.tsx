import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Disc, Music } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { usePlayerStore } from '../store/playerStore';
import { getThumbnailUrl } from './PlaylistCard';
import { buildRuntimeUrl } from '@mediagrid/api';
import { getThumbnailGlow } from '../utils/coverTint';

export const MiniPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const {
    activeAudio,
    audioPlaying,
    audioQueue,
    audioRepeat,
    setAudioPlaying,
    playNextAudio,
    playPrevAudio,
  } = useAppStore();

  const {
    currentTime,
    duration,
    volume,
    isMuted,
    isExpanded,
    setCurrentTime,
    setDuration,
    setIsExpanded,
  } = usePlayerStore();

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
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

  // Stream URLs
  const buildStreamUrl = (mediaId: string) => {
    const token = localStorage.getItem('mediagrid_token');
    const base = buildRuntimeUrl(`/audio/stream/${encodeURIComponent(mediaId)}`);
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  };

  const appendToken = (url: string) => {
    const token = localStorage.getItem('mediagrid_token');
    if (!token) return url;
    const abs = url.startsWith('http') ? url : buildRuntimeUrl(url);
    const u = new URL(abs);
    if (!u.searchParams.has('token')) u.searchParams.set('token', token);
    return u.toString();
  };

  const resolveAudioUrl = async (mediaId: string, signal?: AbortSignal): Promise<string> => {
    const streamUrl = buildStreamUrl(mediaId);
    const controller = new AbortController();
    
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const res = await fetch(streamUrl, { signal: controller.signal });
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const j = await res.json() as { url?: string };
        if (j.url) return appendToken(j.url);
      } else {
        // Abort the fetch request immediately for binary stream response to prevent downloading/locking
        controller.abort();
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        // Abort is expected for binary streams or active audio change
      } else {
        console.warn('Failed resolving track redirect, playing stream direct', e);
      }
    }
    return streamUrl;
  };

  // Sync activeAudio -> audio source
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeAudio) return;
    
    const controller = new AbortController();
    setCurrentTime(0);
    setDuration(0);
    
    (async () => {
      const url = await resolveAudioUrl(activeAudio.id, controller.signal);
      if (controller.signal.aborted || !audioRef.current) return;
      
      if (audio.src !== url) {
        audio.src = url;
        audio.load();
      }
      
      if (audioPlaying) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    })();

    return () => {
      controller.abort();
    };
  }, [activeAudio]);

  // Play/Pause sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    
    if (audioPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [audioPlaying]);

  // Volume & Mute Sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  // Event handlers
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    if (audioRepeat === 'one') {
      const a = audioRef.current;
      if (a) {
        a.currentTime = 0;
        a.play().catch(() => {});
      }
    } else {
      playNextAudio();
    }
  };

  // Sync external seek actions
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // If external time is far from actual time, seek physical audio
    if (Math.abs(audio.currentTime - currentTime) > 1.2) {
      audio.currentTime = currentTime;
    }
  }, [currentTime]);

  // Swipe Gestures for Mobile (Skip/Previous)
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartX;
    
    if (Math.abs(diffX) > 60) {
      if (diffX > 0) {
        playPrevAudio();
      } else {
        playNextAudio();
      }
    }
    setTouchStartX(null);
  };

  if (!activeAudio) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {!isExpanded && (
        <div
          onClick={() => setIsExpanded(true)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            position: 'fixed',
            bottom: isMobile ? 80 : 20, // Float above bottom bar on mobile
            left: 20,
            right: 20,
            height: 48, // Thinner height
            zIndex: 49,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            background: 'rgba(18, 18, 22, 0.28)',
            backdropFilter: 'blur(30px) saturate(210%)',
            WebkitBackdropFilter: 'blur(30px) saturate(210%)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.28)',
            borderRadius: 14,
            cursor: 'pointer',
            userSelect: 'none',
            overflow: 'hidden',
            transition: 'box-shadow 280ms ease, background 280ms ease',
          }}
        >
          {/* Small Progress Line at Top */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.06)' }}>
            <div 
              style={{ 
                height: '100%', 
                width: `${progressPercent}%`, 
                background: '#38bdf8', 
                borderRadius: '0 99px 99px 0', 
                transition: 'width 0.2s linear',
              }} 
            />
          </div>

          {/* Left Side: Artwork + Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: '#1c1c1e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                overflow: 'hidden',
                boxShadow: `0 2px 10px rgba(0, 0, 0, 0.24), ${thumbnailGlow}`,
                transition: 'box-shadow 280ms ease',
              }}
            >
              {activeAudio && !imgError ? (
                <img
                  src={getThumbnailUrl(activeAudio)}
                  alt=""
                  onError={() => setImgError(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', boxShadow: '0 0 36px rgba(56, 189, 248, 0.38)' }}
                />
              ) : audioPlaying ? (
                <Disc size={14} className="spin-art" style={{ color: '#fff' }} />
              ) : (
                <Music size={12} style={{ color: 'rgba(255,255,255,0.8)' }} />
              )}
            </div>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeAudio.title}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeAudio.artist || 'Unknown Artist'}
              </span>
            </div>
          </div>

          {/* Right Side: Player Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => playPrevAudio()}
              disabled={audioQueue.length <= 1}
              style={{
                padding: 6,
                color: 'rgba(255,255,255,0.65)',
                opacity: audioQueue.length <= 1 ? 0.3 : 1,
              }}
            >
              <SkipBack size={14} fill="currentColor" />
            </button>
            
            <button
              onClick={() => setAudioPlaying(!audioPlaying)}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.1s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              {audioPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" style={{ marginLeft: 1 }} />}
            </button>

            <button
              onClick={() => playNextAudio()}
              disabled={audioQueue.length <= 1}
              style={{
                padding: 6,
                color: 'rgba(255,255,255,0.65)',
                opacity: audioQueue.length <= 1 ? 0.3 : 1,
              }}
            >
              <SkipForward size={14} fill="currentColor" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
