// Status badge showing index stats
'use client';

import { useState, useEffect } from 'react';

interface StatusResponse {
  indexed: boolean;
  meta?: {
    stats?: {
      chunks?: number;
    };
  };
}

export function StatusBadge() {
  const [chunks, setChunks] = useState<number | null>(null);
  const [indexed, setIndexed] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch('/api/status');
        if (!response.ok) throw new Error('Failed to fetch');
        const data: StatusResponse = await response.json();
        setIndexed(data.indexed ?? false);
        setChunks(data.meta?.stats?.chunks ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error');
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, []);

  if (error) {
    return (
      <div className="text-xs text-error px-2 py-1 rounded bg-error/10">
        API error
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-xs text-text-secondary px-2 py-1 rounded bg-surface animate-pulse">
        Loading...
      </div>
    );
  }

  if (!indexed || chunks === null) {
    return (
      <div className="text-xs text-warning px-2 py-1 rounded bg-warning/10">
        No index found
      </div>
    );
  }

  return (
    <div className="text-xs text-success px-2 py-1 rounded bg-success/10 flex items-center gap-2">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
      {chunks.toLocaleString()} chunks
    </div>
  );
}
