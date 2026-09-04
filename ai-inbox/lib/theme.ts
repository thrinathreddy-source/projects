/**
 * Time-of-day theming.
 *
 * Three modes live in localStorage under THEME_KEY: 'auto' (the default),
 * 'light', 'dark'. 'auto' resolves against the *visitor's* local clock —
 * dark from DARK_FROM_HOUR through DARK_UNTIL_HOUR — which is the whole
 * point: the board should look like whatever time it is where the person
 * reading it is sitting, not where the server is.
 *
 * The resolved value is written to <html data-theme>, and app/globals.css
 * keys its night palette off that attribute. Nothing here reads
 * prefers-color-scheme: the OS setting is a *preference*, this is a
 * *schedule*, and quietly letting the OS win would mean someone with dark
 * mode pinned on their phone never sees the daytime board at all. The CSS
 * still carries a prefers-color-scheme fallback for the no-JS case only.
 */

export const THEME_KEY = 'oppidx_theme'

/** Dark from 19:00 up to (not including) 07:00, local time. */
export const DARK_FROM_HOUR = 19
export const DARK_UNTIL_HOUR = 7

export type ThemeMode = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export function isNightHour(hour: number): boolean {
  return hour >= DARK_FROM_HOUR || hour < DARK_UNTIL_HOUR
}

export function resolveTheme(mode: ThemeMode, hour: number): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') return mode
  return isNightHour(hour) ? 'dark' : 'light'
}

/**
 * Runs blocking in <head>, before the first paint, so the page never
 * renders in the wrong palette and flips (the "flash of wrong theme" that
 * makes a themed site feel broken on every single load). Deliberately not
 * imported as a module — it is injected as a literal string, because a
 * module would arrive after paint and defeat the entire purpose.
 *
 * Kept in sync with resolveTheme() above by hand; it is small enough that
 * duplicating the rule beats shipping a bundler-processed script here.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var m=localStorage.getItem(${JSON.stringify(THEME_KEY)})||'auto';
var h=new Date().getHours();
var d=m==='dark'||(m==='auto'&&(h>=${DARK_FROM_HOUR}||h<${DARK_UNTIL_HOUR}));
document.documentElement.setAttribute('data-theme',d?'dark':'light');
}catch(e){}})();`
