import React, { useEffect } from 'react';
import { buildRuntimeUrl } from '@mediagrid/api';
import { useAppStore } from '../../store/useAppStore';
import { fetchMedia } from '../../services/runtime';
import { MusicRouter } from '../../music/MusicRouter';
import '../../music/music.css';
import {
  Film,
  Music,
  Image as ImageIcon,
  FolderOpen,
  Loader2,
  Play,
  HardDrive,
  Upload,
  Trash2,
  Edit2,
  ChevronRight,
  X,
  FileText,
  FileArchive,
  FileDown,
  FolderPlus
} from 'lucide-react';
import type { CategoryId } from '@mediagrid/types';

const getCategoryIcon = (id: CategoryId) => {
  switch (id) {
    case 'movies':
      return Film;
    case 'music':
      return Music;
    case 'photos':
      return ImageIcon;
    case 'drive':
      return HardDrive;
    default:
      return FolderOpen;
  }
};

const getFileIcon = (mimeType?: string | null, title?: string) => {
  const mime = mimeType || '';
  const ext = title?.split('.').pop()?.toLowerCase() || '';
  
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime.startsWith('video/')) return Film;
  if (mime.startsWith('audio/')) return Music;
  
  if (mime === 'application/pdf' || ext === 'pdf') return FileText;
  if (ext === 'zip' || ext === 'rar' || ext === '7z' || ext === 'tar' || ext === 'gz') return FileArchive;
  if (ext === 'doc' || ext === 'docx' || ext === 'txt' || ext === 'md') return FileText;
  
  return FileText;
};

const formatSize = (bytes?: number | null) => {
  if (bytes === undefined || bytes === null) return 'N/A';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const withAuthToken = (url: string): string => {
  const token = localStorage.getItem('mediagrid_token');
  if (!token) return url;

  const absoluteUrl = url.startsWith('http') ? url : buildRuntimeUrl(url);
  const parsedUrl = new URL(absoluteUrl);
  if (!parsedUrl.searchParams.has('token')) {
    parsedUrl.searchParams.set('token', token);
  }
  return parsedUrl.toString();
};

const thumbnailUrl = (id: string) => withAuthToken(`/media/thumbnail/${id}`);

const mediaFileUrl = (path: string) => withAuthToken(`/media-file/${encodeURIComponent(path)}`);

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
};

const getRelativePathInsideCategory = (itemPath: string, categoryFolder: string) => {
  const normalizedPath = itemPath.replace(/\\/g, '/');
  const normalizedFolder = categoryFolder.replace(/\\/g, '/');
  
  const index = normalizedPath.indexOf(normalizedFolder);
  if (index === -1) {
    return '';
  }
  
  return normalizedPath.substring(index + normalizedFolder.length + 1);
};

interface VirtualItem {
  name: string;
  isFolder: boolean;
  item?: any;
  path: string;
}

const getVirtualItems = (items: any[], categoryFolder: string, currentFolder: string) => {
  const folders = new Set<string>();
  const files: any[] = [];
  
  const currentPrefix = currentFolder ? `${currentFolder}/` : '';
  
  for (const item of items) {
    const rel = getRelativePathInsideCategory(item.path, categoryFolder);
    if (!rel) {
      if (!currentFolder) files.push(item);
      continue;
    }
    
    if (currentFolder && !rel.startsWith(currentPrefix)) {
      continue;
    }
    
    const remainder = currentFolder ? rel.substring(currentPrefix.length) : rel;
    const parts = remainder.split('/');
    
    if (parts.length > 1) {
      folders.add(parts[0]);
    } else {
      files.push(item);
    }
  }
  
  const virtualItems: VirtualItem[] = [];
  for (const f of Array.from(folders).sort()) {
    const fPath = currentFolder ? `${currentFolder}/${f}` : f;
    virtualItems.push({ name: f, isFolder: true, path: fPath });
  }
  
  return { folders: virtualItems, files };
};

