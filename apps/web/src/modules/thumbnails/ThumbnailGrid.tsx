import React from 'react';
import { buildRuntimeUrl } from '@mediagrid/api';
import { useAppStore } from '../../store/useAppStore';

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

export const ThumbnailGrid: React.FC = () => {
  const { mediaItems, loadingMedia } = useAppStore();

  if (loadingMedia) {
    return <div className="p-6 text-slate-400">Loading thumbnails…</div>;
  }

  if (mediaItems.length === 0) {
    return <div className="p-6 text-slate-500">No thumbnails available</div>;
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      {mediaItems.map((m) => (
        <div key={m.id} className="rounded overflow-hidden bg-slate-900/40 border border-slate-800">
          <img
            src={withAuthToken(`/media/thumbnail/${m.id}`)}
            alt={m.title}
            loading="lazy"
            className="w-full h-36 object-cover bg-black"
            onError={(e) => {
              // fallback to media file preview
              (e.currentTarget as HTMLImageElement).src = withAuthToken(`/media-file/${encodeURIComponent(m.path)}`);
            }}
          />
          <div className="p-2 text-xs text-slate-300 truncate">{m.title}</div>
        </div>
      ))}
    </div>
  );
};
