export type DealType = 'straight_split' | 'venue_guarantee_then_split';

export interface ExtraLineItem {
  type: 'income' | 'expense';
  label: string;
  amount: number;
}

export const NUMERIC_FIELDS = [
  'dealThreshold',
  'artistSplitPct',
  'venueRedirectPct',
  'incomeSquare',
  'incomeVenmo',
  'incomeCash',
  'expSquareFees',
  'expVenmoFees',
  'expSoundEngineer',
  'expPhotos',
  'expDoorPerson',
  'expAdPrint',
  'expAdOnline',
  'expSnacks',
  'expBeer',
  'beverageIncomeVenmo',
  'beverageIncomeCash',
] as const;

export type NumericField = (typeof NUMERIC_FIELDS)[number];

export type PayeeNameField = 'photographerName' | 'soundEngineerName';
export type PayeePaidField = 'photographerPaid' | 'soundPaid';

export type SettlementValues = {
  dealType: DealType;
  extraLineItems: ExtraLineItem[];
  notes: string | null;
  photographerName: string | null;
  soundEngineerName: string | null;
  soundPaid: boolean;
  photographerPaid: boolean;
} & Record<NumericField, number>;

export const DEFAULT_SETTLEMENT_VALUES: SettlementValues = {
  dealType: 'venue_guarantee_then_split',
  dealThreshold: 100,
  artistSplitPct: 75,
  venueRedirectPct: 0,
  incomeSquare: 0,
  incomeVenmo: 0,
  incomeCash: 0,
  expSquareFees: 0,
  expVenmoFees: 0,
  expSoundEngineer: 0,
  expPhotos: 0,
  expDoorPerson: 0,
  expAdPrint: 0,
  expAdOnline: 0,
  expSnacks: 0,
  expBeer: 0,
  beverageIncomeVenmo: 0,
  beverageIncomeCash: 0,
  extraLineItems: [],
  notes: null,
  photographerName: null,
  soundEngineerName: null,
  soundPaid: false,
  photographerPaid: false,
};

// Links an expense field to the payee-name field tracking who it was paid to
// and the paid-status field tracking whether they've actually been paid, so
// the form/view/summary can render this without hardcoding the pairing.
export const PAYEE_EXPENSE_FIELDS: Array<{
  amountKey: NumericField;
  nameKey: PayeeNameField;
  paidKey: PayeePaidField;
  label: string;
}> = [
  { amountKey: 'expPhotos', nameKey: 'photographerName', paidKey: 'photographerPaid', label: 'Photographer' },
  { amountKey: 'expSoundEngineer', nameKey: 'soundEngineerName', paidKey: 'soundPaid', label: 'Sound engineer' },
];

export const SHOW_INCOME_FIELDS: Array<{ key: NumericField; label: string }> = [
  { key: 'incomeSquare', label: 'Square' },
  { key: 'incomeVenmo', label: 'Venmo' },
  { key: 'incomeCash', label: 'Cash' },
];

// Standard processor rates used to auto-fill the fee fields from their matching
// income field(s). Flat percentage only (no per-transaction fixed fee) since this
// sheet tracks a single income total per method, not a transaction count. A fee can
// draw from more than one income field — the Venmo fee is charged on both the show's
// Venmo income and the beverage Venmo income, since both settle through the same account.
export const FEE_INCOME_FIELDS: Array<{ incomeKeys: NumericField[]; feeKey: NumericField; rate: number }> = [
  { incomeKeys: ['incomeSquare'], feeKey: 'expSquareFees', rate: 0.026 },
  { incomeKeys: ['incomeVenmo', 'beverageIncomeVenmo'], feeKey: 'expVenmoFees', rate: 0.019 },
];

export const VENUE_EXPENSE_FIELDS: Array<{ key: NumericField; label: string }> = [
  { key: 'expSquareFees', label: 'Square fees' },
  { key: 'expVenmoFees', label: 'Venmo fees' },
  { key: 'expSoundEngineer', label: 'Sound engineer' },
  { key: 'expPhotos', label: 'Photos' },
  { key: 'expDoorPerson', label: 'Door person' },
  { key: 'expAdPrint', label: 'Print ads' },
  { key: 'expAdOnline', label: 'Online ads' },
  { key: 'expSnacks', label: 'Snacks' },
  { key: 'expBeer', label: 'Beer' },
];

