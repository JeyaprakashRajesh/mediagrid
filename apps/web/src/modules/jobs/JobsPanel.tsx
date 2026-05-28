import React from 'react';
import { inferBaseUrl } from '@mediagrid/api';

type JobRecord = {
  id: string;
  status: string;
  payload: any;
  created_at: string;
  updated_at?: string | null;
};

export const JobsPanel: React.FC = () => {
  const [jobs, setJobs] = React.useState<JobRecord[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const base = inferBaseUrl();
        const res = await fetch(`${base}/jobs`);
        if (!res.ok) throw new Error('Failed');
        const json = await res.json();
        if (mounted) setJobs(json.jobs || json || []);
      } catch (err) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="p-3 text-slate-400">Loading jobs…</div>;

  return (
    <div className="p-3 space-y-2 text-xs text-slate-300">
      <h4 className="text-sm font-semibold text-slate-300">Background Jobs</h4>
      {jobs.length === 0 ? (
        <div className="text-slate-500">No jobs</div>
      ) : (
        <div className="space-y-1">
          {jobs.map((j) => (
            <div key={j.id} className="p-2 rounded bg-slate-900/40 border border-slate-800 text-[11px]">
              <div className="flex justify-between items-center">
                <div className="truncate"><strong className="text-white">{j.id}</strong> <span className="text-slate-400">{j.payload?.type}</span></div>
                <div className="text-amber-300">{j.status}</div>
              </div>
              <div className="text-slate-500 text-[11px] mt-1">{j.created_at}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
