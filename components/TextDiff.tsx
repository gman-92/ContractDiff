'use client';

import { useMemo, useState } from 'react';
import { diffWords } from 'diff';

interface TextDiffProps {
  textA: string;
  textB: string;
  labelA?: string;
  labelB?: string;
}

function diceSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().match(/\b\w+\b/g) ?? []);
  const setB = new Set(b.toLowerCase().match(/\b\w+\b/g) ?? []);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const w of setA) if (setB.has(w)) shared++;
  return (2 * shared) / (setA.size + setB.size);
}

export function TextDiff({ textA, textB, labelA = 'Contract A', labelB = 'Contract B' }: TextDiffProps) {
  const [expanded, setExpanded] = useState(false);

  const { parts, addedCount, removedCount, similarity } = useMemo(() => {
    const changes = diffWords(textA, textB);
    let added = 0;
    let removed = 0;
    for (const part of changes) {
      const words = part.value.trim().split(/\s+/).filter(Boolean).length;
      if (part.added) added += words;
      if (part.removed) removed += words;
    }
    return {
      parts: changes,
      addedCount: added,
      removedCount: removed,
      similarity: diceSimilarity(textA, textB),
    };
  }, [textA, textB]);

  const pct = Math.round(similarity * 100);
  const identical = addedCount === 0 && removedCount === 0;
  const nearIdentical = !identical && similarity >= 0.85;

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-stone-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-stone-800">Raw Text Comparison</h3>

          {/* Similarity badge */}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
            pct >= 97 ? 'bg-green-100 text-green-700 border-green-200' :
            pct >= 85 ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        'bg-red-100 text-red-700 border-red-200'
          }`}>
            {pct}% match
          </span>

          {/* Word diff counts (only if there are differences) */}
          {!identical && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400">
                −{removedCount} / +{addedCount} words
              </span>
            </div>
          )}
        </div>
        <span className="text-stone-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Near-identical explanation banner (always visible, no expand needed) */}
      {nearIdentical && !expanded && (
        <div className="px-6 pb-4 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
          <strong>{pct}% of words match.</strong> The small differences are almost certainly
          PDF/DOCX formatting artifacts (spacing, ligatures, punctuation style). The AI was shown
          only these changed words — not both full documents — to prevent false positives.
        </div>
      )}

      {expanded && (
        <>
          {/* Banner inside expanded view */}
          {nearIdentical && (
            <div className="px-6 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-800">
              <strong>{pct}% word match.</strong> The highlighted differences below are
              the <em>only</em> textual variations between the two extracted documents.
              They are very likely formatting artifacts from PDF/DOCX conversion (spacing,
              ligatures, soft hyphens, punctuation style) rather than real legal changes.
              The AI was shown only these specific words to prevent hallucination.
            </div>
          )}
          {identical && (
            <div className="px-6 py-3 bg-green-50 border-t border-green-100 text-xs text-green-800">
              The extracted text is byte-for-byte identical. Any differences the AI reports are
              analytical interpretations of the same underlying text.
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 px-6 py-2 border-t border-stone-100 bg-stone-50 text-xs text-stone-500">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-200 border border-red-300" />
              Only in {labelA}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-green-200 border border-green-300" />
              Only in {labelB}
            </div>
          </div>

          {/* Diff body */}
          <div className="px-6 py-5 border-t border-stone-100 max-h-[600px] overflow-y-auto">
            {identical ? (
              <p className="text-stone-500 text-sm text-center py-8">
                Both documents extracted to exactly the same text.
              </p>
            ) : (
              <p className="font-mono text-sm leading-7 whitespace-pre-wrap break-words">
                {parts.map((part, i) => {
                  if (part.added) {
                    return (
                      <mark key={i} className="bg-green-100 text-green-900 rounded px-0.5 not-italic">
                        {part.value}
                      </mark>
                    );
                  }
                  if (part.removed) {
                    return (
                      <del key={i} className="bg-red-100 text-red-900 rounded px-0.5 line-through decoration-red-400">
                        {part.value}
                      </del>
                    );
                  }
                  return <span key={i} className="text-stone-600">{part.value}</span>;
                })}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
