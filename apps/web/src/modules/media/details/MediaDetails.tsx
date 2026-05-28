import React from 'react';
import { inferBaseUrl } from '@mediagrid/api';
import type { MediaItem } from '@mediagrid/types';

export const MediaDetails: React.FC<{ mediaId: string }> = ({ mediaId }) => {
  const [details, setDetails] = React.useState<MediaItem | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const base = inferBaseUrl();
        const res = await fetch(`${base}/media/details/${encodeURIComponent(mediaId)}`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        if (mounted) setDetails(json as MediaItem);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load details');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [mediaId]);

  if (loading) return <div className="p-4 text-slate-400">Loading details…</div>;
  if (error) return <div className="p-4 text-rose-400">Error: {error}</div>;
  if (!details) return <div className="p-4 text-slate-500">No details available</div>;

  return (
    <div className="space-y-3 p-4">
      <h3 className="text-lg font-bold text-white">{details.title}</h3>
      <div className="text-sm text-slate-300 font-mono">{details.path}</div>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mt-2">
        <div>Kind: <strong className="text-white">{details.kind}</strong></div>
        <div>Category: <strong className="text-white">{details.category}</strong></div>
        <div>Size: <strong className="text-white">{details.sizeBytes ?? 'N/A'}</strong></div>
        <div>MIME: <strong className="text-white">{details.mimeType ?? 'N/A'}</strong></div>
        <div>Created: <strong className="text-white">{details.createdAt}</strong></div>
        <div>Updated: <strong className="text-white">{details.updatedAt}</strong></div>
      </div>
    </div>
  );
};
