const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const currencyPrecise = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat('en-US');

const clock = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const clockShort = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatCurrency = (value: number) => currency.format(value);
export const formatCurrencyPrecise = (value: number) => currencyPrecise.format(value);
export const formatNumber = (value: number) => number.format(value);
export const formatTime = (iso: string) => clock.format(new Date(iso));
export const formatTimeShort = (iso: string) => clockShort.format(new Date(iso));

/** Chart axis labels: seconds are noise once buckets are minutes wide. */
export function formatAxisTime(iso: string, bucketSeconds: number): string {
  return bucketSeconds >= 3600 ? clockShort.format(new Date(iso)) : clock.format(new Date(iso));
}
