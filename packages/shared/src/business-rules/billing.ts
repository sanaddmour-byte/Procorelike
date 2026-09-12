/**
 * Progress billing math (AIA G702/G703-style), computed fresh from stored
 * inputs rather than persisted — see docs/DATA_MODEL.md §9:
 * "Previous/this-period/to-date computed, not stored redundantly where
 * derivable." `pctCompletePrevious`/`pctCompleteThisPeriod` are both
 * cumulative percentages of the SOV line's total value (0-100), matching
 * how a real pay application reads.
 */

export interface PaymentApplicationLineAmounts {
  completedToDate: number;
  completedPrevious: number;
  amountThisPeriod: number;
  retentionToDate: number;
  retentionThisPeriod: number;
  netThisPeriod: number;
}

export function computeLineAmounts(
  sovAmount: number,
  pctCompletePrevious: number,
  pctCompleteThisPeriod: number,
  retentionPct: number,
): PaymentApplicationLineAmounts {
  const completedToDate = round2(sovAmount * (pctCompleteThisPeriod / 100));
  const completedPrevious = round2(sovAmount * (pctCompletePrevious / 100));
  const amountThisPeriod = round2(completedToDate - completedPrevious);
  const retentionToDate = round2(completedToDate * (retentionPct / 100));
  const retentionThisPeriod = round2(retentionToDate - round2(completedPrevious * (retentionPct / 100)));
  const netThisPeriod = round2(amountThisPeriod - retentionThisPeriod);

  return { completedToDate, completedPrevious, amountThisPeriod, retentionToDate, retentionThisPeriod, netThisPeriod };
}

export function sumNetThisPeriod(lines: PaymentApplicationLineAmounts[]): number {
  return round2(lines.reduce((sum, l) => sum + l.netThisPeriod, 0));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
