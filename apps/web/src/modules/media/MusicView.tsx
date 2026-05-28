import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';

import {
  FolderOpen,
  Upload,
  Search,
  SlidersHorizontal,
  Play,
  Music,
  Plus,
  X,
  Disc,
  ListMusic
} from 'lucide-react';

const getRelativePathInsideCategory = (itemPath: string, categoryFolder: string) => {
  const normalizedPath = itemPath.replace(/\\/g, '/');
  const normalizedFolder = categoryFolder.replace(/\\/g, '/');
  const index = normalizedPath.indexOf(normalizedFolder);
  if (index === -1) return '';
  return normalizedPath.substring(index + normalizedFolder.length + 1);
};

// Premium dynamic gradient cover generator based on name
const getPlaylistGradient = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c1 = Math.abs(hash % 360);
  const c2 = (c1 + 50) % 360;
  return `linear-gradient(135deg, hsl(${c1}, 80%, 45%), hsl(${c2}, 70%, 20%))`;
};

const formatSize = (bytes?: number | null) => {
  if (bytes === undefined || bytes === null) return 'N/A';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

interface MusicViewProps {
  handleFileInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleUploadFiles: (filesList: FileList) => Promise<void>;
  uploadProgress: number | null;
  uploadingFiles: string[];
}

export const MusicView: React.FC<MusicViewProps> = ({
  handleUploadFiles,
  uploadProgress,
  uploadingFiles
}) => {
  const {
    mediaItems,
    currentFolderPath,
    setAudioQueue,
    setAudioCurrentIndex,
    setActiveAudio,
    setAudioPlaying,
    activeAudio,
    audioPlaying
  } = useAppStore();

  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'artist' | 'album' | 'date'>('title');
  const [showAllPlaylists, setShowAllPlaylists] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Monitor screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Extract unique playlists (top-level folders inside media/music)
  const getPlaylists = () => {
    const playlistsSet = new Set<string>();
    for (const item of mediaItems) {
      const rel = getRelativePathInsideCategory(item.path, 'media/music');
      if (rel) {
        const parts = rel.split('/');
        if (parts.length > 1) {
          playlistsSet.add(parts[0]);
        }
      }
    }
    return Array.from(playlistsSet).sort().map(name => ({
      name,
      path: name,
    }));
  };

  const playlists = getPlaylists();

  // Get total songs count in a playlist
  const getPlaylistSongCount = (path: string) => {
    return mediaItems.filter(item => {
      const rel = getRelativePathInsideCategory(item.path, 'media/music');
      return rel && (rel === path || rel.startsWith(path + '/'));
    }).length;
  };

  // Determine songs list based on whether we are in a playlist
  const getSongs = () => {
    if (currentFolderPath) {
      // In a playlist - filter songs inside this folder path
      return mediaItems.filter(item => {
        const rel = getRelativePathInsideCategory(item.path, 'media/music');
        return rel && (rel === currentFolderPath || rel.startsWith(currentFolderPath + '/'));
      });
    }
    // At root - return ALL songs in the music library
    return mediaItems;
  };

  const currentSongs = getSongs();

  // Filter and sort songs
  const filteredAndSortedSongs = currentSongs
    .filter(song => {
      const query = searchQuery.toLowerCase();
      const title = (song.title || '').toLowerCase();
      const artist = (song.artist || 'unknown artist').toLowerCase();
      const album = (song.album || 'unknown album').toLowerCase();
      return title.includes(query) || artist.includes(query) || album.includes(query);
    })
    .sort((a, b) => {
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      } else if (sortBy === 'artist') {
        return (a.artist || 'Unknown').localeCompare(b.artist || 'Unknown');
      } else if (sortBy === 'album') {
        return (a.album || 'Unknown').localeCompare(b.album || 'Unknown');
      } else if (sortBy === 'date') {
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      }
      return 0;
    });

  const handlePlayMusic = (item: any, index: number) => {
    setAudioQueue(filteredAndSortedSongs);
    setAudioCurrentIndex(index);
    setActiveAudio(item);
    setAudioPlaying(true);
  };

  const selectPlaylist = (path: string) => {
    window.location.hash = `#/library/music/${encodeURIComponent(path)}`;
  };

  const resetToRoot = () => {
    window.location.hash = `#/library/music`;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleUploadFiles(e.dataTransfer.files);
      setShowUploadModal(false);
    }
  };

  const handleLocalFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleUploadFiles(e.target.files);
      setShowUploadModal(false);
    }
  };

  // Render Mobile Layout
  const renderMobile = () => {
    return (
      <div className="space-y-5 px-1 mobile-music-view">
        {/* Header: <logo - library folder> Your Library + Upload Button */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-white" onClick={resetToRoot}>
            <FolderOpen size={24} className="text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
            <h2 className="text-xl font-extrabold tracking-tight">Your Library</h2>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1 bg-white/10 hover:bg-white/15 text-white text-xs font-bold font-mono px-3.5 py-2 rounded-full border border-white/10 backdrop-blur-md transition-all active:scale-95"
          >
            <Plus size={14} />
            UPLOAD
          </button>
        </div>

        {/* Playlist Container (Liquid Glass card style) */}
        {!currentFolderPath && playlists.length > 0 && (
          <div className="liquid-glass-card p-4 rounded-3xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Playlists</h3>
              <button
                onClick={() => setShowAllPlaylists(!showAllPlaylists)}
                className="text-xs font-bold text-sky-400 hover:text-sky-300 font-mono underline decoration-sky-500/30 underline-offset-4"
              >
                {showAllPlaylists ? 'show less <' : 'view all >'}
              </button>
            </div>

            {showAllPlaylists ? (
              <div className="grid grid-cols-2 gap-3.5 max-h-[300px] overflow-y-auto pr-1">
                {playlists.map(pl => (
                  <div
                    key={pl.path}
                    onClick={() => selectPlaylist(pl.path)}
                    className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl flex flex-col items-center text-center gap-2.5 active:scale-98 transition duration-150"
                  >
                    <div
                      className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-md shadow-black/30"
                      style={{ background: getPlaylistGradient(pl.name) }}
                    >
                      {pl.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="w-full">
                      <p className="text-xs font-bold text-white truncate px-1">{pl.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{getPlaylistSongCount(pl.path)} tracks</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
                {playlists.map(pl => (
                  <div
                    key={pl.path}
                    onClick={() => selectPlaylist(pl.path)}
                    className="flex-shrink-0 w-24 snap-start flex flex-col items-center gap-2 active:scale-95 transition"
                  >
                    <div
                      className="w-24 h-24 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-black/40 relative overflow-hidden group"
                      style={{ background: getPlaylistGradient(pl.name) }}
                    >
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition" />
                      {pl.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-white text-center truncate w-full px-1">{pl.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Playlist Header if inside a playlist */}
        {currentFolderPath && (
          <div className="liquid-glass-card p-4 rounded-3xl flex items-center gap-4 relative overflow-hidden">
            <button
              onClick={resetToRoot}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-slate-400 hover:text-white transition"
            >
              <X size={14} />
            </button>
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-black/40"
              style={{ background: getPlaylistGradient(currentFolderPath) }}
            >
              {currentFolderPath.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-sky-400 font-mono text-[9px] uppercase tracking-wider font-bold">
                <FolderOpen size={10} />
                PLAYLIST
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">{currentFolderPath}</h3>
              <p className="text-[10px] text-slate-400 font-mono mt-1">
                {currentSongs.length} songs • MediaGrid Library
              </p>
            </div>
          </div>
        )}

        {/* Search & Sort inline (Liquid glass container) */}
        <div className="flex gap-2.5 items-center">
          {/* Search container */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder={currentFolderPath ? "Search in playlist..." : "Search all songs..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="liquid-input pl-10 pr-4 py-2.5 rounded-full text-xs font-semibold"
            />
          </div>
          {/* Sort dropdown */}
          <div className="relative shrink-0">
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="appearance-none bg-black/35 hover:bg-black/50 border border-white/10 text-slate-300 text-xs font-bold font-mono py-2.5 pl-4 pr-8 rounded-full focus:outline-none focus:border-sky-500 transition-all backdrop-blur-md"
            >
              <option value="title">TITLE</option>
              <option value="artist">ARTIST</option>
              <option value="album">ALBUM</option>
              <option value="date">DATE</option>
            </select>
            <SlidersHorizontal className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
          </div>
        </div>

        {/* Songs List */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono pl-1">Songs</h4>
          {filteredAndSortedSongs.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500 font-mono liquid-glass-card rounded-3xl">
              No songs found
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAndSortedSongs.map((item, index) => {
                const isPlayingThis = activeAudio?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => handlePlayMusic(item, index)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition duration-200 cursor-pointer ${
                      isPlayingThis
                        ? 'bg-sky-500/10 border-sky-500/35 shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                        : 'bg-white/[0.01] border-white/[0.04] hover:bg-white/[0.03] hover:border-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md relative overflow-hidden"
                        style={{ background: getPlaylistGradient(item.album || item.title) }}
                      >
                        {isPlayingThis && audioPlaying ? (
                          <Disc className="animate-spin text-white w-5 h-5" style={{ animationDuration: '3s' }} />
                        ) : (
                          <Music className="w-5 h-5 text-white/80" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h5 className={`text-xs font-bold truncate ${isPlayingThis ? 'text-sky-400' : 'text-white'}`}>
                          {item.title}
                        </h5>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {item.artist || 'Unknown Artist'} • {item.album || 'Unknown Album'}
                        </p>
                      </div>
                    </div>
                    <button
                      className={`p-2 rounded-full shrink-0 transition ${
                        isPlayingThis ? 'bg-sky-500 text-slate-950 scale-105 shadow' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Play size={10} fill="currentColor" className={isPlayingThis ? "" : "translate-x-0.5"} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render PC Layout
  const renderPC = () => {
    return (
      <div className="flex gap-6 min-h-[520px] pc-music-view select-none">
        {/* Left Column: Playlist selector */}
        <div className="w-[280px] shrink-0 liquid-glass-card rounded-3xl p-4 flex flex-col">
          <div className="flex justify-between items-center pb-3 border-b border-white/5 mb-4">
            <h3 className="text-sm font-bold text-white tracking-wider flex items-center gap-2">
              <FolderOpen size={16} className="text-sky-400" />
              Your Playlists
            </h3>
            <button
              onClick={() => setShowUploadModal(true)}
              className="p-1 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10 text-slate-300 hover:text-white transition"
              title="Upload Music"
            >
              <Upload size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1.5 scrollbar-thin">
            {/* "All Songs" Virtual Playlist */}
            <button
              onClick={resetToRoot}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left font-bold transition ${
                !currentFolderPath
                  ? 'bg-sky-500/10 text-sky-400 border border-sky-500/25 shadow-md shadow-sky-500/5'
                  : 'text-slate-300 hover:bg-white/[0.02] border border-transparent'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                <ListMusic size={18} />
              </div>
              <div>
                <span className="text-xs block font-bold">All Library Songs</span>
                <span className="text-[10px] text-slate-400 font-mono font-medium block mt-0.5">
                  {mediaItems.length} tracks
                </span>
              </div>
            </button>

            {/* User playlists */}
            {playlists.map(pl => {
              const isSelected = currentFolderPath === pl.path;
              const count = getPlaylistSongCount(pl.path);
              return (
                <button
                  key={pl.path}
                  onClick={() => selectPlaylist(pl.path)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition border ${
                    isSelected
                      ? 'bg-sky-500/10 text-sky-400 border-sky-500/25 shadow-md shadow-sky-500/5'
                      : 'text-slate-300 hover:bg-white/[0.02] border-transparent hover:border-white/[0.04]'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-md"
                    style={{ background: getPlaylistGradient(pl.name) }}
                  >
                    {pl.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="truncate flex-1">
                    <span className="text-xs font-bold block truncate">{pl.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono font-medium block mt-0.5">
                      {count} tracks
                    </span>
                  </div>
                </button>
              );
            })}

            {playlists.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-xs font-mono">
                No playlists found
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Songs Table and selected playlist info */}
        <div className="flex-1 flex flex-col space-y-6">
          {/* Playlist Info Header at the top of songs list */}
          <div className="liquid-glass-card rounded-3xl p-6 flex items-end gap-6 relative overflow-hidden min-h-[160px]">
            {/* Background design glow */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent z-0" />
            <div
              className="absolute -top-12 -left-12 w-48 h-48 opacity-20 blur-3xl rounded-full"
              style={{ background: getPlaylistGradient(currentFolderPath || 'Library') }}
            />

            <div
              className="w-28 h-28 rounded-2xl flex items-center justify-center text-white font-black text-4xl shadow-xl shadow-black/50 z-10 shrink-0 relative overflow-hidden"
              style={{ background: getPlaylistGradient(currentFolderPath || 'Library') }}
            >
              {(currentFolderPath || 'Library').slice(0, 2).toUpperCase()}
            </div>

            <div className="z-10 text-white flex-1 min-w-0">
              <span className="text-xs font-bold tracking-wider font-mono text-sky-400 uppercase">
                {currentFolderPath ? 'Playlist' : 'Collection'}
              </span>
              <h2 className="text-2xl font-black tracking-tight mt-1 truncate">
                {currentFolderPath || 'All Library Songs'}
              </h2>
              <p className="text-xs text-slate-300 mt-2 font-medium flex items-center gap-1.5">
                <span className="font-bold text-white">MediaGrid Runtime</span>
                <span>•</span>
                <span>{filteredAndSortedSongs.length} tracks</span>
                {currentFolderPath && (
                  <>
                    <span>•</span>
                    <button
                      onClick={resetToRoot}
                      className="text-sky-400 hover:text-sky-300 font-mono font-bold hover:underline"
                    >
                      Close Playlist
                    </button>
                  </>
                )}
              </p>
            </div>

            {/* Quick Upload action in Header */}
            <button
              onClick={() => setShowUploadModal(true)}
              className="absolute bottom-6 right-6 flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold font-mono px-5 py-3 rounded-xl transition shadow shadow-sky-500/20 active:scale-95 z-10"
            >
              <Upload size={14} />
              UPLOAD MUSIC
            </button>
          </div>

          {/* Songs listing pane */}
          <div className="liquid-glass-card rounded-3xl p-5 flex-1 flex flex-col space-y-4">
            {/* Search & Sort inline row */}
            <div className="flex justify-between items-center gap-4">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search tracks, artists, albums..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="liquid-input pl-9 pr-4 py-2.5 rounded-full text-xs font-semibold"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 font-bold font-mono tracking-wider uppercase">Sort By:</span>
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="bg-black/30 hover:bg-black/45 border border-white/5 text-slate-300 text-xs font-bold font-mono py-2 px-6 rounded-full focus:outline-none focus:border-sky-500 transition-all"
                >
                  <option value="title">TITLE</option>
                  <option value="artist">ARTIST</option>
                  <option value="album">ALBUM</option>
                  <option value="date">DATE ADDED</option>
                </select>
              </div>
            </div>

            {/* Table of Songs */}
            <div className="flex-1 overflow-x-auto min-h-[300px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500 font-bold font-mono text-[10px] tracking-wider">
                    <th className="py-2.5 px-4 w-12 text-center">#</th>
                    <th className="py-2.5 px-4">TITLE</th>
                    <th className="py-2.5 px-4">ARTIST</th>
                    <th className="py-2.5 px-4">ALBUM</th>
                    <th className="py-2.5 px-4 w-28 text-center">SIZE</th>
                    <th className="py-2.5 px-4 w-28 text-center">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {filteredAndSortedSongs.map((item, index) => {
                    const isPlayingThis = activeAudio?.id === item.id;
                    return (
                      <tr
                        key={item.id}
                        onDoubleClick={() => handlePlayMusic(item, index)}
                        className={`hover:bg-white/[0.02] group transition-colors cursor-pointer ${
                          isPlayingThis ? 'bg-sky-500/[0.04]' : ''
                        }`}
                      >
                        <td className="py-3 px-4 text-center font-mono text-slate-500 font-semibold group-hover:text-slate-300">
                          {isPlayingThis && audioPlaying ? (
                            <Disc className="animate-spin text-sky-400 w-4 h-4 mx-auto" style={{ animationDuration: '3s' }} />
                          ) : (
                            index + 1
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-white truncate max-w-[200px]" title={item.title}>
                          <span className={isPlayingThis ? 'text-sky-400' : 'text-white'}>
                            {item.title}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300 truncate max-w-[150px]" title={item.artist || 'Unknown Artist'}>
                          {item.artist || 'Unknown Artist'}
                        </td>
                        <td className="py-3 px-4 text-slate-400 truncate max-w-[150px]" title={item.album || 'Unknown Album'}>
                          {item.album || 'Unknown Album'}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500 font-mono font-medium">
                          {formatSize(item.sizeBytes)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handlePlayMusic(item, index)}
                            className={`px-3.5 py-1.5 rounded-lg text-[9px] font-bold font-mono tracking-wider transition hover:scale-102 flex items-center gap-1 mx-auto ${
                              isPlayingThis
                                ? 'bg-sky-500 text-slate-950 shadow shadow-sky-500/10'
                                : 'bg-white/5 hover:bg-white/10 text-white'
                            }`}
                          >
                            <Play size={8} fill="currentColor" />
                            PLAY
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredAndSortedSongs.length === 0 && (
                <div className="text-center py-20 text-xs text-slate-500 font-mono">
                  This list is empty
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {isMobile ? renderMobile() : renderPC()}

      {/* Upload Modal (Glass design overlay) */}
      {showUploadModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md z-55 p-6 animate-in fade-in duration-200">
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`panel max-w-md w-full space-y-6 border-white/10 shadow-2xl relative transition-all duration-300 ${
              dragActive ? 'border-sky-500 bg-sky-500/5 scale-[0.99]' : ''
            }`}
          >
            <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Upload Music</h4>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-white/5"
              >
                <X size={16} />
              </button>
            </div>

            {dragActive ? (
              <div className="border border-dashed border-sky-500/50 bg-sky-500/5 rounded-2xl p-12 text-center space-y-3">
                <Upload size={32} className="text-sky-400 mx-auto animate-bounce" />
                <h5 className="text-sm font-bold text-white">Drop files now</h5>
                <p className="text-xs text-slate-400">Release to start uploading to {currentFolderPath || 'music library'}</p>
              </div>
            ) : (
              <div className="border border-dashed border-white/10 bg-white/[0.01] hover:bg-white/[0.02] rounded-2xl p-10 text-center space-y-4 transition">
                <Upload size={28} className="text-slate-400 mx-auto" />
                <div>
                  <h5 className="text-xs font-bold text-white">Drag & drop files here</h5>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">Accepts MP3, WAV, FLAC</p>
                </div>
                <label className="liquid-button liquid-button-accent text-xs font-bold font-mono px-4 py-2 rounded-xl cursor-pointer inline-block">
                  CHOOSE FILES
                  <input
                    type="file"
                    multiple
                    accept="audio/*"
                    onChange={handleLocalFileInput}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {/* Display active uploads if any */}
            {uploadProgress !== null && (
              <div className="space-y-2 p-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-300">
                  <span className="truncate max-w-[200px]">
                    {uploadingFiles.length === 1 ? uploadingFiles[0] : `Uploading ${uploadingFiles.length} files...`}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-slate-900 border border-white/5 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-sky-500 h-full rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold font-mono transition"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
