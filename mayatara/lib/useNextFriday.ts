"use client";

import { useEffect, useState } from "react";

// Matches run Friday 8pm IST — 14:30 UTC, the same instant vercel.json fires
// the cron at.
const MATCH_DAY_UTC = 5;
const MATCH_HOUR_UTC = 14;
const MATCH_MINUTE_UTC = 30;

/**
 * Countdown to the next match run, live to the second.
 *
 * The previous version rolled over to next week only when
 * `hours >= 14 && minutes >= 30`, which reads the two fields independently:
 * at 15:10 UTC on a Friday the hour passed but the minute didn't, so it
 * counted down to a moment 40 minutes in the past and rendered
 * "-1d -1h -40m". That was every :00–:29 of every hour of Friday evening —
 * precisely when the site is meant to be at its best. Comparing whole
 * timestamps is the fix, and it can't drift out of sync the same way.
 */
export function useNextFriday(): string {
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    function calc() {
      const now = new Date();

      const next = new Date(now);
      next.setUTCDate(now.getUTCDate() + ((MATCH_DAY_UTC - now.getUTCDay() + 7) % 7));
      next.setUTCHours(MATCH_HOUR_UTC, MATCH_MINUTE_UTC, 0, 0);
      // Today is Friday but the run already happened: aim at next week's.
      if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 7);

      const diff = next.getTime() - now.getTime();
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${d}d ${h}h ${m}m ${s}s`);
    }

    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, []);

  return countdown;
}
