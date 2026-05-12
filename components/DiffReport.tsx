'use client';

interface Difference {
  clause: string;
  contract_a: string;
  contract_b: string;
  risk_level: 'high' | 'medium' | 'low';
  explanation: string;
}

interface ReportData {
  summary?: string;
  material_differences?: Difference[];
  risk_score?: { contract_a: number; contract_b: number };
  negotiation_brief?: string;
  favorable_contract?: string;
  favorable_reason?: string;
}

const RISK_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

function RiskBadge({ level }: { level: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${RISK_COLORS[level] ?? 'bg-stone-100 text-stone-600 border-stone-200'}`}>
      {level}
    </span>
  );
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-stone-700">{label}</span>
        <span className="font-bold">{score}</span>
      </div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function DiffReport({ data }: { data: ReportData }) {
  return (
    <div className="space-y-8">
      {/* Summary */}
      {data.summary && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">Executive Summary</h3>
          <p className="text-stone-800 leading-relaxed">{data.summary}</p>
          {data.favorable_contract && (
            <div className="mt-4 text-sm text-stone-600">
              <span className="font-semibold">Favorable:</span> Contract {data.favorable_contract} — {data.favorable_reason}
            </div>
          )}
        </div>
      )}

      {/* Risk scores */}
      {data.risk_score && (
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-4">Risk Scores (0 = low risk)</h3>
          <div className="space-y-4">
            <ScoreBar score={data.risk_score.contract_a} label="Contract A" />
            <ScoreBar score={data.risk_score.contract_b} label="Contract B" />
          </div>
        </div>
      )}

      {/* Material differences */}
      {data.material_differences && data.material_differences.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-green-800 font-medium text-sm">No material differences found</p>
          <p className="text-green-700 text-xs mt-1">The contracts are substantively identical in their legal terms.</p>
        </div>
      )}
      {data.material_differences && data.material_differences.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-4">
            Material Differences ({data.material_differences.length})
          </h3>
          <div className="space-y-4">
            {data.material_differences.map((diff, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-3 border-b border-stone-100">
                  <h4 className="font-semibold text-stone-800">{diff.clause}</h4>
                  <RiskBadge level={diff.risk_level} />
                </div>
                <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-100">
                  <div className="px-6 py-4">
                    <div className="text-xs font-medium text-stone-400 mb-1">CONTRACT A</div>
                    <p className="text-sm text-stone-700 leading-relaxed">{diff.contract_a}</p>
                  </div>
                  <div className="px-6 py-4">
                    <div className="text-xs font-medium text-stone-400 mb-1">CONTRACT B</div>
                    <p className="text-sm text-stone-700 leading-relaxed">{diff.contract_b}</p>
                  </div>
                </div>
                {diff.explanation && (
                  <div className="px-6 py-3 bg-stone-50 border-t border-stone-100">
                    <p className="text-xs text-stone-500">{diff.explanation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Negotiation brief */}
      {data.negotiation_brief && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wider mb-3">Negotiation Brief</h3>
          <div className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">{data.negotiation_brief}</div>
        </div>
      )}
    </div>
  );
}
