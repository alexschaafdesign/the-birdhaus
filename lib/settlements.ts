export type DealType = 'straight_split' | 'venue_guarantee_then_split';

export interface ExtraLineItem {
  type: 'income' | 'expense';
  label: string;
  amount: number;
}

export const NUMERIC_FIELDS = [
  'dealThreshold',
  'artistSplitPct',
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

export type SettlementValues = {
  dealType: DealType;
  extraLineItems: ExtraLineItem[];
  notes: string | null;
  photographerName: string | null;
  soundEngineerName: string | null;
} & Record<NumericField, number>;

export const DEFAULT_SETTLEMENT_VALUES: SettlementValues = {
  dealType: 'straight_split',
  dealThreshold: 0,
  artistSplitPct: 75,
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
};

// Links an expense field to the payee-name field tracking who it was paid to,
// so the form/view/summary can render "who got paid" without hardcoding the pair.
export const PAYEE_EXPENSE_FIELDS: Array<{ amountKey: NumericField; nameKey: PayeeNameField; label: string }> = [
  { amountKey: 'expPhotos', nameKey: 'photographerName', label: 'Photographer' },
  { amountKey: 'expSoundEngineer', nameKey: 'soundEngineerName', label: 'Sound engineer' },
];

export const SHOW_INCOME_FIELDS: Array<{ key: NumericField; label: string }> = [
  { key: 'incomeSquare', label: 'Square' },
  { key: 'incomeVenmo', label: 'Venmo' },
  { key: 'incomeCash', label: 'Cash' },
];

// Standard processor rates used to auto-fill the fee fields from their matching
// income field. Flat percentage only (no per-transaction fixed fee) since this
// sheet tracks a single income total per method, not a transaction count.
export const FEE_INCOME_FIELDS: Array<{ incomeKey: NumericField; feeKey: NumericField; rate: number }> = [
  { incomeKey: 'incomeSquare', feeKey: 'expSquareFees', rate: 0.026 },
  { incomeKey: 'incomeVenmo', feeKey: 'expVenmoFees', rate: 0.019 },
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
  venueNet: number;
}

export function computeSettlementSummary(values: SettlementValues, bandCount: number): SettlementSummary {
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
  const venueTotalIncome = venueSplit + venueAdditionalIncome;
  const venueNet = venueTotalIncome - totalExpenses;

  return {
    totalIncome,
    totalExpenses,
    artistPool,
    venueSplit,
    perBand,
    venueAdditionalIncome,
    venueTotalIncome,
    venueNet,
  };
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatPct(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function dealTermsLabel(values: Pick<SettlementValues, 'dealType' | 'artistSplitPct' | 'dealThreshold'>): string {
  const splitLabel = `${formatPct(values.artistSplitPct)}/${formatPct(100 - values.artistSplitPct)} split`;
  if (values.dealType === 'venue_guarantee_then_split') {
    return `${formatCurrency(values.dealThreshold)} venue guarantee, then ${splitLabel}`;
  }
  return splitLabel;
}

// Shape of a `select * from settlements` row — numeric columns come back as
// strings from postgres.js since they're arbitrary-precision `numeric`.
export interface SettlementDbRow {
  deal_type: string;
  deal_threshold: string;
  artist_split_pct: string;
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
}

export function settlementValuesFromRow(row: SettlementDbRow): SettlementValues {
  return {
    dealType: row.deal_type as DealType,
    dealThreshold: Number(row.deal_threshold),
    artistSplitPct: Number(row.artist_split_pct),
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
  };
}
