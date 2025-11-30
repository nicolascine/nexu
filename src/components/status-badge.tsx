// Status badge showing index stats
'use client';

import { useState, useEffect } from 'react';

interface IndexStatus {
  indexed: boolean;
  totalChunks: number;
  embeddingModel: string;
  storeType: string;
}

export function StatusBadge() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch('/api/status');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setStatus(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error');
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

  if (!status) {
    return (
      <div className="text-xs text-text-secondary px-2 py-1 rounded bg-surface animate-pulse">
        Loading...
      </div>
    );
  }

  if (!status.indexed) {
    return (
      <div className="text-xs text-warning px-2 py-1 rounded bg-warning/10">
        No index found
      </div>
    );
  }

  return (
    <div className="text-xs text-success px-2 py-1 rounded bg-success/10 flex items-center gap-2">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
      {status.totalChunks.toLocaleString()} chunks
    </div>
  );
}
