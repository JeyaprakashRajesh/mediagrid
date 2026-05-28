import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
  ListMusic,
  Disc,
} from 'lucide-react';
import { buildRuntimeUrl } from '@mediagrid/api';
import { useAppStore } from '../store/useAppStore';

export const MusicPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  // Helper: append ?token= so the <audio> element can authenticate
  const buildStreamUrl = (mediaId: string): string => {
    const token = localStorage.getItem('mediagrid_token');
    const base = buildRuntimeUrl(`/audio/stream/${encodeURIComponent(mediaId)}`);
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  };

  const appendTokenIfNeeded = (url: string): string => {
    const token = localStorage.getItem('mediagrid_token');
    if (!token) return url;

    const absoluteUrl = url.startsWith('http') ? url : buildRuntimeUrl(url);
    const parsedUrl = new URL(absoluteUrl);

    if (!parsedUrl.searchParams.has('token')) {
      parsedUrl.searchParams.set('token', token);
    }

    return parsedUrl.toString();
  };

  const resolvePlayableAudioUrl = async (mediaId: string): Promise<string> => {
    const streamUrl = buildStreamUrl(mediaId);
    const response = await fetch(streamUrl);
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = await response.json() as { url?: string };
      if (payload.url) {
        return appendTokenIfNeeded(payload.url);
      }
    }

    return streamUrl;
  };

  const {
    activeAudio,
    audioQueue,
    audioShuffle,
    audioRepeat,
    audioPlaying,
    audioCurrentIndex,
    setAudioPlaying,
    setAudioCurrentIndex,
    setActiveAudio,
    playNextAudio,
    playPrevAudio,
    setAudioShuffle,
    setAudioRepeat,
  } = useAppStore();

  // 1. Sync playing state and audio source
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeAudio) return;

    let active = true;

    setCurrentTime(0);
    setDuration(0);

    const loadAudio = async () => {
      const streamUrl = await resolvePlayableAudioUrl(activeAudio.id);
      if (!active || !audioRef.current) return;

      if (audio.src !== streamUrl) {
        audio.src = streamUrl;
        audio.load();
      }

      if (audioPlaying) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    };

    void loadAudio();

    return () => {
      active = false;
    };
  }, [activeAudio, audioPlaying]);

  // 2. Play/Pause toggle
  const togglePlay = () => {
    setAudioPlaying(!audioPlaying);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const vol = parseFloat(e.target.value);
    audio.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  };

  const handleEnded = () => {
    if (audioRepeat === 'one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    } else {
      playNextAudio();
    }
  };

  const toggleShuffle = () => {
    setAudioShuffle(!audioShuffle);
  };

  const toggleRepeat = () => {
    const nextRepeatMap: Record<typeof audioRepeat, typeof audioRepeat> = {
      none: 'all',
      all: 'one',
      one: 'none',
    };
    setAudioRepeat(nextRepeatMap[audioRepeat]);
  };

  const selectQueueItem = (index: number) => {
    setAudioCurrentIndex(index);
    setActiveAudio(audioQueue[index]);
    setAudioPlaying(true);
    setShowQueue(false);
  };

  if (!activeAudio) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 h-20 bg-slate-950/95 border-t border-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between z-40 select-none">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Track info panel */}
      <div className="flex items-center gap-3.5 w-1/4 min-w-[200px]">
        <div className="w-12 h-12 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl flex items-center justify-center relative overflow-hidden group shadow-md shadow-sky-500/5">
          <Disc size={20} className={`${audioPlaying ? 'animate-spin' : ''} transition-all duration-1000`} style={{ animationDuration: '4s' }} />
        </div>
        <div className="truncate">
          <h4 className="text-sm font-bold text-white truncate" title={activeAudio.title}>
            {activeAudio.title}
          </h4>
          <p className="text-[11px] text-slate-400 font-semibold truncate mt-0.5" title={activeAudio.artist || 'Unknown Artist'}>
            {activeAudio.artist || 'Unknown Artist'}
          </p>
        </div>
      </div>

      {/* Center: Playback Controls & Progress Bar */}
      <div className="flex flex-col items-center gap-1.5 w-2/5">
        <div className="flex items-center gap-6">
          {/* Shuffle */}
          <button
            onClick={toggleShuffle}
            className={`p-1 rounded transition ${
              audioShuffle ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Shuffle"
          >
            <Shuffle size={15} />
          </button>

          {/* Prev */}
          <button
            onClick={playPrevAudio}
            disabled={audioQueue.length <= 1}
            className="text-slate-400 hover:text-white transition disabled:opacity-30 disabled:pointer-events-none"
            title="Previous"
          >
            <SkipBack size={18} fill="currentColor" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="p-2.5 rounded-full bg-sky-500 hover:bg-sky-400 text-slate-950 transition hover:scale-105 active:scale-95 shadow-md shadow-sky-500/15"
          >
            {audioPlaying ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" className="translate-x-0.5" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={playNextAudio}
            disabled={audioQueue.length <= 1}
            className="text-slate-400 hover:text-white transition disabled:opacity-30 disabled:pointer-events-none"
            title="Next"
          >
            <SkipForward size={18} fill="currentColor" />
          </button>

          {/* Repeat */}
          <button
            onClick={toggleRepeat}
            className={`p-1 rounded transition relative ${
              audioRepeat !== 'none' ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'
            }`}
            title={`Repeat: ${audioRepeat}`}
          >
            <Repeat size={15} />
            {audioRepeat === 'one' && (
              <span className="absolute -top-1 -right-1 text-[7px] font-bold bg-sky-500 text-slate-950 rounded-full w-2.5 h-2.5 flex items-center justify-center scale-90">
                1
              </span>
            )}
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 w-full">
          <span className="text-[10px] font-mono text-slate-500 w-8 text-right">
            {Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer accent-sky-400 outline-none transition"
          />
          <span className="text-[10px] font-mono text-slate-500 w-8">
            {Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Right Controls: Volume & Queue Toggle */}
      <div className="flex items-center justify-end gap-5 w-1/4 relative">
        {/* Volume */}
        <div className="flex items-center gap-2 group">
          <button
            onClick={toggleMute}
            className="text-slate-400 hover:text-white transition p-1 hover:bg-slate-900 rounded"
          >
            {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 accent-sky-400 h-1 rounded appearance-none bg-slate-800 cursor-pointer"
          />
        </div>

        {/* Queue Button */}
        <button
          onClick={() => setShowQueue(!showQueue)}
          className={`p-2 rounded-lg transition hover:bg-slate-900 ${
            showQueue ? 'text-sky-400 bg-slate-900' : 'text-slate-400 hover:text-white'
          }`}
          title="Play Queue"
        >
          <ListMusic size={18} />
        </button>

        {/* Queue List Overlay */}
        {showQueue && (
          <div className="absolute bottom-20 right-0 w-80 max-h-96 rounded-2xl bg-slate-950/95 border border-slate-900 p-4 shadow-2xl backdrop-blur-md flex flex-col z-50 animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex justify-between items-center border-b border-slate-900 pb-2 mb-2.5">
              <h3 className="text-xs font-bold text-white tracking-wide uppercase font-mono">
                Play Queue ({audioQueue.length} tracks)
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1.5 scrollbar-thin">
              {audioQueue.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => selectQueueItem(idx)}
                  className={`w-full flex items-center justify-between text-left p-2 rounded-xl text-xs font-semibold transition ${
                    audioCurrentIndex === idx
                      ? 'bg-sky-500/10 text-sky-400'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <span className="truncate max-w-[180px]">{item.title}</span>
                  <span className="text-[10px] text-slate-500 font-medium truncate max-w-[80px]">
                    {item.artist || 'Unknown'}
                  </span>
                </button>
              ))}
              {audioQueue.length === 0 && (
                <div className="text-center text-slate-500 text-xs py-8 font-mono">
                  Queue is empty
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