export const VENUE_ADDITIONAL_INCOME_FIELDS: Array<{ key: NumericField; label: string }> = [
  { key: 'beverageIncomeVenmo', label: 'Beverage income (Venmo)' },
  { key: 'beverageIncomeCash', label: 'Beverage income (cash)' },
];

export interface SettlementSummary {
  totalIncome: number;
  totalExpenses: number;
  artistPool: number;
  venueSplit: number;
  perBand: number;
  venueAdditionalIncome: number;
  venueTotalIncome: number;
  // Portion of the venue split redirected to an outside party (e.g. charity),
  // taken out after expenses. Zero when venueRedirectPct is 0.
  venueRedirect: number;
  // Total actually paid out to the (included) bands. Equals artistPool unless a
  // band's payout was overridden; then it's the sum of each band's override or
  // computed share.
  bandPayout: number;
  // artistPool − bandPayout: the leftover when bands are paid less than their
  // computed share, which flows to the venue as profit (negative if a band was
  // paid more than its share). Zero when no overrides are set.
  bandPayoutSavings: number;
  venueNet: number;
}

// `bandPayoutOverrides` is the per-band override for the *included* bands only —
// one entry per band that shares the split, null where the band follows the even
// split. When omitted (or all null) every band takes its computed share, so
// bandPayout equals artistPool and there are no savings. When a band is paid less
// than its share the difference is added to the venue net as profit (and a band
// paid more reduces it), matching how the venue keeps the remainder in practice.
export function computeSettlementSummary(
  values: SettlementValues,
  bandCount: number,
  bandPayoutOverrides?: (number | null)[]
): SettlementSummary {
  const extraIncome = values.extraLineItems
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + item.amount, 0);
  const extraExpense = values.extraLineItems
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + item.amount, 0);

  const totalIncome = values.incomeSquare + values.incomeVenmo + values.incomeCash + extraIncome;
  const totalExpenses =
    values.expSquareFees +
    values.expVenmoFees +
    values.expSoundEngineer +
    values.expPhotos +
    values.expDoorPerson +
    values.expAdPrint +
    values.expAdOnline +
    values.expSnacks +
    values.expBeer +
    extraExpense;
  const venueAdditionalIncome = values.beverageIncomeVenmo + values.beverageIncomeCash;

  let artistPool: number;
  let venueSplit: number;
  if (values.dealType === 'venue_guarantee_then_split') {
    const guarantee = Math.min(totalIncome, values.dealThreshold);
    const remainder = totalIncome - guarantee;
    artistPool = remainder * (values.artistSplitPct / 100);
    venueSplit = guarantee + (remainder - artistPool);
  } else {
    artistPool = totalIncome * (values.artistSplitPct / 100);
    venueSplit = totalIncome - artistPool;
  }

  const perBand = bandCount > 0 ? artistPool / bandCount : 0;
  // Each included band is paid its override, or the even per-band share when it
  // has none. With no overrides (undefined, or an empty list for a show with no
  // bands to divide among) this stays at artistPool, so savings are 0.
  const hasOverrideInfo = bandPayoutOverrides !== undefined && bandPayoutOverrides.length > 0;
  const bandPayout = hasOverrideInfo
    ? bandPayoutOverrides!.reduce((sum: number, override) => sum + (override ?? perBand), 0)
    : artistPool;
  // Round to cents so the float dust from an even split (e.g. $100 / 3) doesn't
  // register as a stray sub-penny "saving".
  const bandPayoutSavings = Math.round((artistPool - bandPayout) * 100) / 100;
  const venueTotalIncome = venueSplit + venueAdditionalIncome;
  // Redirect is a share of the venue split sent to an outside party, deducted
  // after expenses — the venue covers costs first, then donates from what's left.
  const venueRedirect = venueSplit * (values.venueRedirectPct / 100);
  // Anything a band declines from its share stays with the venue as profit.
  const venueNet = venueTotalIncome - totalExpenses - venueRedirect + bandPayoutSavings;

  return {
    totalIncome,
    totalExpenses,
    artistPool,
    venueSplit,
    perBand,
    venueAdditionalIncome,
    venueTotalIncome,
    venueRedirect,
    bandPayout,
    bandPayoutSavings,
    venueNet,
  };
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatPct(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function dealTermsLabel(values: Pick<SettlementValues, 'dealType' | 'artistSplitPct' | 'dealThreshold'>): string {
  const splitLabel = `${formatPct(values.artistSplitPct)}/${formatPct(100 - values.artistSplitPct)} split`;
  if (values.dealType === 'venue_guarantee_then_split') {
    return `${formatCurrency(values.dealThreshold)} venue guarantee, then ${splitLabel}`;
  }
  return splitLabel;
}

// Plain-text settlement summary for pasting into a band-facing email, alongside
// the PDF attachment. Deliberately short — the headline money figures only.
export function settlementEmailSummary(
  showTitle: string,
  showDate: string | null,
  values: SettlementValues,
  summary: SettlementSummary,
  bandCount: number
): string {
  // showDate is a plain 'YYYY-MM-DD' string; the local-midnight suffix avoids the
  // UTC off-by-one-day shift toLocaleDateString would otherwise introduce.
  const dateLabel = showDate
    ? new Date(`${showDate}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const lines = [
    `The Birdhaus — ${showTitle}${dateLabel ? ` · ${dateLabel}` : ''}`,
    dealTermsLabel(values),
    '',
    `Total income: ${formatCurrency(summary.totalIncome)}`,
    `Band split: ${formatCurrency(summary.artistPool)}`,
    `Venue split: ${formatCurrency(summary.venueSplit)}`,
    '',
    `Per band (${bandCount || 0}): ${formatCurrency(summary.perBand)}`,
    `Total venue expenses: ${formatCurrency(summary.totalExpenses)}`,
  ];
  if (summary.venueRedirect !== 0) {
    lines.push(`Venue redirect (${formatPct(values.venueRedirectPct)}%): −${formatCurrency(summary.venueRedirect)}`);
  }
  lines.push(`Venue net: ${formatCurrency(summary.venueNet)}`);

  return lines.join('\n');
}

// Shape of a `select * from settlements` row — numeric columns come back as
// strings from postgres.js since they're arbitrary-precision `numeric`.
export interface SettlementDbRow {
  deal_type: string;
  deal_threshold: string;
  artist_split_pct: string;
  venue_redirect_pct: string;
  income_square: string;
  income_venmo: string;
  income_cash: string;
  exp_square_fees: string;
  exp_venmo_fees: string;
  exp_sound_engineer: string;
  exp_photos: string;
  exp_door_person: string;
  exp_ad_print: string;
  exp_ad_online: string;
  exp_snacks: string;
  exp_beer: string;
  beverage_income_venmo: string;
  beverage_income_cash: string;
  extra_line_items: ExtraLineItem[];
  notes: string | null;
  photographer_name: string | null;
  sound_engineer_name: string | null;
  sound_paid: boolean;
  photographer_paid: boolean;
}

export function settlementValuesFromRow(row: SettlementDbRow): SettlementValues {
  return {
    dealType: row.deal_type as DealType,
    dealThreshold: Number(row.deal_threshold),
    artistSplitPct: Number(row.artist_split_pct),
    venueRedirectPct: Number(row.venue_redirect_pct),
    incomeSquare: Number(row.income_square),
    incomeVenmo: Number(row.income_venmo),
    incomeCash: Number(row.income_cash),
    expSquareFees: Number(row.exp_square_fees),
    expVenmoFees: Number(row.exp_venmo_fees),
    expSoundEngineer: Number(row.exp_sound_engineer),
    expPhotos: Number(row.exp_photos),
    expDoorPerson: Number(row.exp_door_person),
    expAdPrint: Number(row.exp_ad_print),
    expAdOnline: Number(row.exp_ad_online),
    expSnacks: Number(row.exp_snacks),
    expBeer: Number(row.exp_beer),
    beverageIncomeVenmo: Number(row.beverage_income_venmo),
    beverageIncomeCash: Number(row.beverage_income_cash),
    extraLineItems: row.extra_line_items ?? [],
    notes: row.notes,
    photographerName: row.photographer_name,
    soundEngineerName: row.sound_engineer_name,
    soundPaid: row.sound_paid,
    photographerPaid: row.photographer_paid,
  };
}
