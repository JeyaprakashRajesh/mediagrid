import React, { useEffect, useState } from 'react';
import { Play, Disc } from 'lucide-react';
import { getThumbnailUrl } from './PlaylistCard';
import { getThumbnailGlow } from '../utils/coverTint';

interface AlbumCardProps {
  title: string;
  artist: string;
  count: number;
  songs?: any[];
  onClick: () => void;
  onPlay: (e: React.MouseEvent) => void;
}

const formatEstimatedDuration = (songCount: number) => {
  const totalSeconds = songCount * 215; // 3 min 35 sec average per song
  if (totalSeconds < 3600) {
    const mins = Math.max(1, Math.floor(totalSeconds / 60));
    return `${mins}m`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${mins}m`;
};

export const AlbumCard: React.FC<AlbumCardProps> = ({
  title,
  artist,
  count,
  songs,
  onClick,
  onPlay,
}) => {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [coverGlow, setCoverGlow] = useState('0 0 0 1px rgba(255, 255, 255, 0.06)');

  const firstSong = songs && songs.length > 0 ? songs[0] : null;
  const coverUrl = firstSong && !imgError ? getThumbnailUrl(firstSong) : null;

  useEffect(() => {
    let cancelled = false;
    if (!firstSong) return;

    getThumbnailGlow(getThumbnailUrl(firstSong)).then((glow) => {
      if (!cancelled) {
        setCoverGlow(glow);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [firstSong?.id, firstSong?.thumbnailPath]);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="spring-transition spring-click"
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 10,
        cursor: 'pointer',
        height: '100%',
        minWidth: 140,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        background: hovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
        border: '1px solid ' + (hovered ? 'rgba(255, 255, 255, 0.04)' : 'transparent'),
        transition: 'background 0.25s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Vinyl/CD visual art */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: 12,
          background: '#1c1c1e',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 4px 16px rgba(0, 0, 0, 0.28), ${coverGlow}`,
          overflow: 'hidden',
          marginBottom: 10,
          transition: 'box-shadow 280ms ease',
        }}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', boxShadow: '0 0 30px rgba(56, 189, 248, 0.34)' }}
          />
        ) : (
          <>
            {/* Disc groove lines */}
            <div style={{ position: 'absolute', width: '80%', height: '80%', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)' }} />
            <div style={{ position: 'absolute', width: '60%', height: '60%', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.04)' }} />
            
            <Disc size={36} style={{ color: 'rgba(255, 255, 255, 0.4)', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.3))' }} />
          </>
        )}
        
        {/* Floating Play Button */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onPlay(e);
          }}
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#38bdf8',
            color: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)',
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.9)',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
            cursor: 'pointer',
            zIndex: 2,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.08)';
            e.currentTarget.style.background = '#64d2ff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.background = '#38bdf8';
          }}
        >
          <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />
        </div>
      </div>

      {/* Album Text */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <h4
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: '#FFFFFF',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {artist || 'Unknown Artist'}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>
            {count} {count === 1 ? 'Track' : 'Tracks'} • {formatEstimatedDuration(count)}
          </span>
        </div>
      </div>
    </div>
  );
};
