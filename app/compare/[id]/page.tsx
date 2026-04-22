import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase.server';
import { DiffReport } from '@/components/DiffReport';
import { ExportButton } from '@/components/ExportButton';
import { TextDiff } from '@/components/TextDiff';

export default async function ComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('comparisons')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-stone-500 mb-4">Comparison not found.</p>
          <Link href="/dashboard" className="text-stone-900 font-medium hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const comparison = data as {
    id: string;
    contract_a_name?: string;
    contract_b_name?: string;
    result_json: Record<string, unknown>;
    created_at: string;
  };

  const { _text_a, _text_b, ...aiFields } = comparison.result_json;
  const reportData = aiFields as Parameters<typeof DiffReport>[0]['data'];
  const textA = (_text_a as string) ?? '';
  const textB = (_text_b as string) ?? '';

  return (
    <div className="min-h-screen bg-stone-50">
      <nav className="border-b border-stone-200 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            ContractDiff
          </Link>
          <div className="flex items-center gap-3">
            <ExportButton data={reportData} />
            <Link
              href="/dashboard"
              className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
            >
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
            {comparison.contract_a_name ?? 'Contract A'} vs {comparison.contract_b_name ?? 'Contract B'} ·{' '}
            {new Date(comparison.created_at).toLocaleDateString()}
          </p>
        </div>

        <DiffReport data={reportData} />

        <div className="mt-8">
          <TextDiff
            textA={textA}
            textB={textB}
            labelA={comparison.contract_a_name ?? 'Contract A'}
            labelB={comparison.contract_b_name ?? 'Contract B'}
          />
        </div>
      </main>
    </div>
  );
}
