import {buildState, type LedgerDataset} from './ledger.ts';
import {buildFinancialStatements} from './financial-statements.ts';

export function reportingDates(month: string, today: string) {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month) || month > today.slice(0, 7)) return null;
  const start = new Date(month + '-01T12:00:00Z');
  const opening = new Date(start);
  opening.setUTCDate(0);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const monthEnd = end.toISOString().slice(0, 10);
  return {opening: opening.toISOString().slice(0, 10), asOf: monthEnd < today ? monthEnd : today};
}

export function monthlyReport(data: LedgerDataset, month: string, dates: NonNullable<ReturnType<typeof reportingDates>>) {
  const close = buildState(data, dates.asOf);
  const report = buildFinancialStatements(buildState(data, dates.opening), close);
  const {metrics, source_mix} = report;
  const cents = (n: number) => Math.round(n * 100);
  return {
    version: 1, month, asOf: dates.asOf, basis: 'cash', currency: 'PHP', unit: 'centavos',
    revenue: cents(metrics.interest), expenses: cents(metrics.operating_expenses) + cents(metrics.financing_costs),
    surplus: cents(metrics.net_cash_surplus), cash: cents(close.summary.cash),
    principal: cents(close.summary.principal_outstanding), assets: cents(metrics.assets),
    borrowing: cents(source_mix.external_liability), warnings: report.warnings
  };
}
