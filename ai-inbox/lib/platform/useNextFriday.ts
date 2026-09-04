"use client";

import { useEffect, useState } from "react";

/**
 * Countdown to the next weekly match — Friday 8pm IST (UTC+5:30 → 14:30 UTC).
 * Shared by the matching surfaces, which
 * both used to carry their own copy of this — previously buggy on Fridays:
 * the "already past this week's target" check required
 * `getUTCHours() >= 14 && getUTCMinutes() >= 30`, both true for the *same*
 * instant, instead of "now is at or past 14:30". Any Friday minute in the
 * 00–29 range after 14:30 UTC (e.g. 15:05, 20:03) failed that check, left
 * the target at today 14:30 UTC (already past), and produced a negative
 * diff — a countdown showing negative/garbage numbers until the UTC date
 * rolled over to Saturday.
 */
export function useNextFriday() {
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    function calc() {
      const now = new Date();
      const day = now.getUTCDay(); // 0=Sun…5=Fri
      const daysUntilFri = day <= 5 ? 5 - day : 6;
      const pastThisWeeksTarget =
        daysUntilFri === 0 &&
        (now.getUTCHours() > 14 || (now.getUTCHours() === 14 && now.getUTCMinutes() >= 30));
      const next = new Date(now);
      next.setUTCDate(now.getUTCDate() + (pastThisWeeksTarget ? 7 : daysUntilFri));
      next.setUTCHours(14, 30, 0, 0);
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
