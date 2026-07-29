import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { InputTotalLine, InputBand, InputItem } from '@/lib/inputs';
import { inputCatalogItem, OTHER_INPUT_KEY } from '@/lib/input-catalog';

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
  totalBox: { padding: 14, backgroundColor: CREAM, borderRadius: 3, marginBottom: 22 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2.5 },
  qty: { fontFamily: 'Helvetica-Bold', width: 34 },
  itemLabel: { flex: 1 },
  house: { color: MUTED, fontSize: 9 },
  note: { color: MUTED, fontSize: 9, marginTop: 1 },
  band: { marginBottom: 16 },
  bandName: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 5 },
  empty: { color: MUTED, fontStyle: 'italic' },
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

// Display label for one item: the free-text label for "other", else the catalog
// name (mirrors the panel + lib/inputs aggregation).
function itemLabel(item: InputItem): string {
  if (item.itemType === OTHER_INPUT_KEY) return item.customLabel?.trim() || 'Other';
  return inputCatalogItem(item.itemType).label;
}

interface InputsPdfDocumentProps {
  showTitle: string;
  showDate: string | null;
  total: InputTotalLine[];
  bands: Array<Pick<InputBand, 'bandId' | 'name' | 'items'>>;
}

export default function InputsPdfDocument({
  showTitle,
  showDate,
  total,
  bands,
}: InputsPdfDocumentProps) {
  // showDate is a plain 'YYYY-MM-DD' string — append local midnight to dodge the
  // UTC off-by-one day shift (same as SettlementPdfDocument).
  const formattedShowDate = showDate
    ? new Date(`${showDate}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const generatedOn = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Document title={`Inputs — ${showTitle}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>THE BIRDHAUS</Text>
          <Text style={styles.subtitle}>Input & Stage Plot Summary</Text>
          <View style={styles.metaRow}>
            <Text>{showTitle}</Text>
            {formattedShowDate && <Text>{formattedShowDate}</Text>}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Combined inputs needed</Text>
        <View style={styles.totalBox}>
          {total.length === 0 ? (
            <Text style={styles.empty}>No items listed.</Text>
          ) : (
            total.map((line) => (
              <View key={`${line.key}:${line.label}`} style={styles.itemRow}>
                <Text style={styles.qty}>{line.quantity} ×</Text>
                <Text style={styles.itemLabel}>{line.label}</Text>
                {line.houseLabel && <Text style={styles.house}>{line.houseLabel} avail.</Text>}
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionTitle}>By artist</Text>
        {bands.length === 0 ? (
          <Text style={styles.empty}>No bands on this show.</Text>
        ) : (
          bands.map((band) => (
            <View key={band.bandId} style={styles.band} wrap={false}>
              <Text style={styles.bandName}>{band.name}</Text>
              {band.items.length === 0 ? (
                <Text style={styles.empty}>(no items listed)</Text>
              ) : (
                band.items.map((item, i) => (
                  <View key={i} style={styles.itemRow}>
                    <Text style={styles.qty}>{item.quantity} ×</Text>
                    <View style={styles.itemLabel}>
                      <Text>{itemLabel(item)}</Text>
                      {item.note && <Text style={styles.note}>{item.note}</Text>}
                    </View>
                  </View>
                ))
              )}
            </View>
          ))
        )}

        <Text style={styles.footer} fixed>
          Generated {generatedOn} · The Birdhaus
        </Text>
      </Page>
    </Document>
  );
}
