import React, { useMemo } from 'react';
import { ArrowLeft, Play, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { usePlaylistStore } from '../store/playlistStore';
import { SongRow } from '../components/SongRow';
import { PlaylistCover } from '../components/PlaylistCard';

interface PlaylistPageProps {
  playlistId: string;
  onBack: () => void;
}



export const PlaylistPage: React.FC<PlaylistPageProps> = ({ playlistId, onBack }) => {
  const { mediaItems, activeAudio, audioPlaying, setAudioQueue, setAudioCurrentIndex, setActiveAudio, setAudioPlaying } = useAppStore();
  const { playlists, deletePlaylist } = usePlaylistStore();

  // Find playlist name and isFolder prefix
  const isFolder = playlistId.startsWith('folder/');
  
  let actualId = playlistId;
  if (playlistId.startsWith('folder/')) {
    actualId = playlistId.substring(7);
  } else if (playlistId.startsWith('playlist/')) {
    actualId = playlistId.substring(9);
  }

  const getPlaylistNameForItem = (itemPath: string) => {
    const normalized = itemPath.replace(/\\/g, '/');
    const idx = normalized.indexOf('media/music');
    if (idx === -1) return null;
    const rel = normalized.substring(idx + 'media/music'.length + 1);
    const parts = rel.split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] : null;
  };

  // Retrieve playlist songs
  const playlistInfo = useMemo(() => {
    if (actualId === 'all-songs' || actualId === 'all-music') {
      return {
        name: 'All Songs',
        songs: mediaItems,
        isCustom: false,
        id: 'playlist/all-songs',
        description: 'All tracks in your library'
      };
    }

    if (isFolder) {
      const songs = mediaItems.filter(item => getPlaylistNameForItem(item.path) === actualId);
      return {
        name: actualId,
        songs,
        isCustom: false,
        id: playlistId,
        description: 'Directory Sync'
      };
    } else {
      // Database playlist
      const dbPl = playlists.find(p => p.id === actualId || p.name === actualId);
      if (dbPl) {
        const mediaIds = dbPl.media_ids ?? dbPl.mediaIds ?? [];
        const byId = new Map(mediaItems.map(item => [item.id, item]));
        const songs = mediaIds.map(id => byId.get(id)).filter(Boolean) as any[];
        return {
          name: dbPl.name,
          songs,
          isCustom: true,
          id: dbPl.id,
          description: 'Custom playlist'
        };
      }
      
      // Fallback for legacy simple hash paths
      const songs = mediaItems.filter(item => getPlaylistNameForItem(item.path) === actualId);
      return {
        name: actualId,
        songs,
        isCustom: false,
        id: playlistId,
        description: 'Folder Sync'
      };
    }
  }, [playlistId, isFolder, actualId, mediaItems, playlists]);

  const handlePlayPlaylist = () => {
    if (playlistInfo.songs.length === 0) return;
    setAudioQueue(playlistInfo.songs);
    setAudioCurrentIndex(0);
    setActiveAudio(playlistInfo.songs[0]);
    setAudioPlaying(true);
  };

  const handlePlaySong = (idx: number) => {
    setAudioQueue(playlistInfo.songs);
    setAudioCurrentIndex(idx);
    setActiveAudio(playlistInfo.songs[idx]);
    setAudioPlaying(true);
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete the playlist "${playlistInfo.name}"?`)) return;
    const success = await deletePlaylist(playlistInfo.id);
    if (success) {
      onBack();
    } else {
      alert('Failed to delete playlist');
    }
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

      {/* Hero Header Card */}
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
        {/* Cover Art */}
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
          <PlaylistCover songs={playlistInfo.songs} />
        </div>

        {/* Details & Actions */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, textAlign: window.innerWidth < 768 ? 'center' : 'left' }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
              {playlistInfo.isCustom ? 'Custom Playlist' : 'Directory Sync'}
            </span>
            <h2 style={{ margin: '4px 0 0 0', fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
              {playlistInfo.name}
            </h2>
            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
              {playlistInfo.songs.length === 1 ? '1 track' : `${playlistInfo.songs.length} tracks`} available for stream
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: window.innerWidth < 768 ? 'center' : 'flex-start' }}>
            <button
              onClick={handlePlayPlaylist}
              disabled={playlistInfo.songs.length === 0}
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
                opacity: playlistInfo.songs.length === 0 ? 0.5 : 1,
              }}
            >
              <Play size={14} fill="currentColor" /> Play
            </button>

            {playlistInfo.isCustom && (
              <button
                onClick={handleDelete}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  borderRadius: 99,
                  background: 'rgba(255, 69, 58, 0.1)',
                  border: '1px solid rgba(255, 69, 58, 0.2)',
                  color: '#ff453a',
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Song List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {playlistInfo.songs.map((song, idx) => (
          <SongRow
            key={song.id + '-' + idx}
            item={song}
            index={idx}
            isActive={activeAudio?.id === song.id}
            isPlaying={audioPlaying}
            onPlay={() => handlePlaySong(idx)}
            playlistId={playlistInfo.isCustom ? playlistInfo.id : undefined}
          />
        ))}
        {playlistInfo.songs.length === 0 && (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              border: '1px dashed rgba(255,255,255,0.06)',
              borderRadius: 24,
              fontSize: 13,
              color: '#64748b',
            }}
          >
            No tracks in this playlist
          </div>
        )}
      </div>
    </div>
  );
};
