#!/bin/bash
set -e
echo "Creating ContractDiff project files..."

mkdir -p lib components app/api/analyze app/api/webhooks/stripe app/api/create-checkout app/auth app/dashboard "app/compare/[id]" supabase

# ── next.config.ts ────────────────────────────────────────────────────────────
cat > next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfjs-dist', 'mammoth'],
};

export default nextConfig;
EOF

# ── app/globals.css ───────────────────────────────────────────────────────────
cat > app/globals.css << 'EOF'
@import "tailwindcss";

:root {
  --background: #fafaf9;
  --foreground: #1c1917;
}

body {
  background: var(--background);
  color: var(--foreground);
}
EOF

# ── app/layout.tsx ────────────────────────────────────────────────────────────
cat > app/layout.tsx << 'EOF'
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ContractDiff — AI Contract Comparison',
  description: 'Upload two contracts and get an instant AI-powered comparison with risk scores and negotiation briefs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
EOF

# ── app/page.tsx ──────────────────────────────────────────────────────────────
cat > app/page.tsx << 'EOF'
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-bold" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>ContractDiff</span>
          <div className="flex items-center gap-4">
            <Link href="/auth" className="text-stone-600 hover:text-stone-900 text-sm font-medium">Sign in</Link>
            <Link href="/auth" className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700 transition-colors">Get started free</Link>
          </div>
        </div>
      </nav>

      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full inline-block" />
          AI-powered contract intelligence
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-stone-900 mb-6 leading-tight max-w-3xl" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
          Compare contracts in <span className="text-amber-700">seconds, not hours</span>
        </h1>
        <p className="text-lg text-stone-600 max-w-xl mb-10 leading-relaxed">
          Upload two contracts and get an instant AI analysis — material differences, risk scores, and a negotiation brief.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/auth" className="bg-stone-900 text-white px-8 py-3 rounded-lg font-semibold hover:bg-stone-700 transition-colors">Start comparing for free</Link>
          <a href="#pricing" className="border border-stone-300 text-stone-700 px-8 py-3 rounded-lg font-semibold hover:bg-stone-100 transition-colors">View pricing</a>
        </div>
      </section>

      <section className="bg-white border-y border-stone-200 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-stone-900 mb-12" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Everything you need to negotiate with confidence</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: '⚖️', title: 'Material Differences', desc: 'Clause-by-clause breakdown of every meaningful change.' },
              { icon: '🎯', title: 'Risk Scoring', desc: 'Instant 0–100 risk scores so you know which terms favor you.' },
              { icon: '💬', title: 'Negotiation Brief', desc: 'Actionable talking points ready for your counterparty.' },
            ].map((f) => (
              <div key={f.title} className="text-center p-6">
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-semibold text-stone-900 mb-2">{f.title}</h3>
                <p className="text-stone-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-stone-900 mb-12" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Simple pricing</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'Free', price: '$0', per: 'forever', features: ['3 comparisons/month', 'PDF & DOCX support', 'Risk scoring'], cta: 'Get started', highlight: false },
              { name: 'Pro', price: '$79', per: '/month', features: ['Unlimited comparisons', 'Priority AI processing', 'PDF export', 'Email support'], cta: 'Start Pro trial', highlight: true },
              { name: 'Credits', price: '$25', per: '10 comparisons', features: ['Pay as you go', 'No subscription', 'All Pro features'], cta: 'Buy credits', highlight: false },
            ].map((plan) => (
              <div key={plan.name} className={`rounded-2xl border p-8 ${plan.highlight ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200'}`}>
                <div className="text-sm font-medium mb-2 opacity-70">{plan.name}</div>
                <div className="text-4xl font-bold mb-1">{plan.price}</div>
                <div className="text-sm opacity-60 mb-6">{plan.per}</div>
                <ul className="space-y-2 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="text-sm flex items-center gap-2"><span className="text-green-500">✓</span> {f}</li>
                  ))}
                </ul>
                <Link href="/auth" className={`block text-center py-2.5 rounded-lg text-sm font-semibold transition-colors ${plan.highlight ? 'bg-white text-stone-900 hover:bg-stone-100' : 'bg-stone-900 text-white hover:bg-stone-700'}`}>{plan.cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200 py-8 text-center text-sm text-stone-400">
        © {new Date().getFullYear()} ContractDiff. Built for SMBs who negotiate.
      </footer>
    </div>
  );
}
EOF

echo "✓ app files written"

# ── app/auth/page.tsx ─────────────────────────────────────────────────────────
cat > app/auth/page.tsx << 'EOF'
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { createBrowserClient } = await import('@/lib/supabase');
      const supabase = createBrowserClient();
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Check your email for a confirmation link.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally { setLoading(false); }
  }

  async function handleGoogleAuth() {
    setError(''); setLoading(true);
    try {
      const { createBrowserClient } = await import('@/lib/supabase');
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/dashboard` } });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>ContractDiff</Link>
          <p className="mt-2 text-stone-500 text-sm">{mode === 'signin' ? 'Sign in to your account' : 'Create a free account'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200 p-8 shadow-sm">
          {message ? (
            <div className="text-center text-green-700 bg-green-50 border border-green-200 rounded-lg p-4 text-sm">{message}</div>
          ) : (
            <>
              <button onClick={handleGoogleAuth} disabled={loading} className="w-full flex items-center justify-center gap-3 border border-stone-200 rounded-lg py-2.5 text-sm font-medium hover:bg-stone-50 transition-colors mb-6 disabled:opacity-50">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.3441 0-4.3282-1.5836-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9574C.3477 6.173 0 7.5482 0 9s.3477 2.827.9574 4.0418L3.964 10.71z" fill="#FBBC05"/><path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9574 4.9582L3.964 7.29C4.6718 5.1632 6.6559 3.5795 9 3.5795z" fill="#EA4335"/></svg>
                Continue with Google
              </button>
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-stone-200" /></div>
                <div className="relative flex justify-center text-xs text-stone-400 bg-white px-2">or</div>
              </div>
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors" placeholder="you@company.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors" placeholder="••••••••" />
                </div>
                {error && <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
                <button type="submit" disabled={loading} className="w-full bg-stone-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-stone-700 transition-colors disabled:opacity-50">
                  {loading ? 'Loading…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>
              <p className="mt-4 text-center text-sm text-stone-500">
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="text-stone-900 font-medium hover:underline">
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
EOF

echo "✓ auth page written"
