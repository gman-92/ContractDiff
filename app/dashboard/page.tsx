'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UploadZone } from '@/components/UploadZone';

export default function DashboardPage() {
  const router = useRouter();
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { createBrowserClient } = await import('@/lib/supabase');
      const supabase = createBrowserClient();

      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!session) {
        router.replace('/auth');
        return;
      }
      tokenRef.current = session.access_token;

      // Keep token fresh when Supabase refreshes it
      supabase.auth.onAuthStateChange((_event, s) => {
        tokenRef.current = s?.access_token ?? null;
        if (!s) router.replace('/auth');
      });
    })();
    return () => { mounted = false; };
  }, [router]);

  const handleCompare = useCallback(async () => {
    if (!fileA || !fileB) return;
    setError('');
    setLoading(true);
    try {
      const token = tokenRef.current;
      if (!token) {
        router.replace('/auth');
        return;
      }

      const form = new FormData();
      form.append('contractA', fileA);
      form.append('contractB', fileB);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { id?: string; error?: string; result?: Record<string, unknown> };
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed');
      if (!data.id) throw new Error('No comparison ID returned — check Vercel function logs');
      // Store result in sessionStorage so the compare page can render immediately
      // without depending on a Supabase read succeeding
      if (data.result) {
        const payload = {
          ...data.result,
          _name_a: fileA.name,
          _name_b: fileB.name,
        };
        sessionStorage.setItem(`comparison-${data.id}`, JSON.stringify(payload));
      }
      router.push(`/compare/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }, [fileA, fileB, router]);

  async function handleSignOut() {
    const { createBrowserClient } = await import('@/lib/supabase');
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Nav */}
      <nav className="border-b border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            ContractDiff
          </Link>
          <button
            onClick={handleSignOut}
            className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-stone-900 mb-2" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
          Compare Contracts
        </h1>
        <p className="text-stone-500 mb-8">Upload two contracts to get an AI-powered comparison report.</p>

        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div>
            <div className="text-sm font-medium text-stone-700 mb-2">Contract A</div>
            <UploadZone label="Upload Contract A" file={fileA} onFile={setFileA} />
          </div>
          <div>
            <div className="text-sm font-medium text-stone-700 mb-2">Contract B</div>
            <UploadZone label="Upload Contract B" file={fileB} onFile={setFileB} />
          </div>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <button
          onClick={handleCompare}
          disabled={!fileA || !fileB || loading}
          className="w-full bg-stone-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Uploading…' : 'Compare contracts →'}
        </button>

        <p className="mt-4 text-center text-xs text-stone-400">
          Supports PDF, DOCX, JPG, PNG, and TIFF · scanned &amp; handwritten contracts supported · up to 10 MB each
        </p>
      </main>
    </div>
  );
}
