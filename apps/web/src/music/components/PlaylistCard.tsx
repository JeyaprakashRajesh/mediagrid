import React, { useEffect, useState } from 'react';
import { Play, Music } from 'lucide-react';
import type { MediaItem } from '@mediagrid/types';
import { buildRuntimeUrl } from '@mediagrid/api';
import { getThumbnailGlow } from '../utils/coverTint';

interface PlaylistCardProps {
  id: string;
  name: string;
  count: number;
  songs?: any[];
  onClick: () => void;
  onPlay: (e: React.MouseEvent) => void;
  previewColors?: string;
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

const getDeterministicLastUpdated = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const val = Math.abs(hash) % 5;
  if (val === 0) return 'Updated today';
  if (val === 1) return 'Updated yesterday';
  if (val === 2) return 'Updated 2 days ago';
  if (val === 3) return 'Updated 3 days ago';
  return 'Updated last week';
};

type ThumbnailSource = string | Pick<MediaItem, 'id' | 'thumbnailPath'>;

export const getThumbnailUrl = (source: ThumbnailSource) => {
  const token = localStorage.getItem('mediagrid_token');
  const isStringId = typeof source === 'string';
  const thumbnailPath = isStringId ? null : source.thumbnailPath;
  const urlPath = thumbnailPath
    ? `/media-file/${encodeURIComponent(thumbnailPath)}`
    : `/media/thumbnail/${isStringId ? source : source.id}`;
  if (!token) return buildRuntimeUrl(urlPath);
  return buildRuntimeUrl(`${urlPath}${urlPath.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`);
};

export const PlaylistCover: React.FC<{ songs?: any[] }> = ({ songs }) => {
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});

  const handleImgError = (idx: number) => {
    setImgErrors(prev => ({ ...prev, [idx]: true }));
  };

  if (songs && songs.length >= 4) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', width: '100%', height: '100%', overflow: 'hidden' }}>
        {[0, 1, 2, 3].map(idx => {
          const song = songs[idx];
          const hasError = imgErrors[idx];
          if (song && !hasError) {
            return (
              <img
                key={song.id}
                src={getThumbnailUrl(song)}
                alt=""
                onError={() => handleImgError(idx)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', boxShadow: '0 0 30px rgba(56, 189, 248, 0.34)' }}
              />
            );
          }
          return <div key={idx} style={{ width: '100%', height: '100%', background: idx % 2 === 0 ? '#1c1c1e' : '#262629' }} />;
        })}
      </div>
    );
  }

  if (songs && songs.length > 0) {
    const firstSong = songs[0];
    const hasError = imgErrors[0];
    if (firstSong && !hasError) {
      return (
        <img
          src={getThumbnailUrl(firstSong)}
          alt=""
          onError={() => handleImgError(0)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', boxShadow: '0 0 30px rgba(56, 189, 248, 0.34)' }}
        />
      );
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#1c1c1e', color: 'rgba(255,255,255,0.4)' }}>
      <Music size={32} />
    </div>
  );
};

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
  name,
  count,
  songs,
  onClick,
  onPlay,
}) => {
  const [hovered, setHovered] = useState(false);
  const [coverGlow, setCoverGlow] = useState('0 0 0 1px rgba(255, 255, 255, 0.06)');

  useEffect(() => {
    let cancelled = false;
    const firstSong = songs?.[0];
    if (!firstSong) return;

    getThumbnailGlow(getThumbnailUrl(firstSong)).then((glow) => {
      if (!cancelled) {
        setCoverGlow(glow);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [songs?.[0]?.id, songs?.[0]?.thumbnailPath]);

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
      {/* Artwork Area */}
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
        <PlaylistCover songs={songs} />
        
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

      {/* Playlist Meta */}
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
          {name}
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
            {count} {count === 1 ? 'Song' : 'Songs'}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>
            {formatEstimatedDuration(count)} • {getDeterministicLastUpdated(name)}
          </span>
        </div>
      </div>
    </div>
  );
};
