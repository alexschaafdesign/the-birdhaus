import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  formatCurrency,
  formatPct,
  bandShare,
  bandDue,
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
  header: { marginBottom: 6, borderBottom: `2px solid ${INK}`, paddingBottom: 12 },
  brand: { fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5 },
  subtitle: { fontSize: 10, color: MUTED, marginTop: 3 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, fontSize: 9, color: MUTED },
  statsRow: { flexDirection: 'row', marginTop: 12 },
  stat: { marginRight: 32 },
  statLabel: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.5, color: MUTED },
  statValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 2 },

  // Audience-level banner: "For the artists" vs "Venue accounting". Heavier than a
  // section title so the two halves of the sheet read as distinct.
  groupBanner: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: INK,
    marginTop: 20,
    marginBottom: 10,
    borderBottom: `1.5px solid ${INK}`,
    paddingBottom: 5,
  },

  section: { marginBottom: 12 },
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

  // The band payout is the focal point of the sheet — emphasized cream box with a
  // large artist-split headline, mirroring the old venue-net treatment but pointed
  // at the audience that actually reads this document.
  artistBox: { marginTop: 4, padding: 14, backgroundColor: CREAM, borderRadius: 3 },
  artistTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottom: `1px solid ${RULE}`,
  },

  // Venue totals — deliberately plain. The venue net is not the headline here.
  venueTotals: { marginTop: 6 },
  venueNetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTop: `1px solid ${RULE}`,
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
  // Total heads that RSVP'd (reservations + guests), for context on the sheet.
  totalRsvps: number;
}

export default function SettlementPdfDocument({
  showTitle,
  showDate,
  values,
  summary,
  bands,
  totalRsvps,
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
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Estimated attendance</Text>
              <Text style={styles.statValue}>{values.attendance !== null ? String(values.attendance) : '—'}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Total RSVPs</Text>
              <Text style={styles.statValue}>{String(totalRsvps)}</Text>
            </View>
          </View>
        </View>

        {/* Everything the band cares about: what the show earned and how the split
            lands on each act. */}
        <Text style={styles.groupBanner}>For the Artists</Text>

        <View style={styles.section}>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Deal Terms — {dealTermsLabel(values)}</Text>
          <View style={styles.artistBox}>
            <View style={styles.artistTotalRow}>
              <Text>Artist split</Text>
              <Text>{formatCurrency(summary.artistPool)}</Text>
            </View>
            <Row label={`Per band (${payoutBandCount})`} value={formatCurrency(summary.perBand)} />
            {bands.map((band) => {
              const adjusted = !band.excluded && band.payoutOverride !== null;
              const pctLabel = band.payoutPct !== null ? `${formatPct(band.payoutPct)}% · ` : '';
              return (
                <View key={band.bandId}>
                  <View style={styles.row}>
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
                        : `${pctLabel}${formatCurrency(bandShare(summary, band.payoutOverride, band.payoutPct))}`}
                    </Text>
                  </View>
                  {adjusted && (
                    <Text style={{ color: MUTED, fontSize: 8, paddingLeft: 10, marginTop: -1, marginBottom: 2 }}>
                      due {formatCurrency(bandDue(summary, band.payoutPct))}
                      {band.payoutNote ? ` — ${band.payoutNote}` : ''}
                    </Text>
                  )}
                </View>
              );
            })}
            {summary.bandPayoutSavings > 0 && (
              <Row label="Kept from band payouts" value={formatCurrency(summary.bandPayoutSavings)} />
            )}
          </View>
        </View>

        {/* The venue's side of the ledger — expenses and the venue's own take.
            Kept plain so it reads as supporting detail, not the headline. */}
        <Text style={styles.groupBanner}>Venue Accounting</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Venue Expenses</Text>
          {VENUE_EXPENSE_FIELDS.map(({ key, label }) => {
            const payee = PAYEE_EXPENSE_FIELDS.find((p) => p.amountKey === key);
            const name = payee ? values[payee.nameKey] : null;
            return <Row key={key} label={name ? `${label} — ${name}` : label} value={formatCurrency(values[key])} />;
          })}
          {expenseItems.map((item, i) => (
            <Row key={`extra-expense-${i}`} label={item.label} value={formatCurrency(item.amount)} />
          ))}
          <View style={styles.totalRow}>
            <Text>Total Expenses</Text>
            <Text>{formatCurrency(summary.totalExpenses)}</Text>
          </View>
        </View>

        {hasAdditionalIncome && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Additional Income</Text>
            {VENUE_ADDITIONAL_INCOME_FIELDS.map(({ key, label }) => (
              <Row key={key} label={label} value={formatCurrency(values[key])} />
            ))}
            <View style={styles.totalRow}>
              <Text>Total</Text>
              <Text>{formatCurrency(summary.venueAdditionalIncome)}</Text>
            </View>
          </View>
        )}

        <View style={styles.venueTotals}>
          <Row label="Venue split" value={formatCurrency(summary.venueSplit)} />
          {hasAdditionalIncome && (
            <Row label="Additional income" value={formatCurrency(summary.venueAdditionalIncome)} />
          )}
          {hasAdditionalIncome && (
            <Row label="Venue total income" value={formatCurrency(summary.venueTotalIncome)} />
          )}
          {summary.venueRedirect !== 0 && (
            <Row label={`Venue redirect (${formatPct(values.venueRedirectPct)}%)`} value={`−${formatCurrency(summary.venueRedirect)}`} />
          )}
          <View style={styles.venueNetRow}>
            <Text>Venue net</Text>
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
