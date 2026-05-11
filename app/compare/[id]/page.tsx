'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { DiffReport } from '@/components/DiffReport';
import { ExportButton } from '@/components/ExportButton';
import { TextDiff } from '@/components/TextDiff';

interface ComparisonRow {
  id: string;
  contract_a_name?: string;
  contract_b_name?: string;
  result_json: Record<string, unknown> | null;
  status: 'processing' | 'done' | 'error';
  error_message?: string | null;
  created_at: string;
}

export default function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const [comparison, setComparison] = useState<ComparisonRow | null>(null);
  const [fetchError, setFetchError] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/comparison/${id}`);
        const json = await res.json() as ComparisonRow & { error?: string; code?: string };

        if (!res.ok) {
          if (!cancelled) setFetchError(`${json.error ?? 'Not found'}${json.code ? ` (${json.code})` : ''}`);
          return;
        }

        if (cancelled) return;
        setComparison(json);

        if (json.status === 'processing') {
          timerRef.current = setTimeout(poll, 3000);
        }
      } catch (e: unknown) {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : 'Network error');
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [id]);

  // Initial fetch not yet returned
  if (!comparison && !fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-stone-400 text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  // Network / 404 error
  if (fetchError || !comparison) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-stone-800 font-medium mb-2">Comparison not found.</p>
          <p className="text-stone-500 text-sm mb-1 font-mono">ID: {id}</p>
          {fetchError && (
            <p className="text-red-600 text-sm mb-4 font-mono break-all">{fetchError}</p>
          )}
          <Link href="/dashboard" className="text-stone-900 font-medium hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Still processing — show animated progress screen
  if (comparison.status === 'processing') {
    const nameA = comparison.contract_a_name ?? 'Contract A';
    const nameB = comparison.contract_b_name ?? 'Contract B';
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <div className="w-12 h-12 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin mx-auto mb-6" />
          <h2
            className="text-xl font-semibold text-stone-900 mb-4"
            style={{ fontFamily: 'Playfair Display, Georgia, serif' }}
          >
            Analyzing contracts…
          </h2>
          <p className="text-stone-600 text-sm mb-1 truncate">{nameA}</p>
          <p className="text-stone-400 text-xs mb-1">vs</p>
          <p className="text-stone-600 text-sm mb-6 truncate">{nameB}</p>
          <p className="text-stone-400 text-xs leading-relaxed">
            Scanned documents take 1–3 minutes.<br />This page updates automatically.
          </p>
        </div>
      </div>
    );
  }

  // Processing failed
  if (comparison.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-stone-800 font-medium mb-2">Analysis failed.</p>
          {comparison.error_message && (
            <p className="text-red-600 text-sm mb-4">{comparison.error_message}</p>
          )}
          <Link href="/dashboard" className="text-stone-900 font-medium hover:underline">
            ← Try again
          </Link>
        </div>
      </div>
    );
  }

  // Done but result missing (shouldn't happen)
  if (!comparison.result_json) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-stone-400 text-sm">No result data found.</p>
      </div>
    );
  }

  const { _text_a, _text_b, _name_a, _name_b, ...aiFields } = comparison.result_json;
  const reportData = aiFields as Parameters<typeof DiffReport>[0]['data'];
  const textA = (_text_a as string) ?? '';
  const textB = (_text_b as string) ?? '';
  const labelA = (comparison.contract_a_name ?? _name_a as string) ?? 'Contract A';
  const labelB = (comparison.contract_b_name ?? _name_b as string) ?? 'Contract B';

  return (
    <div className="min-h-screen bg-stone-50">
      <nav className="border-b border-stone-200 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            ContractDiff
          </Link>
          <div className="flex items-center gap-3">
            <ExportButton data={reportData} />
            <Link href="/dashboard" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">
              ← New comparison
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1
            className="text-3xl font-bold text-stone-900 mb-1"
            style={{ fontFamily: 'Playfair Display, Georgia, serif' }}
          >
            Comparison Report
          </h1>
          <p className="text-stone-500 text-sm">
            {labelA} vs {labelB} · {new Date(comparison.created_at).toLocaleDateString()}
          </p>
        </div>

        <DiffReport data={reportData} />

        <div className="mt-8">
          <TextDiff textA={textA} textB={textB} labelA={labelA} labelB={labelB} />
        </div>
      </main>
    </div>
  );
}
