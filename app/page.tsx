import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-bold" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>
            ContractDiff
          </span>
          <div className="flex items-center gap-4">
            <Link href="/auth" className="text-stone-600 hover:text-stone-900 text-sm font-medium">
              Sign in
            </Link>
            <Link
              href="/auth"
              className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700 transition-colors"
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full inline-block" />
          AI-powered contract intelligence
        </div>
        <h1
          className="text-5xl md:text-6xl font-bold text-stone-900 mb-6 leading-tight max-w-3xl"
          style={{ fontFamily: 'Playfair Display, Georgia, serif' }}
        >
          Compare contracts in{' '}
          <span className="text-amber-700">seconds, not hours</span>
        </h1>
        <p className="text-lg text-stone-600 max-w-xl mb-10 leading-relaxed">
          Upload two contracts and get an instant AI analysis — material differences, risk scores,
          and a negotiation brief your attorney would be proud of.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/auth"
            className="bg-stone-900 text-white px-8 py-3 rounded-lg font-semibold hover:bg-stone-700 transition-colors"
          >
            Start comparing for free
          </Link>
          <a
            href="#pricing"
            className="border border-stone-300 text-stone-700 px-8 py-3 rounded-lg font-semibold hover:bg-stone-100 transition-colors"
          >
            View pricing
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white border-y border-stone-200 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-3xl font-bold text-center text-stone-900 mb-12"
            style={{ fontFamily: 'Playfair Display, Georgia, serif' }}
          >
            Everything you need to negotiate with confidence
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '⚖️',
                title: 'Material Differences',
                desc: 'Clause-by-clause breakdown of every meaningful change between two contract versions.',
              },
              {
                icon: '🎯',
                title: 'Risk Scoring',
                desc: 'Instant 0–100 risk scores for each contract so you know which terms favor you.',
              },
              {
                icon: '💬',
                title: 'Negotiation Brief',
                desc: 'Actionable talking points ready to share with your counterparty or attorney.',
              },
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

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2
            className="text-3xl font-bold text-center text-stone-900 mb-12"
            style={{ fontFamily: 'Playfair Display, Georgia, serif' }}
          >
            Simple pricing
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'Free',
                price: '$0',
                per: 'forever',
                features: ['3 comparisons/month', 'PDF & DOCX support', 'Risk scoring'],
                cta: 'Get started',
                highlight: false,
              },
              {
                name: 'Pro',
                price: '$79',
                per: '/month',
                features: ['Unlimited comparisons', 'Priority AI processing', 'PDF export', 'Email support'],
                cta: 'Start Pro trial',
                highlight: true,
              },
              {
                name: 'Credits',
                price: '$25',
                per: '10 comparisons',
                features: ['Pay as you go', 'No subscription', 'All Pro features'],
                cta: 'Buy credits',
                highlight: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-8 ${
                  plan.highlight ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200'
                }`}
              >
                <div className="text-sm font-medium mb-2 opacity-70">{plan.name}</div>
                <div className="text-4xl font-bold mb-1">{plan.price}</div>
                <div className="text-sm opacity-60 mb-6">{plan.per}</div>
                <ul className="space-y-2 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="text-sm flex items-center gap-2">
                      <span className="text-green-500">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth"
                  className={`block text-center py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    plan.highlight ? 'bg-white text-stone-900 hover:bg-stone-100' : 'bg-stone-900 text-white hover:bg-stone-700'
                  }`}
                >
                  {plan.cta}
                </Link>
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
