import React, { useMemo } from 'react';
import { ArrowLeft, Play, Disc } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { SongRow } from '../components/SongRow';
import { getThumbnailUrl } from '../components/PlaylistCard';

interface AlbumPageProps {
  albumName: string;
  onBack: () => void;
}



export const AlbumPage: React.FC<AlbumPageProps> = ({ albumName, onBack }) => {
  const { mediaItems, activeAudio, audioPlaying, setAudioQueue, setAudioCurrentIndex, setActiveAudio, setAudioPlaying } = useAppStore();
  const [imgError, setImgError] = React.useState(false);

  const albumInfo = useMemo(() => {
    const songs = mediaItems.filter(item => item.album === albumName);
    const artist = songs[0]?.artist || 'Unknown Artist';
    return {
      title: albumName,
      artist,
      songs,
    };
  }, [albumName, mediaItems]);

  const handlePlayAlbum = () => {
    if (albumInfo.songs.length === 0) return;
    setAudioQueue(albumInfo.songs);
    setAudioCurrentIndex(0);
    setActiveAudio(albumInfo.songs[0]);
    setAudioPlaying(true);
  };

  const handlePlaySong = (idx: number) => {
    setAudioQueue(albumInfo.songs);
    setAudioCurrentIndex(idx);
    setActiveAudio(albumInfo.songs[idx]);
    setAudioPlaying(true);
  };



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 64 }}>
      {/* Back button */}
      <div>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            fontWeight: 800,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          <ArrowLeft size={16} /> Back to Library
        </button>
      </div>

      {/* Album Hero Header */}
      <div
        style={{
          display: 'flex',
          flexDirection: window.innerWidth < 768 ? 'column' : 'row',
          padding: '16px 8px',
          gap: 24,
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
          background: 'transparent',
        }}
      >
        {/* CD Album Cover */}
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: 16,
            background: '#1c1c1e',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.4)',
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {albumInfo.songs.length > 0 && !imgError ? (
            <img
              src={getThumbnailUrl(albumInfo.songs[0])}
              alt=""
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <>
              <div style={{ position: 'absolute', width: '90%', height: '90%', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)' }} />
              <div style={{ position: 'absolute', width: '70%', height: '70%', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.03)' }} />
              <Disc size={48} />
            </>
          )}
        </div>

        {/* Album Metadata */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, textAlign: window.innerWidth < 768 ? 'center' : 'left' }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
              Album
            </span>
            <h2 style={{ margin: '4px 0 0 0', fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
              {albumInfo.title}
            </h2>
            <p style={{ margin: '6px 0 0 0', fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
              {albumInfo.artist}
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748b' }}>
              {albumInfo.songs.length} tracks
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: window.innerWidth < 768 ? 'center' : 'flex-start' }}>
            <button
              onClick={handlePlayAlbum}
              disabled={albumInfo.songs.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 24px',
                borderRadius: 99,
                background: '#38bdf8',
                color: '#0f172a',
                fontSize: 12,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                boxShadow: '0 6px 20px rgba(56, 189, 248, 0.35)',
                opacity: albumInfo.songs.length === 0 ? 0.5 : 1,
              }}
            >
              <Play size={14} fill="currentColor" /> Play Album
            </button>
          </div>
        </div>
      </div>

      {/* Song List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {albumInfo.songs.map((song, idx) => (
          <SongRow
            key={song.id + '-' + idx}
            item={song}
            index={idx}
            isActive={activeAudio?.id === song.id}
            isPlaying={audioPlaying}
            onPlay={() => handlePlaySong(idx)}
          />
        ))}
      </div>
    </div>
  );
};
