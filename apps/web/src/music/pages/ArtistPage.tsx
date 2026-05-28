import React, { useMemo } from 'react';
import { ArrowLeft, Play, User } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { SongRow } from '../components/SongRow';
import { AlbumCard } from '../components/AlbumCard';
import { getThumbnailUrl } from '../components/PlaylistCard';

interface ArtistPageProps {
  artistName: string;
  onBack: () => void;
}



export const ArtistPage: React.FC<ArtistPageProps> = ({ artistName, onBack }) => {
  const { mediaItems, activeAudio, audioPlaying, setAudioQueue, setAudioCurrentIndex, setActiveAudio, setAudioPlaying } = useAppStore();
  const [imgError, setImgError] = React.useState(false);

  const artistInfo = useMemo(() => {
    const songs = mediaItems.filter(item => item.artist === artistName);
    
    // Group songs by album name
    const albumMap = new Map<string, any[]>();
    for (const song of songs) {
      const alb = song.album || 'Single / Unknown Album';
      if (!albumMap.has(alb)) {
        albumMap.set(alb, []);
      }
      albumMap.get(alb)!.push(song);
    }

    const albumsList = Array.from(albumMap.entries()).map(([title, albumSongs]) => ({
      title,
      songs: albumSongs,
      count: albumSongs.length
    }));

    return {
      name: artistName,
      songs,
      albums: albumsList
    };
  }, [artistName, mediaItems]);

  const handlePlayArtist = () => {
    if (artistInfo.songs.length === 0) return;
    setAudioQueue(artistInfo.songs);
    setAudioCurrentIndex(0);
    setActiveAudio(artistInfo.songs[0]);
    setAudioPlaying(true);
  };

  const handlePlaySong = (idx: number) => {
    setAudioQueue(artistInfo.songs);
    setAudioCurrentIndex(idx);
    setActiveAudio(artistInfo.songs[idx]);
    setAudioPlaying(true);
  };



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingBottom: 64 }}>
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

      {/* Artist Hero Panel */}
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
        {/* Circular Profile Icon */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: '#1c1c1e',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.4)',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {artistInfo.songs.length > 0 && !imgError ? (
            <img
              src={getThumbnailUrl(artistInfo.songs[0])}
              alt=""
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <User size={48} />
          )}
        </div>

        {/* Details & Play */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, textAlign: window.innerWidth < 768 ? 'center' : 'left' }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
              Artist Profile
            </span>
            <h2 style={{ margin: '4px 0 0 0', fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
              {artistInfo.name}
            </h2>
            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
              {artistInfo.songs.length} tracks • {artistInfo.albums.length} albums indexed
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: window.innerWidth < 768 ? 'center' : 'flex-start' }}>
            <button
              onClick={handlePlayArtist}
              disabled={artistInfo.songs.length === 0}
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
                opacity: artistInfo.songs.length === 0 ? 0.5 : 1,
              }}
            >
              <Play size={14} fill="currentColor" /> Play Artist
            </button>
          </div>
        </div>
      </div>

      {/* Popular Tracks Section */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#cbd5e1', marginBottom: 16 }}>
          Popular Tracks
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {artistInfo.songs.map((song, idx) => (
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

      {/* Albums Grid Section */}
      {artistInfo.albums.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#cbd5e1', marginBottom: 16 }}>
            Albums
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 16 }}>
            {artistInfo.albums.map(alb => (
              <AlbumCard
                key={alb.title}
                title={alb.title}
                artist={artistInfo.name}
                count={alb.count}
                onClick={() => {
                  window.location.hash = `#/library/music/album/${encodeURIComponent(alb.title)}`;
                }}
                onPlay={() => {
                  setAudioQueue(alb.songs);
                  setAudioCurrentIndex(0);
                  setActiveAudio(alb.songs[0]);
                  setAudioPlaying(true);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
