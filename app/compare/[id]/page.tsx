'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { DiffReport } from '@/components/DiffReport';
import { ExportButton } from '@/components/ExportButton';
import { TextDiff } from '@/components/TextDiff';

interface ComparisonRow {
  id: string;
  contract_a_name?: string;
  contract_b_name?: string;
  result_json: Record<string, unknown>;
  created_at: string;
}

export default function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const [comparison, setComparison] = useState<ComparisonRow | null>(null);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (!id) return;

    // Try sessionStorage first (populated immediately after analysis)
    const cached = sessionStorage.getItem(`comparison-${id}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Record<string, unknown>;
        setComparison({
          id,
          contract_a_name: parsed._name_a as string | undefined,
          contract_b_name: parsed._name_b as string | undefined,
          result_json: parsed,
          created_at: new Date().toISOString(),
        });
        return;
      } catch {
        // fall through to fetch
      }
    }

    // Fall back to fetching from Supabase via API route
    fetch(`/api/comparison/${id}`)
      .then(async (r) => {
        const json = await r.json() as ComparisonRow & { error?: string; code?: string };
        if (!r.ok) {
          setFetchError(`${json.error ?? 'Not found'}${json.code ? ` (${json.code})` : ''}`);
        } else {
          setComparison(json);
        }
      })
      .catch((e: Error) => setFetchError(e.message));
  }, [id]);

  if (!comparison && !fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-stone-400 text-sm animate-pulse">Loading comparison…</p>
      </div>
    );
  }

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
          <h1 className="text-3xl font-bold text-stone-900 mb-1" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
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
