// One age calculation for the whole codebase.
//
// Elapsed-milliseconds ÷ an average 365.25-day year is wrong by up to a day
// either side, because eighteen real years span 6574 or 6575 days depending on
// how the leap days fall. Registration used to compare that float directly and
// turned people away on their own eighteenth birthday; the matcher floors it,
// which hides the error at some run times and not others (about 11% of
// birthdays across a day's worth of run times come out a year young). Counting
// calendar years can't drift either way.
//
// IST, because that is where the users are and when the Friday cron runs.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Whole years old today in IST, or null if the date doesn't parse. */
export function ageInYears(dob: string | null | undefined): number | null {
  if (!dob) return null;

  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;

  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  let age = nowIST.getUTCFullYear() - born.getUTCFullYear();
  const monthsApart = nowIST.getUTCMonth() - born.getUTCMonth();
  if (monthsApart < 0 || (monthsApart === 0 && nowIST.getUTCDate() < born.getUTCDate())) age--;
  return age;
}
