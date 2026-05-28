import React from 'react';
import { useAppStore } from '../../store/useAppStore';

export const RuntimeDashboard: React.FC = () => {
  const { health, runtime, mediaItems } = useAppStore();

  return (
    <div className="space-y-3 p-3">
      <h4 className="text-sm font-semibold text-slate-300">Runtime</h4>
      <div className="text-xs text-slate-400">
        <div>Version: <strong className="text-white">{runtime?.runtimeVersion ?? '—'}</strong></div>
        <div>Storage: <strong className="text-white">{runtime?.storageRoot ?? '—'}</strong></div>
        <div>Last Scan: <strong className="text-white">{runtime?.lastScanAt ?? '—'}</strong></div>
        <div>DB: <strong className="text-white">{health?.databaseStatus ?? '—'}</strong></div>
        <div>Filesystem: <strong className="text-white">{health?.filesystemStatus ?? '—'}</strong></div>
        <div className="mt-2">Indexed Items: <strong className="text-white">{mediaItems.length}</strong></div>
      </div>
    </div>
  );
};