const PhotoCard: React.FC<{
  item: any;
  formatSize: (bytes?: number | null) => string;
}> = ({ item, formatSize }) => {
  const [imgSrc, setImgSrc] = React.useState(thumbnailUrl(item.id));
  const [hasError, setHasError] = React.useState(false);

  const handleError = () => {
    const fallbackUrl = mediaFileUrl(item.path);
    if (imgSrc !== fallbackUrl) {
      setImgSrc(fallbackUrl);
    } else {
      setHasError(true);
    }
  };

  return (
    <article className="media-card group cursor-pointer transition-all duration-300 hover:border-slate-700/60 overflow-hidden" key={item.id}>
      <div className="aspect-square bg-slate-900/60 border-b border-slate-950 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-slate-950/20 group-hover:bg-slate-950/0 transition-colors duration-300 z-10" />
        {!hasError ? (
          <img
            src={imgSrc}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 relative z-0"
            onError={handleError}
          />
        ) : (
          <ImageIcon size={32} className="text-amber-400/60 absolute" />
        )}
      </div>
      <div className="p-3">
        <h4 className="text-xs font-semibold text-white truncate" title={item.title}>
          {item.title}
        </h4>
        <p className="text-[10px] font-mono text-slate-500 truncate mt-0.5" title={item.path}>
          {item.path}
        </p>
        <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono mt-1.5 pt-1.5 border-t border-slate-800/40">
          <span>{formatSize(item.sizeBytes)}</span>
          <span>{item.mimeType || 'photo'}</span>
        </div>
      </div>
    </article>
  );
};

