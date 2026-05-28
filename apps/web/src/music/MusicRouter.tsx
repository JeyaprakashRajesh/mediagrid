import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { usePlaylistStore } from './store/playlistStore';
import { MusicHome } from './pages/MusicHome';
import { PlaylistPage } from './pages/PlaylistPage';
import { AlbumPage } from './pages/AlbumPage';
import { ArtistPage } from './pages/ArtistPage';
import './music.css';

export const MusicRouter: React.FC = () => {
  const { currentFolderPath } = useAppStore();
  const { fetchPlaylists } = usePlaylistStore();

  // Load playlists on mount
  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const handleBack = () => {
    window.location.hash = '#/library/music';
  };

  // Sub-routing logic based on currentFolderPath
  if (!currentFolderPath) {
    return <MusicHome />;
  }

  if (currentFolderPath.startsWith('playlist/')) {
    return <PlaylistPage playlistId={currentFolderPath} onBack={handleBack} />;
  }

  if (currentFolderPath.startsWith('album/')) {
    const albumName = decodeURIComponent(currentFolderPath.substring(6));
    return <AlbumPage albumName={albumName} onBack={handleBack} />;
  }

  if (currentFolderPath.startsWith('artist/')) {
    const artistName = decodeURIComponent(currentFolderPath.substring(7));
    return <ArtistPage artistName={artistName} onBack={handleBack} />;
  }

  // Fallback for legacy folder playlists or folder-prefixed paths
  return <PlaylistPage playlistId={currentFolderPath} onBack={handleBack} />;
};
export default MusicRouter;
