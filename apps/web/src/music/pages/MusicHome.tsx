import React, { useMemo, useState, useEffect } from 'react';
import { Search, Disc, FolderOpen, User, Music, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { usePlayerStore } from '../store/playerStore';
import { usePlaylistStore } from '../store/playlistStore';
import { PlaylistCard, PlaylistCover, getThumbnailUrl } from '../components/PlaylistCard';
import { AlbumCard } from '../components/AlbumCard';
import { ArtistCard } from '../components/ArtistCard';
import { ProgressBar } from '../components/ProgressBar';
import { getThumbnailGlow } from '../utils/coverTint';

// Helper to get greeting by time
const getGreeting = () => {
  const hr = new Date().getHours();
  if (hr < 12) return 'Good Morning';
  if (hr < 17) return 'Good Afternoon';
  return 'Good Evening';
};



const getPlaylistNameForItem = (itemPath: string) => {
  const normalized = itemPath.replace(/\\/g, '/');
  const idx = normalized.indexOf('media/music');
  if (idx === -1) return null;
  const rel = normalized.substring(idx + 'media/music'.length + 1);
  const parts = rel.split('/').filter(Boolean);
  return parts.length > 1 ? parts[0] : null;
};

export const MusicHome: React.FC = () => {
  const { 
    mediaItems, 
    websocketStatus, 
    setAudioQueue, 
    setAudioCurrentIndex, 
    setActiveAudio, 
    setAudioPlaying,
    activeAudio,
    audioPlaying,
    audioQueue,
    playNextAudio,
    playPrevAudio 
  } = useAppStore();
  const { playlists } = usePlaylistStore();
  const { 
    recentlyPlayed, 
    addRecentlyPlayed,
    currentTime,
    duration,
    setCurrentTime
  } = usePlayerStore();

  const targetRecentItem = useMemo(() => {
    if (recentlyPlayed.length > 0) return recentlyPlayed[0];
    return {
      id: 'all-songs',
      name: 'All Songs',
      type: 'playlist' as const,
    };
  }, [recentlyPlayed]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [nowPlayingImgError, setNowPlayingImgError] = useState(false);
  const [nowPlayingGlow, setNowPlayingGlow] = useState('0 0 0 1px rgba(255, 255, 255, 0.06)');

  useEffect(() => {
    setNowPlayingImgError(false);
  }, [activeAudio?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!activeAudio) return;

    getThumbnailGlow(getThumbnailUrl(activeAudio)).then((glow) => {
      if (!cancelled) {
        setNowPlayingGlow(glow);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeAudio?.id, activeAudio?.thumbnailPath]);

  // Group mediaItems into folder-based playlists
  const folderPlaylists = useMemo(() => {
    const map = new Map<string, { name: string; songs: any[] }>();
    for (const item of mediaItems) {
      const name = getPlaylistNameForItem(item.path);
      if (!name) continue;
      if (!map.has(name)) {
        map.set(name, { name, songs: [] });
      }
      map.get(name)!.songs.push(item);
    }
    return Array.from(map.values()).map(x => ({
      id: `folder:${x.name}`,
      name: x.name,
      songs: x.songs,
      count: x.songs.length,
      path: x.name,
      isFolder: true
    }));
  }, [mediaItems]);

  // Combine user-created database playlists + folder playlists + all-songs virtual playlist
  const allPlaylists = useMemo(() => {
    const allSongsPlaylist = {
      id: 'all-songs',
      name: 'All Songs',
      songs: mediaItems,
      count: mediaItems.length,
      path: 'all-songs',
      isFolder: false,
      description: 'All tracks in your library'
    };

    const dbPlaylists = playlists.map(p => {
      const mediaIds = p.media_ids ?? p.mediaIds ?? [];
      const byId = new Map(mediaItems.map(item => [item.id, item]));
      const songs = mediaIds.map(id => byId.get(id)).filter(Boolean) as any[];
      return {
        id: `db:${p.id}`,
        name: p.name,
        songs,
        count: songs.length,
        path: p.id,
        isFolder: false,
        description: 'Custom playlist'
      };
    });

    return [allSongsPlaylist, ...dbPlaylists, ...folderPlaylists];
  }, [playlists, folderPlaylists, mediaItems]);

  // Group into Albums
  const albums = useMemo(() => {
    const map = new Map<string, { title: string; artist: string; songs: any[] }>();
    for (const item of mediaItems) {
      const alb = item.album || 'Unknown Album';
      const art = item.artist || 'Unknown Artist';
      const key = `${alb}-${art}`;
      if (!map.has(key)) {
        map.set(key, { title: alb, artist: art, songs: [] });
      }
      map.get(key)!.songs.push(item);
    }
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [mediaItems]);

  // Group into Artists
  const artists = useMemo(() => {
    const map = new Map<string, { name: string; songs: any[] }>();
    for (const item of mediaItems) {
      const art = item.artist || 'Unknown Artist';
      if (!map.has(art)) {
        map.set(art, { name: art, songs: [] });
      }
      map.get(art)!.songs.push(item);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [mediaItems]);

  // Quick picks: 4 playlists or albums for the grid
  const quickPicks = useMemo(() => {
    return allPlaylists.slice(0, 3);
  }, [allPlaylists]);

  const targetRecentSong = useMemo(() => {
    if (targetRecentItem.type !== 'song') return null;
    return mediaItems.find((item) => item.id === targetRecentItem.id) ?? null;
  }, [targetRecentItem, mediaItems]);

  const targetRecentSongs = useMemo(() => {
    if (targetRecentItem.type === 'song') {
      return targetRecentSong ? [targetRecentSong] : [];
    }
    if (targetRecentItem.id === 'all-songs') return mediaItems;
    const matched = allPlaylists.find(
      x => x.path === targetRecentItem.id || x.id === targetRecentItem.id || x.id === `db:${targetRecentItem.id}` || x.id === `folder:${targetRecentItem.id}`
    );
    return matched ? matched.songs : [];
  }, [targetRecentItem, targetRecentSong, allPlaylists, mediaItems]);

  const resolveCollectionRouteForSong = (songId: string) => {
    const matched = allPlaylists.find((playlist) => {
      if (playlist.id === 'all-songs') return false;
      return playlist.songs.some((song) => song.id === songId);
    });

    if (!matched) return null;
    return matched.isFolder
      ? `#/library/music/folder/${encodeURIComponent(matched.path)}`
      : `#/library/music/playlist/${matched.path}`;
  };

  // Play a full collection instantly
  const handlePlayCollection = (songs: any[], name: string, id: string, type: 'playlist' | 'album') => {
    if (!songs || songs.length === 0) return;
    setAudioQueue(songs);
    setAudioCurrentIndex(0);
    setActiveAudio(songs[0]);
    setAudioPlaying(true);

    addRecentlyPlayed({
      id,
      name,
      type,
    });
  };

  const handlePlaySong = (song: any) => {
    if (!song) return;
    setAudioQueue([song]);
    setAudioCurrentIndex(0);
    setActiveAudio(song);
    setAudioPlaying(true);
  };

  useEffect(() => {
    if (!activeAudio) return;

    addRecentlyPlayed({
      id: activeAudio.id,
      type: 'song',
      name: activeAudio.title,
    });
  }, [activeAudio?.id, activeAudio?.title, addRecentlyPlayed]);

  // Navigations
  const handleNavigate = (hash: string) => {
    window.location.hash = hash;
  };

  // Search filter
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    
    const songs = mediaItems.filter(s => 
      s.title.toLowerCase().includes(q) || 
      (s.artist && s.artist.toLowerCase().includes(q)) ||
      (s.album && s.album.toLowerCase().includes(q))
    ).slice(0, 5);

    const matchPlaylists = allPlaylists.filter(p => 
      p.name.toLowerCase().includes(q)
    ).slice(0, 3);

    const matchAlbums = albums.filter(a => 
      a.title.toLowerCase().includes(q) || 
      a.artist.toLowerCase().includes(q)
    ).slice(0, 3);

    const matchArtists = artists.filter(a => 
      a.name.toLowerCase().includes(q)
    ).slice(0, 3);

    return { songs, playlists: matchPlaylists, albums: matchAlbums, artists: matchArtists };
  }, [searchQuery, mediaItems, allPlaylists, albums, artists]);

  const syncLabel = websocketStatus === 'connected' ? 'Live Online' : 'Syncing';

  return (
    <div className="music-root" style={{ gap: 20, paddingBottom: 80 }}>
      {/* Non-sticky Glass Banner Header */}
      <header
        className="glass-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          width: '100%',
          boxSizing: 'border-box',
          background: 'rgba(18, 18, 22, 0.26)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          backdropFilter: 'blur(30px) saturate(210%)',
          WebkitBackdropFilter: 'blur(30px) saturate(210%)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)',
          borderRadius: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              MediaGrid Runtime
            </span>
            <h2 style={{ margin: '2px 0 0 0', fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>
              {getGreeting()}
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Status Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 99,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              fontSize: 10,
              fontWeight: 700,
              color: '#94a3b8',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: websocketStatus === 'connected' ? '#10b981' : '#f59e0b' }} />
            {syncLabel}
          </div>

          {/* Search Button */}
          <button
            onClick={() => setShowSearch(true)}
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)';
              e.currentTarget.style.color = '#38bdf8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <Search size={16} />
          </button>
        </div>
      </header>

      {/* Quick Access Grid (Spotify style) */}
      {quickPicks.length > 0 && (
        <section style={{ marginTop: 0 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.65)', margin: '0 0 10px 0' }}>
            Recently Played
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {quickPicks.map(p => (
              <div
                key={p.id}
                onClick={() => handleNavigate(p.isFolder ? `#/library/music/folder/${encodeURIComponent(p.path)}` : `#/library/music/playlist/${p.path}`)}
                className="glass-panel spring-click"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 8,
                  borderRadius: 12,
                  cursor: 'pointer',
                  height: 56,
                  gap: 12,
                  position: 'relative',
                  overflow: 'hidden',
                  background: 'rgba(18, 18, 22, 0.26)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  backdropFilter: 'blur(30px) saturate(210%)',
                  WebkitBackdropFilter: 'blur(30px) saturate(210%)',
                  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)',
                }}
              >
                {/* Artwork */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: '#1c1c1e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: 'rgba(255,255,255,0.4)',
                    overflow: 'hidden',
                    boxShadow: '0 0 34px rgba(56, 189, 248, 0.36)',
                  }}
                >
                  <PlaylistCover songs={p.songs} />
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 650, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                    {p.name}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.4)', fontWeight: 400 }}>
                    {p.count} {p.count === 1 ? 'song' : 'songs'}
                  </span>
                </div>
                {/* mini hover play */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayCollection(p.songs, p.name, p.path, 'playlist');
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: '#38bdf8',
                    color: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 10px rgba(56, 189, 248, 0.3)',
                    marginRight: 6,
                  }}
                >
                  <Play size={12} fill="currentColor" style={{ marginLeft: 1 }} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recently Played / Music Controller Widget */}
      <section style={{ marginTop: 2 }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.65)', marginBottom: 16 }}>
          {activeAudio ? 'Now Playing' : 'Recently Played'}
        </h3>
        
        <div
          className="glass-panel"
          onClick={() => {
            if (!activeAudio) return;
            const route = resolveCollectionRouteForSong(activeAudio.id);
            if (route) {
              handleNavigate(route);
            }
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: 20,
            borderRadius: 24,
            background: 'rgba(18, 18, 22, 0.26)',
            backdropFilter: 'blur(30px) saturate(210%)',
            WebkitBackdropFilter: 'blur(30px) saturate(210%)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)',
            gap: 16,
            width: '100%',
            boxSizing: 'border-box',
            transition: 'background 360ms ease, border-color 360ms ease, box-shadow 360ms ease',
            cursor: activeAudio ? 'pointer' : 'default',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: window.innerWidth < 768 ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20,
              width: '100%',
            }}
          >
            {/* Left side: Artwork and Song Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0, width: '100%' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: '#1c1c1e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: `0 8px 20px rgba(0,0,0,0.3), ${nowPlayingGlow}`,
                  color: 'rgba(255,255,255,0.4)',
                  overflow: 'hidden',
                  transition: 'box-shadow 280ms ease',
                }}
              >
                {activeAudio ? (
                  !nowPlayingImgError ? (
                    <img
                      src={getThumbnailUrl(activeAudio)}
                      alt=""
                      onError={() => setNowPlayingImgError(true)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', boxShadow: '0 0 36px rgba(56, 189, 248, 0.38)' }}
                    />
                  ) : (
                    <Disc className="spin-art" size={24} />
                  )
                ) : (
                  <PlaylistCover songs={targetRecentSongs} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {activeAudio ? (
                  <>
                    <h4 
                      style={{ 
                        margin: 0, 
                        fontSize: 16, 
                        fontWeight: 900, 
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {activeAudio.title}
                    </h4>
                    <p 
                      style={{ 
                        margin: '2px 0 0 0', 
                        fontSize: 12, 
                        color: '#94a3b8',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {activeAudio.artist || 'Unknown Artist'} • {activeAudio.album || 'Single'}
                    </p>
                  </>
                ) : (
                  <>
                    <h4 
                      style={{ 
                        margin: 0, 
                        fontSize: 16, 
                        fontWeight: 900, 
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {targetRecentItem.name}
                    </h4>
                    <p 
                      style={{ 
                        margin: '2px 0 0 0', 
                        fontSize: 11, 
                        color: '#38bdf8', 
                        fontWeight: 750, 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.08em' 
                      }}
                    >
                      {targetRecentItem.type === 'song' ? 'Last Played Song' : `${targetRecentItem.type} Collection`}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Right side: Audio Controller buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
              {activeAudio ? (
                <>
                  <button
                    onClick={() => playPrevAudio()}
                    disabled={audioQueue.length <= 1}
                    className="spring-click"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: audioQueue.length <= 1 ? 0.35 : 1,
                      boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                    }}
                  >
                    <SkipBack size={16} fill="currentColor" />
                  </button>

                  <button
                    onClick={() => setAudioPlaying(!audioPlaying)}
                    className="spring-click"
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.12)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
                    }}
                  >
                    {audioPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
                  </button>

                  <button
                    onClick={() => playNextAudio()}
                    disabled={audioQueue.length <= 1}
                    className="spring-click"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: audioQueue.length <= 1 ? 0.35 : 1,
                      boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                    }}
                  >
                    <SkipForward size={16} fill="currentColor" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    if (targetRecentItem.type === 'song' && targetRecentSong) {
                      handlePlaySong(targetRecentSong);
                    } else {
                      const matched = allPlaylists.find(x => x.path === targetRecentItem.id || x.id === targetRecentItem.id || x.id === `db:${targetRecentItem.id}` || x.id === `folder:${targetRecentItem.id}`);
                      if (matched) {
                      handlePlayCollection(matched.songs, matched.name, matched.path, 'playlist');
                      } else if (targetRecentItem.id === 'all-songs') {
                        handlePlayCollection(mediaItems, 'All Songs', 'all-songs', 'playlist');
                      }
                    }
                  }}
                  className="spring-click"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 20px',
                    borderRadius: 99,
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: '#38bdf8',
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    boxShadow: '0 6px 18px rgba(56, 189, 248, 0.15)',
                  }}
                >
                  <Play size={12} fill="currentColor" /> {targetRecentItem.type === 'song' ? 'Resume Song' : 'Play Collection'}
                </button>
              )}
            </div>
          </div>

          {activeAudio && (
            <div style={{ width: '100%', marginTop: 2 }}>
              <ProgressBar
                value={currentTime}
                max={duration}
                onChange={(val) => setCurrentTime(val)}
                accentColor={`hsl(${Math.abs(activeAudio.title.charCodeAt(0) % 360)}, 85%, 55%)`}
              />
            </div>
          )}
        </div>
      </section>

      {/* Your Playlists Section */}
      {allPlaylists.length > 0 && (
        <section style={{ marginTop: 8 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.65)', marginBottom: 16 }}>
            Playlists & Folders
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 20 }}>
            {allPlaylists.map(pl => (
              <PlaylistCard
                key={pl.id}
                id={pl.path}
                name={pl.name}
                count={pl.count}
                songs={pl.songs}
                onClick={() => handleNavigate(pl.isFolder ? `#/library/music/folder/${encodeURIComponent(pl.path)}` : `#/library/music/playlist/${pl.path}`)}
                onPlay={() => handlePlayCollection(pl.songs, pl.name, pl.path, 'playlist')}
              />
            ))}
          </div>
        </section>
      )}

      {/* Albums Section */}
      {albums.length > 0 && (
        <section style={{ marginTop: 8 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.65)', marginBottom: 16 }}>
            Albums
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 20 }}>
            {albums.map(alb => (
              <AlbumCard
                key={`${alb.title}-${alb.artist}`}
                title={alb.title}
                artist={alb.artist}
                count={alb.songs.length}
                songs={alb.songs}
                onClick={() => handleNavigate(`#/library/music/album/${encodeURIComponent(alb.title)}`)}
                onPlay={() => handlePlayCollection(alb.songs, alb.title, alb.title, 'album')}
              />
            ))}
          </div>
        </section>
      )}

      {/* Artists Section */}
      {artists.length > 0 && (
        <section style={{ marginTop: 8 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.65)', marginBottom: 16 }}>
            Artists
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 20 }}>
            {artists.map(art => (
              <ArtistCard
                key={art.name}
                name={art.name}
                count={art.songs.length}
                songs={art.songs}
                onClick={() => handleNavigate(`#/library/music/artist/${encodeURIComponent(art.name)}`)}
                onPlay={() => handlePlayCollection(art.songs, art.name, art.name, 'album')}
              />
            ))}
          </div>
        </section>
      )}

      {/* Floating Search Overlay Modal */}
      {showSearch && (
        <div className="search-overlay" onClick={() => setShowSearch(false)}>
          <div className="search-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255, 255, 255, 0.01)' }}>
              <Search size={18} style={{ color: 'rgba(255,255,255,0.4)', marginRight: 12 }} />
              <input
                type="text"
                placeholder="Search songs, albums, artists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 14.5,
                  color: '#FFFFFF',
                }}
              />
              <button onClick={() => setShowSearch(false)} style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
                ESC
              </button>
            </div>

            {/* Results body */}
            <div style={{ padding: 16, maxHeight: '60vh', overflowY: 'auto' }} className="custom-scrollbar">
              {searchResults ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Songs */}
                  {searchResults.songs.length > 0 && (
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Songs</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {searchResults.songs.map(song => (
                          <div
                            key={song.id}
                            onClick={() => {
                              setAudioQueue([song]);
                              setAudioCurrentIndex(0);
                              setActiveAudio(song);
                              setAudioPlaying(true);
                              setShowSearch(false);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, cursor: 'pointer', transition: 'background 0.2s' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <Music size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9' }}>{song.title}</div>
                              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{song.artist}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Playlists */}
                  {searchResults.playlists.length > 0 && (
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Playlists</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {searchResults.playlists.map(pl => (
                          <div
                            key={pl.id}
                            onClick={() => {
                              handleNavigate(pl.isFolder ? `#/library/music/folder/${encodeURIComponent(pl.path)}` : `#/library/music/playlist/${pl.path}`);
                              setShowSearch(false);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#f1f5f9', transition: 'background 0.2s' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <FolderOpen size={14} style={{ color: '#38bdf8' }} />
                            {pl.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Albums */}
                  {searchResults.albums.length > 0 && (
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Albums</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {searchResults.albums.map(alb => (
                          <div
                            key={alb.title}
                            onClick={() => {
                              handleNavigate(`#/library/music/album/${encodeURIComponent(alb.title)}`);
                              setShowSearch(false);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, cursor: 'pointer', transition: 'background 0.2s' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <Disc size={14} style={{ color: '#a5f3fc' }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9' }}>{alb.title}</div>
                              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{alb.artist}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Artists */}
                  {searchResults.artists.length > 0 && (
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Artists</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {searchResults.artists.map(art => (
                          <div
                            key={art.name}
                            onClick={() => {
                              handleNavigate(`#/library/music/artist/${encodeURIComponent(art.name)}`);
                              setShowSearch(false);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#f1f5f9', transition: 'background 0.2s' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <User size={14} style={{ color: '#818cf8' }} />
                            {art.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                  Type search query to search music library
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
