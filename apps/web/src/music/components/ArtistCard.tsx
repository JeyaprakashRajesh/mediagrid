import React, { useEffect, useState } from 'react';
import { Play, User } from 'lucide-react';
import { getThumbnailUrl } from './PlaylistCard';
import { getThumbnailGlow } from '../utils/coverTint';

interface ArtistCardProps {
  name: string;
  count: number;
  songs?: any[];
  onClick: () => void;
  onPlay: (e: React.MouseEvent) => void;
}

export const ArtistCard: React.FC<ArtistCardProps> = ({
  name,
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
        alignItems: 'center',
        padding: 10,
        cursor: 'pointer',
        height: '100%',
        minWidth: 140,
        position: 'relative',
        textAlign: 'center',
        borderRadius: 16,
        background: hovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
        border: '1px solid ' + (hovered ? 'rgba(255, 255, 255, 0.04)' : 'transparent'),
        transition: 'background 0.25s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Circular Profile Image Area */}
      <div
        style={{
          width: '85%',
          aspectRatio: '1 / 1',
          borderRadius: '50%',
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
          <User size={36} style={{ color: 'rgba(255, 255, 255, 0.4)', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.25))' }} />
        )}
        
        {/* Play Button Overlay */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onPlay(e);
          }}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.2s ease',
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: '#38bdf8',
              color: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)',
              transform: hovered ? 'scale(1)' : 'scale(0.8)',
              transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />
          </div>
        </div>
      </div>

      {/* Artist Name & Stats */}
      <div style={{ minWidth: 0, width: '100%' }}>
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
          {name}
        </h4>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 10,
            color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontWeight: 600,
          }}
        >
          {count === 1 ? '1 track' : `${count} tracks`}
        </p>
      </div>
    </div>
  );
};
