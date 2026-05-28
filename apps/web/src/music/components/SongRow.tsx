import React, { useEffect, useState } from 'react';
import { Play, Pause, Heart, MoreVertical, Plus, Trash2, ListPlus, Music } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useQueueStore } from '../store/queueStore';
import { usePlaylistStore } from '../store/playlistStore';
import type { MediaItem } from '@mediagrid/types';
import { getThumbnailUrl } from './PlaylistCard';
import { getThumbnailGlow } from '../utils/coverTint';

interface SongRowProps {
  item: MediaItem;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  playlistId?: string;
}

const formatSize = (bytes?: number | null) => {
  if (!bytes) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getAudioFormatLabel = (item: any) => {
  const mime = (item.mimeType || '').toLowerCase();
  const path = (item.path || '').toLowerCase();
  if (mime.includes('flac') || path.endsWith('.flac')) return 'FLAC';
  if (mime.includes('wav') || path.endsWith('.wav')) return 'WAV';
  if (mime.includes('mp4') || path.endsWith('.mp4') || path.endsWith('.m4a')) return 'AAC';
  if (mime.includes('mpeg') || path.endsWith('.mp3')) return 'MP3';
  return 'AUDIO';
};

export const SongRow: React.FC<SongRowProps> = ({
  item,
  index,
  isActive,
  isPlaying,
  onPlay,
  playlistId,
}) => {
  const [hovered, setHovered] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [thumbnailGlow, setThumbnailGlow] = useState('0 0 0 1px rgba(255, 255, 255, 0.06)');

  const { likedSongs, toggleLikeSong } = usePlayerStore();
  const { addToQueue, addNext } = useQueueStore();
  const { addSongToPlaylist, removeSongFromPlaylist, playlists, createPlaylist } = usePlaylistStore();

  const isLiked = likedSongs.includes(item.id);
  const formatLabel = getAudioFormatLabel(item);

  useEffect(() => {
    let cancelled = false;

    getThumbnailGlow(getThumbnailUrl(item)).then((glow) => {
      if (!cancelled) {
        setThumbnailGlow(glow);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [item.id, item.thumbnailPath]);

  const handleDropdownAction = (action: string) => {
    setShowDropdown(false);
    if (action === 'add-queue') {
      addToQueue(item);
    } else if (action === 'play-next') {
      addNext(item);
    } else if (action === 'add-playlist') {
      const name = window.prompt(
        `Choose playlist:\n\nAvailable:\n${playlists.map((p) => p.name).join('\n')}\n\nType playlist name to add or create:`
      );
      if (!name) return;
      const trimmed = name.trim();
      if (!trimmed) return;

      const target = playlists.find((p) => p.name.toLowerCase() === trimmed.toLowerCase() || p.id === trimmed);
      if (target) {
        addSongToPlaylist(target.id, item.id);
      } else {
        createPlaylist(trimmed, [item.id]);
      }
    } else if (action === 'remove-playlist' && playlistId) {
      removeSongFromPlaylist(playlistId, item.id);
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setShowDropdown(false);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        background: isActive ? 'rgba(255, 255, 255, 0.03)' : hovered ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
        transition: 'background 0.2s',
        cursor: 'pointer',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Play/Index indicator */}
      <div 
        onClick={onPlay}
        className="music-index-hide-sm"
        style={{ 
          width: 32, 
          height: 32, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          fontSize: 13, 
          color: isActive ? '#38bdf8' : '#64748b',
          fontWeight: 600,
        }}
      >
        {hovered ? (
          isPlaying && isActive ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" />
          )
        ) : isActive && isPlaying ? (
          /* Animated playing indicator */
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 12 }}>
            <div style={{ width: 2, height: 12, background: '#38bdf8', animation: 'music-wave-bar 1.2s ease infinite alternate' }} />
            <div style={{ width: 2, height: 6, background: '#38bdf8', animation: 'music-wave-bar 0.8s ease infinite alternate-reverse' }} />
            <div style={{ width: 2, height: 10, background: '#38bdf8', animation: 'music-wave-bar 1.0s ease infinite alternate' }} />
          </div>
        ) : (
          index + 1
        )}
      </div>

      {/* Album Artwork */}
      <div 
        onClick={onPlay}
        style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          background: '#1c1c1e',
          boxShadow: `0 2px 8px rgba(0,0,0,0.22), ${thumbnailGlow}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.4)',
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'box-shadow 280ms ease',
        }}
      >
        {!imgError ? (
          <img
            src={getThumbnailUrl(item)}
            alt=""
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', boxShadow: '0 0 30px rgba(56, 189, 248, 0.34)' }}
          />
        ) : (
          <Music size={16} />
        )}
      </div>

      {/* Title & Artist info */}
      <div onClick={onPlay} style={{ flex: 1, minWidth: 0 }}>
        <div 
          style={{ 
            fontSize: 13.5, 
            fontWeight: 500, 
            color: isActive ? '#38bdf8' : '#f8fafc',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.title}
        </div>
        <div 
          style={{ 
            fontSize: 11, 
            color: 'rgba(255,255,255,0.4)', 
            marginTop: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.artist || 'Unknown Artist'} {item.album && `• ${item.album}`}
        </div>
      </div>

      {/* Badges - Hidden on mobile */}
      <div 
        onClick={onPlay}
        style={{ display: 'flex', alignItems: 'center', gap: 8 }} 
        className="music-badge-hide-sm"
      >
        <span 
          style={{ 
            padding: '3px 8px', 
            borderRadius: 6, 
            border: '1px solid rgba(255,255,255,0.06)', 
            background: 'rgba(255,255,255,0.02)', 
            fontSize: 9, 
            fontWeight: 700, 
            color: '#94a3b8',
            letterSpacing: '0.05em'
          }}
        >
          {formatLabel}
        </span>
        <span 
          style={{ 
            fontSize: 11, 
            color: '#64748b', 
            minWidth: 50, 
            textAlign: 'right',
            fontFamily: 'monospace'
          }}
        >
          {formatSize(item.sizeBytes)}
        </span>
      </div>

      {/* Liked / Options */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleLikeSong(item.id);
          }}
          style={{
            padding: 8,
            borderRadius: '50%',
            color: isLiked ? '#38bdf8' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s',
          }}
        >
          <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDropdown(!showDropdown);
          }}
          style={{
            padding: 8,
            borderRadius: '50%',
            color: hovered || showDropdown ? '#f8fafc' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s',
          }}
        >
          <MoreVertical size={15} />
        </button>

        {/* Dropdown Menu */}
        {showDropdown && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              zIndex: 99,
              width: 170,
              background: 'rgba(24, 24, 28, 0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <button
              onClick={() => handleDropdownAction('play-next')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 8,
                fontSize: 12,
                color: '#e2e8f0',
                width: '100%',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Play size={12} /> Play Next
            </button>
            <button
              onClick={() => handleDropdownAction('add-queue')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 8,
                fontSize: 12,
                color: '#e2e8f0',
                width: '100%',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <ListPlus size={12} /> Add to Queue
            </button>
            <button
              onClick={() => handleDropdownAction('add-playlist')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 8,
                fontSize: 12,
                color: '#e2e8f0',
                width: '100%',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Plus size={12} /> Add to Playlist
            </button>
            {playlistId && (
              <button
                onClick={() => handleDropdownAction('remove-playlist')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#ff453a',
                  width: '100%',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 69, 58, 0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Trash2 size={12} /> Remove
              </button>
            )}
          </div>
        )}
      </div>

      {/* Style for animation wave */}
      <style>{`
        @keyframes music-wave-bar {
          0% { height: 3px; }
          100% { height: 13px; }
        }
      `}</style>
    </div>
  );
};
