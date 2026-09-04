/**
 * Money formatting. Everything is stored as integers — minor units for revenue
 * (paise/cents) and USD micros for provider cost — so nothing here ever does
 * float arithmetic on a stored value.
 */

export type Currency = "INR" | "USD";

const CURRENCY_LOCALE: Record<Currency, string> = {
  INR: "en-IN",
  USD: "en-US",
};

/** Format minor units (paise, cents) as a currency string. */
export function formatMinor(
  amountMinor: number,
  currency: Currency = "INR",
  options: { compact?: boolean } = {},
): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
    style: "currency",
    currency,
    maximumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    notation: options.compact ? "compact" : "standard",
  }).format(amountMinor / 100);
}

/** Format USD micros ($1 = 1_000_000) — used for provider cost, which is tiny. */
export function formatUsdMicro(costUsdMicro: number, fractionDigits = 4): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(costUsdMicro / 1_000_000);
}

/** Compact USD for dashboard tiles, where four decimals are noise. */
export function formatUsd(costUsdMicro: number): string {
  const dollars = costUsdMicro / 1_000_000;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: dollars >= 100 ? 0 : 2,
  }).format(dollars);
}

export function formatCredits(credits: number): string {
  return new Intl.NumberFormat("en-IN").format(credits);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

/**
 * Which currency to bill a user in. India gets rupees; everyone else dollars.
 * Razorpay settles INR domestically and USD for international cards.
 */
export function currencyForCountry(country: string): Currency {
  return country.toUpperCase() === "IN" ? "INR" : "USD";
}

export function priceForCurrency(
  item: { priceMinorInr: number; priceMinorUsd: number },
  currency: Currency,
): number {
  return currency === "INR" ? item.priceMinorInr : item.priceMinorUsd;
}
