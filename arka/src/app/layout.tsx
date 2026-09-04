import type { Metadata, Viewport } from "next";
import {
  Anek_Bangla,
  Anek_Devanagari,
  Anek_Gujarati,
  Anek_Gurmukhi,
  Anek_Kannada,
  Anek_Latin,
  Anek_Malayalam,
  Anek_Tamil,
  Anek_Telugu,
  Big_Shoulders,
  Noto_Sans_Arabic,
  Noto_Sans_JP,
  Space_Mono,
} from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AnalyticsProvider } from "@/components/analytics-provider";
import "./globals.css";

/**
 * The typefaces.
 *
 * The rule here is that nothing may be a default. The body face was Geist —
 * which is not a choice, it is what `create-next-app` leaves behind — and a
 * product whose entire pitch is a specific cultural voice cannot deliver that
 * voice in Vercel's house font.
 *
 * The system is one family for text, one for display, one for annotation:
 *
 *   Anek         text and UI, in every script this product ships
 *   Big Shoulders the poster voice, headings only
 *   Space Mono    labels, plate margins, tabular figures
 *
 * Declaring eleven Anek cuts costs CSS bytes, not bandwidth: a browser only
 * downloads a font file when a glyph on the page actually needs it, so an
 * English page fetches Anek Latin and nothing else.
 */

/**
 * Anek, by the Indian Type Foundry.
 *
 * Chosen for a reason beyond taste. Anek was drawn as one family across
 * Devanagari, Tamil, Telugu, Kannada, Malayalam, Bangla, Gujarati, Gurmukhi and
 * Latin — which is very nearly this product's language list, designed together
 * rather than bolted together. A Tamil label and an English label now share a
 * skeleton, weight and rhythm instead of being two unrelated typefaces sitting
 * next to each other.
 */
const sans = Anek_Latin({ variable: "--font-sans", subsets: ["latin"], display: "swap" });

/**
 * The poster face.
 *
 * Ultra-condensed grotesque, set enormous and allowed to bleed off the page —
 * the voice of a screen-printed gig poster rather than a web heading. Condensed
 * is the operative property: it is what lets a word run edge to edge at 8rem
 * and still fit, which is the single move the whole layout is built on.
 */
const display = Big_Shoulders({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "800", "900"],
});

/**
 * The annotation face.
 *
 * Space Mono rather than a neutral coding mono: these are plate margins and
 * spec-sheet labels, set small, uppercase and widely tracked, and that
 * treatment wants a face with some retro-technical character in it. Its
 * figures are monospaced, so the billing and pricing tables still align.
 */
const mono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "700"],
});

// One Anek cut per script the catalogue offers, so a native language name in
// the picker is set in a real typeface rather than dropped to a system
// fallback. Noto covers the two scripts Anek does not: Urdu and Japanese.
const devanagari = Anek_Devanagari({ variable: "--font-devanagari", subsets: ["devanagari"], display: "swap" });
const tamil = Anek_Tamil({ variable: "--font-tamil", subsets: ["tamil"], display: "swap" });
const telugu = Anek_Telugu({ variable: "--font-telugu", subsets: ["telugu"], display: "swap" });
const kannada = Anek_Kannada({ variable: "--font-kannada", subsets: ["kannada"], display: "swap" });
const malayalam = Anek_Malayalam({ variable: "--font-malayalam", subsets: ["malayalam"], display: "swap" });
const bangla = Anek_Bangla({ variable: "--font-bangla", subsets: ["bengali"], display: "swap" });
const gujarati = Anek_Gujarati({ variable: "--font-gujarati", subsets: ["gujarati"], display: "swap" });
const gurmukhi = Anek_Gurmukhi({ variable: "--font-gurmukhi", subsets: ["gurmukhi"], display: "swap" });
const arabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], display: "swap" });
const japanese = Noto_Sans_JP({ variable: "--font-japanese", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Arka — Indian stories, anime style",
    template: "%s · Arka",
  },
  description:
    "Turn a line of text into a short anime-style video. Built for Indian creators: 12 languages, vertical-first, priced in rupees.",
  openGraph: {
    title: "Arka — Indian stories, anime style",
    description:
      "Turn a line of text into a short anime-style video. Built for Indian creators.",
    type: "website",
    siteName: "Arka",
    locale: "en_IN",
    // The image itself comes from `app/opengraph-image.tsx`, which Next wires
    // up automatically — declaring it here as well would duplicate the tag.
  },
  /**
   * Without this, X renders a link as a small thumbnail beside the title. The
   * card is a poster; it should be shown as one.
   */
  twitter: {
    card: "summary_large_image",
    title: "Arka — Indian stories, anime style",
    description:
      "Turn a line of text into a short anime-style video. Built for Indian creators.",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1310",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Arka ships dark-only; there is no theme toggle to hydrate, so the class
      // is set statically and never flashes.
      className={`dark ${sans.variable} ${mono.variable} ${display.variable} ${devanagari.variable} ${tamil.variable} ${telugu.variable} ${kannada.variable} ${malayalam.variable} ${bangla.variable} ${gujarati.variable} ${gurmukhi.variable} ${arabic.variable} ${japanese.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <AnalyticsProvider>{children}</AnalyticsProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
