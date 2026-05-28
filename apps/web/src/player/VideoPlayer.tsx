import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { buildRuntimeUrl } from '@mediagrid/api';
import {
  Play,
  Pause,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  X,
  Settings,
  Subtitles,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface VideoPlayerProps {
  mediaItem: any;
  onClose: () => void;
}

// Returns the auth header object for fetch calls
const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('mediagrid_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ mediaItem, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSeekingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);

  const {
    activeSession,
    setActiveSession,
    subtitleTracks,
    setSubtitleTracks,
    activeSubtitleTrack,
    setActiveSubtitleTrack,
    subtitlesEnabled,
    setSubtitlesEnabled,
    playbackSpeed,
    setPlaybackSpeed,
    playbackQuality,
    setPlaybackQuality,
  } = useAppStore();

  const hlsRef = useRef<Hls | null>(null);
  const progressIntervalRef = useRef<number | undefined>(undefined);
  const controlsTimeoutRef = useRef<number | undefined>(undefined);

  // 1. Fetch playback stream and initialize player
  useEffect(() => {
    let active = true;
    let metadataHandler: (() => void) | null = null;

    const initPlayer = async () => {
      setLoading(true);
      try {
        const res = await fetch(buildRuntimeUrl(`/stream/${mediaItem.id}`), {
          headers: getAuthHeaders(),
        }).then((r) => r.json());
        if (!active) return;
        setActiveSession(res);

        // Fetch subtitle tracks
        const subRes = await fetch(buildRuntimeUrl(`/subtitles/${mediaItem.id}`), {
          headers: getAuthHeaders(),
        }).then((r) => r.json());
        if (active && subRes.tracks) {
          setSubtitleTracks(subRes.tracks);
          if (subRes.tracks.length > 0) {
            setActiveSubtitleTrack(0); // select first track by default
            setSubtitlesEnabled(true);
          }
        }

        const video = videoRef.current;
        if (!video) return;

        const streamUrl = res.streamUrl.startsWith('http')
          ? res.streamUrl
          : buildRuntimeUrl(res.streamUrl);

        metadataHandler = () => {
          setDuration(video.duration);
          if (typeof mediaItem.progress === 'number' && mediaItem.progress > 0 && Number.isFinite(video.duration) && video.duration > 0) {
            video.currentTime = mediaItem.progress * video.duration;
          }
          setLoading(false);
          video.play().catch(() => {});
        };

        video.addEventListener('loadedmetadata', metadataHandler);

        if (res.mode === 'direct' || !Hls.isSupported()) {
          // Append token as query param — the browser's media pipeline can't send headers
          const token = localStorage.getItem('mediagrid_token');
          video.src = token ? `${streamUrl}?token=${encodeURIComponent(token)}` : streamUrl;
        } else {
          // HLS dynamic streaming — inject auth header into every XHR Hls.js makes
          const token = localStorage.getItem('mediagrid_token');
          const hls = new Hls({
            maxBufferLength: 30,
            enableWorker: true,
            xhrSetup: (xhr) => {
              if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            },
          });
          hlsRef.current = hls;

          hls.loadSource(streamUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            video.play().catch(() => {});
          });

          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  onClose();
                  break;
              }
            }
          });
        }
      } catch (err) {
        console.error('Failed to start stream', err);
        setLoading(false);
      }
    };

    initPlayer();

    return () => {
      active = false;
      const video = videoRef.current;
      if (video && metadataHandler) {
        video.removeEventListener('loadedmetadata', metadataHandler);
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setActiveSession(null);
      window.clearInterval(progressIntervalRef.current);
      window.clearTimeout(controlsTimeoutRef.current);
    };
  }, [mediaItem.id]);

  // 2. Periodic watch progress reporting
  useEffect(() => {
    const reportProgress = async () => {
      const video = videoRef.current;
      if (!video || video.duration === 0) return;
      const progress = video.currentTime / video.duration;

      try {
        await fetch(buildRuntimeUrl('/watch/progress'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            mediaId: mediaItem.id,
            progress: parseFloat(progress.toFixed(4)),
          }),
        });
      } catch (err) {
        console.error('Failed to report progress', err);
      }
    };

    progressIntervalRef.current = window.setInterval(reportProgress, 5000);

    return () => {
      window.clearInterval(progressIntervalRef.current);
      // Final report on close
      reportProgress();
    };
  }, [mediaItem.id]);

  // 3. Sync player states
  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isSeekingRef.current) return;
    setCurrentTime(video.currentTime);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const time = parseFloat(e.target.value);
    if (!Number.isFinite(time)) return;
    isSeekingRef.current = true;
    video.currentTime = time;
    setCurrentTime(time);
  };

  const handleSeekStart = () => {
    isSeekingRef.current = true;
  };

  const handleSeekEnd = () => {
    isSeekingRef.current = false;
    const video = videoRef.current;
    if (video) {
      setCurrentTime(video.currentTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const vol = parseFloat(e.target.value);
    video.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    window.clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const formatTime = (secs: number) => {
    if (Number.isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const changeSpeed = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackSpeed(rate);
    setShowSettings(false);
  };

  const changeQuality = (qualityKey: string) => {
    setPlaybackQuality(qualityKey);
    const hls = hlsRef.current;
    if (!hls) return;

    if (qualityKey === 'auto') {
      hls.currentLevel = -1;
    } else {
      const levels = hls.levels;
      const targetHeight = parseInt(qualityKey);
      const levelIdx = levels.findIndex((l) => l.height === targetHeight);
      if (levelIdx !== -1) {
        hls.currentLevel = levelIdx;
      }
    }
    setShowSettings(false);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 bg-black flex items-center justify-center z-50 select-none overflow-hidden"
    >
      {loading && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-40 text-slate-300 backdrop-blur-sm">
          <Loader2 size={44} className="animate-spin text-sky-400 mb-4" />
          <h3 className="text-lg font-bold text-white tracking-wide">Starting media session...</h3>
          <p className="text-xs text-slate-500 font-mono mt-1">Initializing transcoder engine & segments</p>
        </div>
      )}

      {/* Video screen */}
      <video
        ref={videoRef}
        onTimeUpdate={handleTimeUpdate}
        onSeeking={handleSeekStart}
        onSeeked={handleSeekEnd}
        onClick={handlePlayPause}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full h-full object-contain"
        preload="auto"
        crossOrigin="anonymous"
      >
        {subtitlesEnabled && activeSubtitleTrack !== null && subtitleTracks[activeSubtitleTrack] && (
          <track
            kind="subtitles"
            src={`${buildRuntimeUrl(`/subtitles/${mediaItem.id}`)}?track=${subtitleTracks[activeSubtitleTrack].index}&token=${encodeURIComponent(localStorage.getItem('mediagrid_token') ?? '')}`}
            srcLang={subtitleTracks[activeSubtitleTrack].language}
            label={subtitleTracks[activeSubtitleTrack].title}
            default
          />
        )}
      </video>

      {/* Header Top Controls */}
      <div
        className={`absolute top-0 inset-x-0 p-5 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-center z-30 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div>
          <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider font-mono">
            {mediaItem.kind.toUpperCase()} PLAYBACK
          </span>
          <h2 className="text-white text-lg font-bold truncate max-w-md mt-0.5">{mediaItem.title}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white transition shadow-md border border-slate-800/40"
        >
          <X size={20} />
        </button>
      </div>

      {/* Bottom Panel Controls */}
      <div
        className={`absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-30 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Progress seek bar */}
        <div className="flex items-center gap-4 mb-4">
          <span className="text-[11px] font-mono text-slate-400 w-10 text-center">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            onPointerDown={handleSeekStart}
            onPointerUp={handleSeekEnd}
            className="flex-1 h-1.5 rounded-lg appearance-none bg-slate-800 hover:bg-slate-700 cursor-pointer accent-sky-400 outline-none"
          />
          <span className="text-[11px] font-mono text-slate-400 w-10 text-center">
            {formatTime(duration)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          {/* Left: Playback Controls */}
          <div className="flex items-center gap-5">
            <button
              onClick={handlePlayPause}
              className="p-3 rounded-full bg-sky-500 hover:bg-sky-400 text-slate-950 transition hover:scale-105 active:scale-95 shadow-md shadow-sky-500/25"
            >
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2 group">
              <button
                onClick={toggleMute}
                className="text-slate-400 hover:text-white transition p-1.5 hover:bg-slate-900/60 rounded-lg"
              >
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-0 group-hover:w-20 accent-sky-400 h-1 rounded-lg appearance-none bg-slate-800 transition-all duration-300 cursor-pointer"
              />
            </div>
          </div>

          {/* Right: Options & Panel toggles */}
          <div className="flex items-center gap-4 relative">
            {/* Subtitles Button */}
            {subtitleTracks.length > 0 && (
              <button
                onClick={() => {
                  setShowSubtitleMenu(!showSubtitleMenu);
                  setShowSettings(false);
                }}
                className={`p-2 rounded-lg transition hover:bg-slate-900/60 ${
                  subtitlesEnabled ? 'text-sky-400' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Subtitles size={18} />
              </button>
            )}

            {/* Settings Button */}
            <button
              onClick={() => {
                setShowSettings(!showSettings);
                setShowSubtitleMenu(false);
              }}
              className="text-slate-400 hover:text-white transition p-2 rounded-lg hover:bg-slate-900/60"
            >
              <Settings size={18} />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-slate-400 hover:text-white transition p-2 rounded-lg hover:bg-slate-900/60"
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>

            {/* Subtitles Dropdown */}
            {showSubtitleMenu && (
              <div className="absolute bottom-12 right-12 w-48 rounded-2xl bg-slate-950/90 border border-slate-800/80 p-2 shadow-2xl backdrop-blur-md flex flex-col z-50 animate-in fade-in-50 duration-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase px-3 py-1 font-mono">
                  Subtitles
                </span>
                <button
                  onClick={() => {
                    setSubtitlesEnabled(false);
                    setShowSubtitleMenu(false);
                  }}
                  className={`w-full text-left text-xs font-semibold px-3 py-2 rounded-xl transition ${
                    !subtitlesEnabled
                      ? 'bg-sky-500/10 text-sky-400'
                      : 'text-slate-400 hover:bg-slate-900/40 hover:text-white'
                  }`}
                >
                  Off
                </button>
                {subtitleTracks.map((track, idx) => (
                  <button
                    key={track.index}
                    onClick={() => {
                      setActiveSubtitleTrack(idx);
                      setSubtitlesEnabled(true);
                      setShowSubtitleMenu(false);
                    }}
                    className={`w-full text-left text-xs font-semibold px-3 py-2 rounded-xl transition ${
                      subtitlesEnabled && activeSubtitleTrack === idx
                        ? 'bg-sky-500/10 text-sky-400'
                        : 'text-slate-400 hover:bg-slate-900/40 hover:text-white'
                    }`}
                  >
                    {track.title} ({track.language.toUpperCase()})
                  </button>
                ))}
              </div>
            )}

            {/* Settings Options Dropdown */}
            {showSettings && (
              <div className="absolute bottom-12 right-4 w-56 rounded-2xl bg-slate-950/90 border border-slate-800/80 p-3 shadow-2xl backdrop-blur-md flex flex-col gap-2 z-50 animate-in fade-in-50 duration-200">
                {/* Speed */}
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase px-2 font-mono">
                    Playback Speed
                  </span>
                  <div className="grid grid-cols-4 gap-1 mt-1">
                    {[0.5, 1.0, 1.5, 2.0].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => changeSpeed(rate)}
                        className={`text-[10px] font-bold py-1 rounded-lg text-center transition ${
                          playbackSpeed === rate
                            ? 'bg-sky-500/10 text-sky-400'
                            : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quality */}
                {activeSession?.mode === 'transcode' && (
                  <div className="border-t border-slate-900 pt-2 mt-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase px-2 font-mono">
                      Stream Quality
                    </span>
                    <div className="flex flex-col gap-0.5 mt-1">
                      {['auto', '1080p', '720p', '480p'].map((quality) => (
                        <button
                          key={quality}
                          onClick={() => changeQuality(quality)}
                          className={`w-full text-left text-[11px] font-semibold px-2 py-1.5 rounded-lg transition ${
                            playbackQuality === quality
                              ? 'bg-sky-500/10 text-sky-400'
                              : 'text-slate-400 hover:bg-slate-900/60 hover:text-white'
                          }`}
                        >
                          {quality === 'auto' ? 'Auto (Adaptive)' : quality}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