export const MediaContent: React.FC = () => {
  const {
    selectedCategory,
    mediaItems,
    loadingMedia,
    categories,
    setActiveVideo,
    currentFolderPath,
  } = useAppStore();


  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);
  const [uploadingFiles, setUploadingFiles] = React.useState<string[]>([]);
  const [dragActive, setDragActive] = React.useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [selectedItem, setSelectedItem] = React.useState<any | null>(null);
  const [showRenameModal, setShowRenameModal] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  const [dragOverFolderPath, setDragOverFolderPath] = React.useState<string | null>(null);
  const [dragOverBreadcrumbIndex, setDragOverBreadcrumbIndex] = React.useState<number | null>(null);

  // Clear selection on category/folder change
  useEffect(() => {
    setSelectedItem(null);
  }, [selectedCategory, currentFolderPath]);

  const handleDragStart = (e: React.DragEvent, item: any, isFolder: boolean) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      isFolder,
      name: isFolder ? item.name : item.title,
      path: isFolder ? item.path : getRelativePathInsideCategory(item.path, activeCategory.folder),
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleItemDrop = async (e: React.DragEvent, targetFolderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderPath(null);
    setDragOverBreadcrumbIndex(null);

    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const dragData = JSON.parse(dataStr);
      const { isFolder, name, path: oldPath } = dragData;

      // Don't allow dropping onto itself or its parent (which does nothing)
      if (oldPath === targetFolderPath) return;
      
      // Don't allow dropping a folder into itself or its own subfolders
      if (isFolder && (targetFolderPath === oldPath || targetFolderPath.startsWith(oldPath + '/'))) {
        return;
      }

      // Calculate new path relative to category root
      const newPath = targetFolderPath ? `${targetFolderPath}/${name}` : name;

      const token = localStorage.getItem('mediagrid_token');
      const res = await fetch(buildRuntimeUrl('/media/rename'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          category: selectedCategory,
          oldPath,
          newPath,
        }),
      });

      if (res.ok) {
        fetchMedia(selectedCategory);
      } else {
        alert('Failed to move item');
      }
    } catch (err) {
      console.error('Error dropping item', err);
    }
  };

  const handleBreadcrumbDrop = (e: React.DragEvent, index: number) => {
    const targetPath = index === -1 ? '' : segments.slice(0, index + 1).join('/');
    handleItemDrop(e, targetPath);
  };

  const activeCategory = categories.find((c) => c.id === selectedCategory) ?? {
    id: selectedCategory,
    name: selectedCategory.toUpperCase(),
    folder: `media/${selectedCategory}`,
    itemCount: 0,
    lastScannedAt: null
  };

  const IconComponent = getCategoryIcon(selectedCategory);

  const { folders, files } = getVirtualItems(mediaItems, activeCategory.folder, currentFolderPath);

  const segments = currentFolderPath ? currentFolderPath.split('/') : [];
  
  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      window.location.hash = `#/library/${selectedCategory}`;
    } else {
      const subpath = segments.slice(0, index + 1).join('/');
      window.location.hash = `#/library/${selectedCategory}/${encodeURIComponent(subpath)}`;
    }
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
    }
  };
  
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleUploadFiles(e.target.files);
    }
  };

  const handleUploadFiles = async (filesList: FileList) => {
    const token = localStorage.getItem('mediagrid_token');
    const names = Array.from(filesList).map(f => f.name);
    setUploadingFiles(names);
    setUploadProgress(0);

    const formData = new FormData();
    for (let i = 0; i < filesList.length; i++) {
      formData.append('files', filesList[i]);
    }

    const xhr = new XMLHttpRequest();
    const queryPath = encodeURIComponent(currentFolderPath);
    const url = buildRuntimeUrl(`/media/upload?category=${selectedCategory}&path=${queryPath}`);
    
    xhr.open('POST', url, true);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setUploadProgress(null);
      setUploadingFiles([]);
      if (xhr.status >= 200 && xhr.status < 300) {
        fetchMedia(selectedCategory);
      } else {
        alert('Upload failed: ' + xhr.responseText);
      }
    };

    xhr.onerror = () => {
      setUploadProgress(null);
      setUploadingFiles([]);
      alert('Upload error occurred');
    };

    xhr.send(formData);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const token = localStorage.getItem('mediagrid_token');
    const path = currentFolderPath ? `${currentFolderPath}/${newFolderName}` : newFolderName;
    
    try {
      const res = await fetch(buildRuntimeUrl('/media/create-directory'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          category: selectedCategory,
          path: path,
        }),
      });
      if (res.ok) {
        setShowNewFolderModal(false);
        setNewFolderName('');
        window.location.hash = `#/library/${selectedCategory}/${encodeURIComponent(path)}`;
      } else {
        alert('Failed to create folder');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to create folder');
    }
  };

  const handleRename = async () => {
    if (!renameValue.trim() || !selectedItem) return;
    const token = localStorage.getItem('mediagrid_token');
    const isFolder = selectedItem.isFolder;
    
    let oldPathSegment = '';
    let newPathSegment = '';

    if (isFolder) {
      oldPathSegment = selectedItem.path;
      const parts = selectedItem.path.split('/');
      parts[parts.length - 1] = renameValue;
      newPathSegment = parts.join('/');
    } else {
      const rel = getRelativePathInsideCategory(selectedItem.path, activeCategory.folder);
      oldPathSegment = rel;
      const parts = rel.split('/');
      parts[parts.length - 1] = renameValue;
      newPathSegment = parts.join('/');
    }

    try {
      const res = await fetch(buildRuntimeUrl('/media/rename'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          category: selectedCategory,
          oldPath: oldPathSegment,
          newPath: newPathSegment,
        }),
      });
      if (res.ok) {
        setShowRenameModal(false);
        setSelectedItem(null);
        fetchMedia(selectedCategory);
      } else {
        alert('Rename failed');
      }
    } catch (e) {
      console.error(e);
      alert('Rename error');
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    if (!confirm(`Are you sure you want to delete ${selectedItem.name || selectedItem.title}?`)) return;
    
    const token = localStorage.getItem('mediagrid_token');
    const isFolder = selectedItem.isFolder;
    
    const targetPath = isFolder 
      ? selectedItem.path 
      : getRelativePathInsideCategory(selectedItem.path, activeCategory.folder);

    try {
      const res = await fetch(buildRuntimeUrl('/media/delete'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          category: selectedCategory,
          path: targetPath,
        }),
      });
      if (res.ok) {
        setSelectedItem(null);
        fetchMedia(selectedCategory);
      } else {
        alert('Delete failed');
      }
    } catch (e) {
      console.error(e);
      alert('Delete error');
    }
  };

  if (loadingMedia) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[380px] p-12 text-slate-400">
        <Loader2 size={36} className="animate-spin text-sky-400 mb-4" />
        <h4 className="text-base font-semibold text-white">Querying Runtime Database...</h4>
        <p className="text-xs text-slate-500 mt-1">Retrieving dynamic index cache entries</p>
      </div>
    );
  }

  if (selectedCategory === 'music') {
    return <MusicRouter />;
  }

  return (
    <div className={`flex flex-col lg:flex-row gap-6 relative min-h-[500px] ${selectedCategory === 'movies' ? 'music-root' : ''}`}>
      <div className="flex-1 space-y-6">
        {/* Breadcrumbs and Action Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 panel p-4">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-1 text-sm font-semibold">
            <button 
              onClick={() => handleBreadcrumbClick(-1)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverBreadcrumbIndex(-1);
              }}
              onDragLeave={() => setDragOverBreadcrumbIndex(null)}
              onDrop={(e) => handleBreadcrumbDrop(e, -1)}
              className={`text-slate-400 hover:text-white transition flex items-center gap-1 font-bold whitespace-nowrap px-1.5 py-0.5 rounded border border-transparent ${
                dragOverBreadcrumbIndex === -1 ? 'bg-emerald-500/15 border-dashed border-emerald-500/50 text-emerald-400' : ''
              }`}
            >
              <IconComponent size={16} className="text-sky-400" />
              {activeCategory.name}
            </button>
            {segments.map((segment, idx) => (
              <React.Fragment key={idx}>
                <ChevronRight size={14} className="text-slate-600 shrink-0" />
                <button
                  onClick={() => handleBreadcrumbClick(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverBreadcrumbIndex(idx);
                  }}
                  onDragLeave={() => setDragOverBreadcrumbIndex(null)}
                  onDrop={(e) => handleBreadcrumbDrop(e, idx)}
                  className={`text-slate-400 hover:text-white transition font-mono max-w-[15ch] truncate whitespace-nowrap px-1.5 py-0.5 rounded border border-transparent ${
                    dragOverBreadcrumbIndex === idx ? 'bg-emerald-500/15 border-dashed border-emerald-500/50 text-emerald-400' : ''
                  }`}
                >
                  {segment}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-end">
            <button
              onClick={() => setShowNewFolderModal(true)}
              className="liquid-button flex items-center gap-1.5 font-mono text-xs"
            >
              <FolderPlus size={14} className="text-teal-400" />
              NEW FOLDER
            </button>
            <label className="liquid-button liquid-button-accent flex items-center gap-1.5 cursor-pointer whitespace-nowrap font-mono text-xs">
              <Upload size={14} />
              UPLOAD FILES
              <input 
                type="file" 
                multiple 
                onChange={handleFileInputChange} 
                className="hidden" 
              />
            </label>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-3xl p-6 transition-all duration-300 ${
            dragActive 
              ? 'border-sky-500 bg-sky-500/5 shadow-[0_0_20px_rgba(14,165,233,0.15)] scale-[0.995]' 
              : 'border-slate-800/80 bg-slate-950/10 hover:border-slate-800'
          }`}
        >
          {dragActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] rounded-3xl z-40">
              <div className="text-center animate-bounce">
                <Upload size={48} className="text-sky-400 mx-auto mb-2" />
                <h4 className="text-base font-bold text-white">Drop files here</h4>
                <p className="text-xs text-slate-400">Release to upload directly to current folder</p>
              </div>
            </div>
          )}

          {/* Folder & Files Grid */}
          <div className="space-y-6">
            {/* Subfolders Section */}
            {folders.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-3">Folders</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {folders.map((folder) => {
                    const isDragOverThisFolder = dragOverFolderPath === folder.path;
                    return (
                      <div
                        key={folder.path}
                        draggable
                        onDragStart={(e) => handleDragStart(e, folder, true)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverFolderPath(folder.path);
                        }}
                        onDragLeave={() => setDragOverFolderPath(null)}
                        onDrop={(e) => handleItemDrop(e, folder.path)}
                        onClick={() => setSelectedItem({ ...folder, isFolder: true })}
                        onDoubleClick={() => {
                          window.location.hash = `#/library/${selectedCategory}/${encodeURIComponent(folder.path)}`;
                        }}
                        className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer select-none flex items-center gap-3 group overflow-hidden ${
                          isDragOverThisFolder
                            ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.2)] scale-[1.02]'
                            : selectedItem?.path === folder.path && selectedItem?.isFolder
                            ? 'bg-sky-500/10 border-sky-500/30 shadow'
                            : 'bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.03] hover:border-white/[0.12]'
                        }`}
                      >
                        <FolderOpen size={20} className="text-teal-400 shrink-0 group-hover:scale-105 transition" />
                        <span className="font-semibold text-xs text-white truncate max-w-full" title={folder.name}>
                          {folder.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Files Section */}
            <div>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-3">Files</h3>
              {files.length === 0 && folders.length === 0 ? (
                <div className="empty-state py-12 flex flex-col items-center justify-center min-h-[250px]">
                  <div className="p-4 bg-slate-900/60 text-slate-500 rounded-2xl mb-4 border border-slate-800">
                    <IconComponent size={28} />
                  </div>
                  <h4 className="text-sm font-bold text-white">This folder is empty</h4>
                  <p className="text-xs text-slate-400 text-center max-w-[28ch] mt-1.5 leading-relaxed">
                    Drag & drop files here or click "Upload Files" to populate this directory.
                  </p>
                </div>
              ) : files.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No files in this directory
                </div>
              ) : selectedCategory === 'photos' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {files.map((item) => (
                    <div 
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item, false)}
                      onClick={() => setSelectedItem(item)}
                      className={`cursor-grab active:cursor-grabbing ${
                        selectedItem?.id === item.id ? 'ring-2 ring-sky-500 rounded-3xl overflow-hidden' : ''
                      }`}
                    >
                      <PhotoCard item={item} formatSize={formatSize} />
                    </div>
                  ))}
                </div>
              ) : selectedCategory === 'movies' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {files.map((item) => (
                    <article
                      draggable
                      onDragStart={(e) => handleDragStart(e, item, false)}
                      className={`media-card flex flex-col justify-between group transition-all duration-300 hover:border-slate-700/60 cursor-grab active:cursor-grabbing ${
                        selectedItem?.id === item.id ? 'border-sky-500/50 shadow shadow-sky-500/5' : ''
                      }`}
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      onDoubleClick={() => setActiveVideo(item)}
                    >
                      <div>
                        <div className="relative overflow-hidden bg-black border-b border-slate-950 aspect-video flex items-center justify-center">
                          <img
                            src={thumbnailUrl(item.id)}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              const imageElement = e.currentTarget as HTMLImageElement;
                              imageElement.src = mediaFileUrl(item.path);
                              imageElement.onerror = () => {
                                imageElement.style.display = 'none';
                              };
                            }}
                          />
                          <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                            <div className="p-3 rounded-full bg-sky-500 text-slate-950 scale-90 group-hover:scale-100 transition-transform duration-300 shadow">
                              <Play size={16} fill="currentColor" className="translate-x-0.5" />
                            </div>
                          </div>
                        </div>
                        <div className="media-card-body">
                          <h4 className="text-sm font-bold text-white truncate group-hover:text-sky-400 transition" title={item.title}>
                            {item.title}
                          </h4>
                          <p className="text-xs font-mono text-slate-500 truncate mt-1 select-all" title={item.path}>
                            {item.path}
                          </p>
                        </div>
                      </div>
                      <div className="px-4 pb-4 pt-1 flex justify-between items-center text-[10px] text-slate-400 font-mono border-t border-slate-900/40">
                        <span>{formatSize(item.sizeBytes)}</span>
                        <span>{formatDate(item.updatedAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="panel overflow-hidden p-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                          <th className="py-3 px-4">Name</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4">Size</th>
                          <th className="py-3 px-4 text-right">Modified</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {files.map((item) => {
                          const FileIcon = getFileIcon(item.mimeType, item.title);
                          return (
                            <tr
                              draggable
                              onDragStart={(e) => handleDragStart(e, item, false)}
                              className={`hover:bg-slate-900/40 transition-colors group cursor-grab active:cursor-grabbing ${
                                selectedItem?.id === item.id ? 'bg-sky-500/5' : ''
                              }`}
                              key={item.id}
                              onClick={() => setSelectedItem(item)}
                              onDoubleClick={() => {
                                if (item.kind === 'movie') {
                                  setActiveVideo(item);
                                }
                              }}
                            >
                              <td className="py-3.5 px-4 font-semibold text-white flex items-center gap-3">
                                <FileIcon size={16} className="text-slate-400 group-hover:text-sky-400 transition" />
                                <span className="truncate max-w-xs">{item.title}</span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-400 font-mono">
                                {item.mimeType || 'file'}
                              </td>
                              <td className="py-3.5 px-4 text-slate-300 font-mono">
                                {formatSize(item.sizeBytes)}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono text-slate-500">
                                {formatDate(item.updatedAt)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Details Side Panel */}
      {selectedItem && (
        <aside className="w-full lg:w-[320px] shrink-0 panel space-y-6">
          <div className="flex justify-between items-center pb-3 border-b border-white/5">
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">Details</h3>
            <button 
              onClick={() => setSelectedItem(null)}
              className="p-1 rounded-lg hover:bg-slate-900/80 text-slate-400 hover:text-white transition"
            >
              <X size={16} />
            </button>
          </div>

          {/* Details Body */}
          <div className="space-y-6">
            {/* Visual Preview */}
            <div className="aspect-video bg-slate-900/60 rounded-2xl border border-slate-800 flex items-center justify-center overflow-hidden relative">
              {selectedItem.isFolder ? (
                <FolderOpen size={48} className="text-teal-400/70" />
              ) : selectedItem.mimeType?.startsWith('image/') ? (
                <img 
                  src={thumbnailUrl(selectedItem.id)} 
                  alt={selectedItem.title} 
                  className="w-full h-full object-cover" 
                  onError={(e) => { e.currentTarget.src = mediaFileUrl(selectedItem.path); }}
                />
              ) : selectedItem.mimeType?.startsWith('video/') ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img 
                    src={thumbnailUrl(selectedItem.id)} 
                    alt={selectedItem.title} 
                    className="w-full h-full object-cover opacity-60" 
                  />
                  <button 
                    onClick={() => setActiveVideo(selectedItem)}
                    className="absolute p-3 rounded-full bg-sky-500 text-slate-950 shadow"
                  >
                    <Play size={16} fill="currentColor" className="translate-x-0.5" />
                  </button>
                </div>
              ) : (
                React.createElement(getFileIcon(selectedItem.mimeType, selectedItem.title), {
                  size: 40,
                  className: "text-slate-400/80"
                })
              )}
            </div>

            {/* Metadata Info */}
            <div className="space-y-4 text-xs">
              <div>
                <span className="text-slate-500 block mb-0.5">Name</span>
                <strong className="text-white text-sm break-words block">
                  {selectedItem.isFolder ? selectedItem.name : selectedItem.title}
                </strong>
              </div>

              {!selectedItem.isFolder && (
                <>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Mime Type</span>
                    <strong className="text-slate-300 font-mono block">{selectedItem.mimeType || 'unknown'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Size</span>
                    <strong className="text-slate-300 font-mono block">{formatSize(selectedItem.sizeBytes)}</strong>
                  </div>
                </>
              )}

              <div>
                <span className="text-slate-500 block mb-0.5">Location</span>
                <code className="text-slate-400 font-mono text-[10px] break-all block p-2 bg-slate-900/60 border border-slate-800 rounded-xl max-h-[80px] overflow-y-auto">
                  {selectedItem.isFolder ? `${activeCategory.folder}/${selectedItem.path}` : selectedItem.path}
                </code>
              </div>

              <div>
                <span className="text-slate-500 block mb-0.5">Last Modified</span>
                <strong className="text-slate-300 font-mono block">
                  {selectedItem.isFolder ? 'N/A' : formatDate(selectedItem.updatedAt)}
                </strong>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-white/5 space-y-2.5 flex flex-col">
              {!selectedItem.isFolder && (
                <a
                  href={mediaFileUrl(selectedItem.path)}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="liquid-button liquid-button-accent justify-center w-full py-2.5 font-mono text-xs"
                >
                  <FileDown size={14} />
                  DOWNLOAD FILE
                </a>
              )}

              <button
                onClick={() => {
                  setRenameValue(selectedItem.isFolder ? selectedItem.name : selectedItem.title);
                  setShowRenameModal(true);
                }}
                className="liquid-button justify-center w-full py-2.5 font-mono text-xs"
              >
                <Edit2 size={14} className="text-amber-400 mr-1.5" />
                RENAME
              </button>

              <button
                onClick={handleDelete}
                className="liquid-button justify-center w-full py-2.5 font-mono text-xs hover:text-red-400 hover:border-red-500/20"
              >
                <Trash2 size={14} className="text-red-500 mr-1.5" />
                DELETE
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Upload Progress Overlay */}
      {uploadProgress !== null && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur z-50 p-6">
          <div className="panel max-w-sm w-full text-center space-y-4 border-sky-500/20 shadow-2xl">
            <Loader2 size={36} className="animate-spin text-sky-400 mx-auto" />
            <div>
              <h4 className="text-base font-semibold text-white">Uploading Files</h4>
              <p className="text-xs text-slate-400 mt-1 truncate">
                {uploadingFiles.length === 1 ? uploadingFiles[0] : `${uploadingFiles.length} files...`}
              </p>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-slate-900 border border-slate-800 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-sky-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="font-mono text-xs text-slate-300 block">{uploadProgress}%</span>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/85 backdrop-blur z-50 p-6">
          <div className="panel max-w-md w-full space-y-5 border-slate-800/80 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Create New Folder</h4>
              <button 
                onClick={() => setShowNewFolderModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X size={16} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="liquid-input font-mono text-xs"
              autoFocus
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold font-mono transition"
              >
                CANCEL
              </button>
              <button
                onClick={handleCreateFolder}
                className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold font-mono transition shadow"
              >
                CREATE FOLDER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/85 backdrop-blur z-50 p-6">
          <div className="panel max-w-md w-full space-y-5 border-slate-800/80 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Rename Item</h4>
              <button 
                onClick={() => setShowRenameModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X size={16} />
              </button>
            </div>
            <input
              type="text"
              placeholder="New name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="liquid-input font-mono text-xs"
              autoFocus
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowRenameModal(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold font-mono transition"
              >
                CANCEL
              </button>
              <button
                onClick={handleRename}
                className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold font-mono transition shadow"
              >
                CONFIRM RENAME
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
