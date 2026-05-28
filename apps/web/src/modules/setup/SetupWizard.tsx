import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { submitSetup, browseStorageRoot } from '../../services/runtime';
import { FolderOpen, HardDrive, Sparkles, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

export const SetupWizard: React.FC = () => {
  const { availableDrives, isSettingUp } = useAppStore();
  const [selectedPath, setSelectedPath] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleDriveSelect = (drive: string) => {
    // Append MediaGrid as folder on selected drive root
    const standardizedDrive = drive.endsWith('\\') || drive.endsWith('/') ? drive : `${drive}/`;
    setSelectedPath(`${standardizedDrive}MediaGrid`);
    setErrorMsg(null);
  };

  const handleBrowse = async () => {
    try {
      const folder = await browseStorageRoot();
      if (folder) {
        setSelectedPath(folder);
        setErrorMsg(null);
      }
    } catch (err) {
      setErrorMsg('Failed to launch folder browser.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPath.trim()) {
      setErrorMsg('Please specify a valid storage path.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);

    const result = await submitSetup(selectedPath.trim());
    if (result.success) {
      setSuccessMsg('MediaGrid storage root successfully configured!');
    } else {
      setErrorMsg(result.error || 'Failed to complete setup configuration.');
    }
  };

  // Determine if running inside Tauri context to show browse button
  // @ts-ignore
  const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#07111d] p-6 text-slate-300">
      <div className="w-full max-w-lg bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-md shadow-2xl relative overflow-hidden">
        
        {/* Decorative background gradients */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />

        <div className="relative z-10">
          <header className="text-center mb-8">
            <div className="inline-flex p-4 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-2xl mb-4">
              <Sparkles size={32} />
            </div>
            <h2 className="text-white text-2xl font-extrabold tracking-wide">
              Initialize MediaGrid Storage
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-[40ch] mx-auto leading-relaxed">
              Define the storage root directory where your music, movies, photos, and databases will reside.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Quick Drive Selector */}
            {availableDrives.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-3">
                  Select Available Storage Drive
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {availableDrives.map((drive) => (
                    <button
                      key={drive}
                      type="button"
                      onClick={() => handleDriveSelect(drive)}
                      className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-800/40 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-800/80 transition-all text-left group"
                    >
                      <HardDrive size={18} className="text-slate-500 group-hover:text-sky-400 transition-colors" />
                      <span className="text-xs font-bold text-white font-mono">{drive}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Path Selection Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">
                Target Storage Root Path
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. D:/MediaGrid"
                  value={selectedPath}
                  onChange={(e) => setSelectedPath(e.target.value)}
                  className="flex-1 bg-slate-950/80 border border-slate-800 focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/30 rounded-2xl px-4 py-3.5 text-sm text-white font-mono placeholder:text-slate-600 transition-all outline-none"
                  required
                />
                {isTauri && (
                  <button
                    type="button"
                    onClick={handleBrowse}
                    className="px-4 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-2xl flex items-center justify-center transition-colors"
                    title="Browse Directory"
                  >
                    <FolderOpen size={20} />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-500 italic mt-1 leading-normal">
                All required catalog system directories (`media/movies`, `cache/thumbnails`, etc.) will be created inside this path automatically.
              </p>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="flex items-start gap-3 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <div className="text-xs font-medium leading-relaxed">{errorMsg}</div>
              </div>
            )}

            {/* Success Message */}
            {successMsg && (
              <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                <div className="text-xs font-medium leading-relaxed">{successMsg}</div>
              </div>
            )}

            {/* Submit Action */}
            <button
              type="submit"
              disabled={isSettingUp || !selectedPath.trim()}
              className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm tracking-wide disabled:opacity-50 transition-all shadow-lg shadow-sky-500/15 cursor-pointer active:scale-[0.98]"
            >
              {isSettingUp ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>INITIALIZING FILE STRUCTURE...</span>
                </>
              ) : (
                <span>COMPLETE STORAGE SETUP</span>
              )}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
};
