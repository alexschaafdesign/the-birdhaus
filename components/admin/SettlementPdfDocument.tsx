import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  formatCurrency,
  formatPct,
  dealTermsLabel,
  PAYEE_EXPENSE_FIELDS,
  SHOW_INCOME_FIELDS,
  VENUE_EXPENSE_FIELDS,
  VENUE_ADDITIONAL_INCOME_FIELDS,
  type SettlementValues,
  type SettlementSummary,
} from '@/lib/settlements';
import type { ShowBandPaidStatus } from '@/lib/bands';

const INK = '#2A2420';
const MUTED = '#6b6459';
const RULE = '#ddd6c9';
const CREAM = '#f4f1ea';

const styles = StyleSheet.create({
  page: { padding: 48, paddingBottom: 72, fontSize: 10, fontFamily: 'Helvetica', color: INK },
  header: { marginBottom: 20, borderBottom: `2px solid ${INK}`, paddingBottom: 12 },
  brand: { fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5 },
  subtitle: { fontSize: 10, color: MUTED, marginTop: 3 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, fontSize: 9, color: MUTED },
  columns: { flexDirection: 'row', marginBottom: 14 },
  column: { flex: 1 },
  columnGap: { width: 28 },
  sectionTitle: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.75,
    color: MUTED,
    marginBottom: 6,
    borderBottom: `1px solid ${RULE}`,
    paddingBottom: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  rowLabel: { color: INK },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTop: `1px solid ${MUTED}`,
    fontFamily: 'Helvetica-Bold',
  },
  dealSection: { marginBottom: 14 },
  summaryBox: { marginTop: 8, padding: 14, backgroundColor: CREAM, borderRadius: 3 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTop: `1px solid ${INK}`,
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
  },
  notes: { marginTop: 16 },
  notesText: { fontSize: 9.5, color: MUTED, lineHeight: 1.4 },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 8,
    color: MUTED,
    textAlign: 'center',
    borderTop: `1px solid ${RULE}`,
    paddingTop: 8,
  },
});

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={bold ? { ...styles.rowLabel, fontFamily: 'Helvetica-Bold' } : styles.rowLabel}>{label}</Text>
      <Text style={bold ? { fontFamily: 'Helvetica-Bold' } : undefined}>{value}</Text>
    </View>
  );
}

interface SettlementPdfDocumentProps {
  showTitle: string;
  showDate: string | null;
  values: SettlementValues;
  summary: SettlementSummary;
  bands: ShowBandPaidStatus[];
}

export default function SettlementPdfDocument({
  showTitle,
  showDate,
  values,
  summary,
  bands,
}: SettlementPdfDocumentProps) {
  const payoutBandCount = bands.filter((b) => !b.excluded).length;
  const incomeItems = values.extraLineItems.filter((item) => item.type === 'income');
  const expenseItems = values.extraLineItems.filter((item) => item.type === 'expense');
  const hasAdditionalIncome = VENUE_ADDITIONAL_INCOME_FIELDS.some((f) => values[f.key] !== 0);

  // showDate is a plain 'YYYY-MM-DD' string (see the `date::text` cast in the pdf
  // route) — appending a local midnight time avoids the UTC-parsing off-by-one
  // day shift that toLocaleDateString would otherwise introduce.
  const formattedShowDate = showDate
    ? new Date(`${showDate}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const generatedOn = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Document title={`Settlement — ${showTitle}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>THE BIRDHAUS</Text>
          <Text style={styles.subtitle}>Show Settlement Statement</Text>
          <View style={styles.metaRow}>
            <Text>{showTitle}</Text>
            {formattedShowDate && <Text>{formattedShowDate}</Text>}
          </View>
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Show Income</Text>
            {SHOW_INCOME_FIELDS.map(({ key, label }) => (
              <Row key={key} label={label} value={formatCurrency(values[key])} />
            ))}
            {incomeItems.map((item, i) => (
              <Row key={`extra-income-${i}`} label={item.label} value={formatCurrency(item.amount)} />
            ))}
            <View style={styles.totalRow}>
              <Text>Total Income</Text>
              <Text>{formatCurrency(summary.totalIncome)}</Text>
            </View>
          </View>

          <View style={styles.columnGap} />

          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Venue Expenses</Text>
            {VENUE_EXPENSE_FIELDS.map(({ key, label }) => {
              const payee = PAYEE_EXPENSE_FIELDS.find((p) => p.amountKey === key);
              const name = payee ? values[payee.nameKey] : null;
              return (
                <Row key={key} label={name ? `${label} — ${name}` : label} value={formatCurrency(values[key])} />
              );
            })}
            {expenseItems.map((item, i) => (
              <Row key={`extra-expense-${i}`} label={item.label} value={formatCurrency(item.amount)} />
            ))}
            <View style={styles.totalRow}>
              <Text>Total Expenses</Text>
              <Text>{formatCurrency(summary.totalExpenses)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.dealSection}>
          <Text style={styles.sectionTitle}>Deal Terms — {dealTermsLabel(values)}</Text>
          <Row label="Artist split" value={formatCurrency(summary.artistPool)} bold />
          <Row label={`Per band (${payoutBandCount})`} value={formatCurrency(summary.perBand)} />
          {bands.map((band) => (
            <View key={band.bandId} style={styles.row}>
              <Text
                style={
                  band.excluded
                    ? { ...styles.rowLabel, color: MUTED, textDecoration: 'line-through' }
                    : { ...styles.rowLabel, paddingLeft: 10 }
                }
              >
                {band.excluded ? band.name : `• ${band.name}`}
              </Text>
              <Text style={band.excluded ? { color: MUTED } : undefined}>
                {band.excluded
                  ? 'Excluded'
                  : formatCurrency(band.payoutOverride ?? summary.perBand)}
              </Text>
            </View>
          ))}
          {summary.bandPayoutSavings > 0 && (
            <Row label="Kept from band payouts" value={formatCurrency(summary.bandPayoutSavings)} />
          )}
          <Row label="Venue split" value={formatCurrency(summary.venueSplit)} bold />
        </View>

        {hasAdditionalIncome && (
          <View style={styles.dealSection}>
            <Text style={styles.sectionTitle}>Venue Additional Income</Text>
            {VENUE_ADDITIONAL_INCOME_FIELDS.map(({ key, label }) => (
              <Row key={key} label={label} value={formatCurrency(values[key])} />
            ))}
            <View style={styles.totalRow}>
              <Text>Total</Text>
              <Text>{formatCurrency(summary.venueAdditionalIncome)}</Text>
            </View>
          </View>
        )}

        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text>Venue total income</Text>
            <Text>{formatCurrency(summary.venueTotalIncome)}</Text>
          </View>
          {summary.venueRedirect !== 0 && (
            <View style={styles.summaryRow}>
              <Text>Venue redirect ({formatPct(values.venueRedirectPct)}%)</Text>
              <Text>−{formatCurrency(summary.venueRedirect)}</Text>
            </View>
          )}
          <View style={styles.netRow}>
            <Text>Venue Net</Text>
            <Text>{formatCurrency(summary.venueNet)}</Text>
          </View>
        </View>

        {values.notes && (
          <View style={styles.notes}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesText}>{values.notes}</Text>
          </View>
        )}

        <Text style={styles.footer} fixed>
          Generated {generatedOn} · The Birdhaus
        </Text>
      </Page>
    </Document>
  );
}
