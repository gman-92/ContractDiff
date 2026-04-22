'use client';

import { useState } from 'react';

interface ReportData {
  summary?: string;
  material_differences?: Array<{
    clause: string;
    contract_a: string;
    contract_b: string;
    risk_level: string;
    explanation: string;
  }>;
  risk_score?: { contract_a: number; contract_b: number };
  negotiation_brief?: string;
}

export function ExportButton({ data }: { data: ReportData }) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const { pdf, Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer');

      const styles = StyleSheet.create({
        page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
        title: { fontSize: 18, marginBottom: 20, fontFamily: 'Helvetica-Bold' },
        section: { marginBottom: 16 },
        heading: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
        text: { lineHeight: 1.5, color: '#444' },
        row: { flexDirection: 'row', marginBottom: 4 },
        label: { width: 100, fontFamily: 'Helvetica-Bold', color: '#666' },
      });

      const doc = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <Document>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Page size="A4" style={styles.page}>
            <Text style={styles.title}>ContractDiff Report</Text>

            {data.summary && (
              <View style={styles.section}>
                <Text style={styles.heading}>Executive Summary</Text>
                <Text style={styles.text}>{data.summary}</Text>
              </View>
            )}

            {data.risk_score && (
              <View style={styles.section}>
                <Text style={styles.heading}>Risk Scores</Text>
                <View style={styles.row}>
                  <Text style={styles.label}>Contract A:</Text>
                  <Text>{data.risk_score.contract_a}/100</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Contract B:</Text>
                  <Text>{data.risk_score.contract_b}/100</Text>
                </View>
              </View>
            )}

            {data.material_differences && data.material_differences.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.heading}>Material Differences</Text>
                {data.material_differences.map((d, i) => (
                  <View key={i} style={{ marginBottom: 10 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold' }}>{d.clause} [{d.risk_level}]</Text>
                    <Text style={styles.text}>A: {d.contract_a}</Text>
                    <Text style={styles.text}>B: {d.contract_b}</Text>
                    <Text style={{ ...styles.text, color: '#888' }}>{d.explanation}</Text>
                  </View>
                ))}
              </View>
            )}

            {data.negotiation_brief && (
              <View style={styles.section}>
                <Text style={styles.heading}>Negotiation Brief</Text>
                <Text style={styles.text}>{data.negotiation_brief}</Text>
              </View>
            )}
          </Page>
        </Document>
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await (pdf as any)(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contractdiff-report.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('PDF export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 border border-stone-200 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-50 transition-colors disabled:opacity-50"
    >
      {loading ? 'Exporting…' : '↓ Export PDF'}
    </button>
  );
}
