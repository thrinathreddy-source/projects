import { z } from "zod";
import {
  getSetting,
  JAPANESE_DEFAULTS,
  QUALITY_NEGATIVES,
  QUALITY_PREFIX,
  REVERENCE_PREFIX,
  SAFETY_NEGATIVES,
  SETTINGS,
} from "@/lib/settings-catalog";

import { touchesReligion } from "@/lib/moderation";

export * from "@/lib/settings-catalog";

/**
 * The generation catalog: styles, languages, voices, aspect ratios, durations.
 *
 * Kept in code rather than DB enums so adding a style is a one-line change with
 * no migration. Each style carries the prompt scaffolding that turns a user's
 * plain sentence into something a video model renders well — that scaffolding
 * is the actual product, not the model call.
 */

export type CatalogItem = {
  id: string;
  label: string;
  description: string;
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export type VideoStyle = CatalogItem & {
  /**
   * Danbooru-style tags, not prose. These models are trained on comma-separated
   * tag lists and respond to them far more reliably than to a sentence.
   */
  tags: string;
  /** How this style *moves*, applied at the motion stage only. */
  motionTags: string;
  /** Negatives specific to this style, on top of the global ones. */
  avoid: string;
  /** Preferred model family; the router treats this as a hint, not a command. */
  modelHint: "anime" | "cinematic" | "general";
  /**
   * Drawings per second for the cadence pass.
   *
   * Real anime is limited animation: 12 is "on twos", 8 is "on threes", 6 is
   * the very held look of a manga panel coming alive. This is what stops the
   * render reading as smooth AI video. See `postProcess` in `lib/mux.ts`.
   */
  drawingsPerSecond: number;
  accent: string;
};

export const VIDEO_STYLES = [
  {
    id: "shonen",
    label: "Shonen Action",
    description: "High-energy battle anime. Speed lines, dramatic angles, bold colour.",
    tags:
      "dynamic angle, from below, action pose, speed lines, motion blur, saturated colors, cel shading, crisp lineart, dramatic lighting",
    motionTags: "fast decisive movement, impact frame, cloth snapping",
    avoid: "static pose, dull colors, soft focus",
    modelHint: "anime",
    // on twos — action needs the snap of a held frame
    drawingsPerSecond: 12,
    accent: "#f97316",
  },
  {
    id: "ghibli",
    label: "Pastoral",
    description: "Soft, warm, hand-painted. Villages, fields, quiet moments.",
    tags:
      "soft natural lighting, painterly background, gentle breeze, muted natural palette, detailed scenery, warm sunlight",
    motionTags: "gentle wind through foliage, slow drifting clouds, subtle cloth movement",
    avoid: "harsh contrast, neon, gore",
    modelHint: "anime",
    // on twos — gentle but never soupy
    drawingsPerSecond: 12,
    accent: "#84cc16",
  },
  {
    id: "mythic",
    label: "Mythic Epic",
    description: "Gods, kings and legends. Gold light, temple scale, painterly.",
    tags:
      "epic scale, golden hour, god rays, volumetric lighting, ornate detail, low angle, divine atmosphere, painterly background",
    motionTags: "slow majestic push in, drifting dust motes, banners moving",
    avoid: "modern clothing, cars, chibi",
    modelHint: "cinematic",
    // on threes — stately, closer to a moving painting
    drawingsPerSecond: 8,
    accent: "#eab308",
  },
  {
    id: "retro90s",
    label: "Retro 90s",
    description: "Film-grain cel animation. VHS warmth, hand-inked frames.",
    tags:
      "1990s anime, retro anime style, film grain, muted colors, hand-drawn cel animation, halftone shading, vintage",
    motionTags: "minimal movement, held frame, subtle hair movement",
    avoid: "modern 3d, clean digital, hyperreal",
    modelHint: "anime",
    // on threes, the way 90s TV anime was actually shot
    drawingsPerSecond: 8,
    accent: "#a855f7",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Modern film-grade anime. Shallow depth, rich contrast.",
    tags:
      "cinematic lighting, shallow depth of field, rim lighting, anamorphic framing, high contrast, detailed background",
    motionTags: "slow dolly, rack focus, subtle parallax",
    avoid: "flat lighting, low resolution",
    modelHint: "cinematic",
    // on twos
    drawingsPerSecond: 12,
    accent: "#06b6d4",
  },
  {
    id: "streetnoir",
    label: "Street Noir",
    description: "Rain-slick city nights. Neon signage, long shadows.",
    tags:
      "night, rain, neon signage, wet reflective street, teal and magenta lighting, moody, deep shadows",
    motionTags: "falling rain, flickering neon, slow pan",
    avoid: "daylight, pastel, cheerful",
    modelHint: "cinematic",
    // on twos
    drawingsPerSecond: 12,
    accent: "#ec4899",
  },
  {
    id: "chibi",
    label: "Chibi",
    description: "Cute, small, expressive. Great for explainers and skits.",
    tags:
      "chibi, super deformed, large head, simple background, bright flat colors, cute expression",
    motionTags: "bouncy exaggerated movement, small hop",
    avoid: "realistic proportions, gore, gritty",
    modelHint: "anime",
    // on twos — bouncy timing reads best held
    drawingsPerSecond: 12,
    accent: "#f43f5e",
  },
  {
    id: "manga",
    label: "Manga Ink",
    description: "Black-and-white panel energy. Screentone and heavy ink.",
    tags:
      "monochrome, greyscale, screentone, heavy ink, manga panel, high contrast, cross hatching",
    motionTags: "almost still, one element moving, page turn stillness",
    avoid: "color, colour, 3d",
    modelHint: "anime",
    // very held; a panel that barely moves
    drawingsPerSecond: 6,
    accent: "#94a3b8",
  },
] as const satisfies readonly VideoStyle[];

export type VideoStyleId = (typeof VIDEO_STYLES)[number]["id"];

const STYLE_BY_ID = new Map(VIDEO_STYLES.map((style) => [style.id, style]));

export function getStyle(id: string): VideoStyle {
  return STYLE_BY_ID.get(id as VideoStyleId) ?? VIDEO_STYLES[0];
}

// ---------------------------------------------------------------------------
// Languages — the narration/caption language, not the UI language.
// ---------------------------------------------------------------------------

export type Language = CatalogItem & { native: string };

export const LANGUAGES = [
  { id: "en", label: "English", native: "English", description: "Global default" },
  { id: "hi", label: "Hindi", native: "हिन्दी", description: "" },
  { id: "ta", label: "Tamil", native: "தமிழ்", description: "" },
  { id: "te", label: "Telugu", native: "తెలుగు", description: "" },
  { id: "kn", label: "Kannada", native: "ಕನ್ನಡ", description: "" },
  { id: "ml", label: "Malayalam", native: "മലയാളം", description: "" },
  { id: "mr", label: "Marathi", native: "मराठी", description: "" },
  { id: "bn", label: "Bengali", native: "বাংলা", description: "" },
  { id: "gu", label: "Gujarati", native: "ગુજરાતી", description: "" },
  { id: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ", description: "" },
  { id: "ur", label: "Urdu", native: "اردو", description: "" },
  { id: "ja", label: "Japanese", native: "日本語", description: "" },
] as const satisfies readonly Language[];

export type LanguageId = (typeof LANGUAGES)[number]["id"];

// ---------------------------------------------------------------------------
// Voices — "none" is a first-class option; plenty of shorts ship music-only.
// ---------------------------------------------------------------------------

export type Voice = CatalogItem & {
  gender: "female" | "male" | "neutral";
  /** Empty means the voice works for every language in the catalog. */
  languages: readonly string[];
  /**
   * The vendor's own voice identifier. Kept here so renaming a voice in our UI
   * never changes what a render sounds like, and so swapping TTS vendors is a
   * change to this column rather than to every project row.
   */
  providerVoiceId: string;
};

export const VOICES = [
  {
    id: "none",
    label: "No narration",
    description: "Silent render. Add your own audio later.",
    gender: "neutral",
    languages: [],
    providerVoiceId: "",
  },
  {
    id: "meera",
    label: "Meera",
    description: "Warm, storytelling pace. Works well for folklore.",
    gender: "female",
    languages: [],
    providerVoiceId: "Wise_Woman",
  },
  {
    id: "arjun",
    label: "Arjun",
    description: "Grounded and clear. Good for explainers.",
    gender: "male",
    languages: [],
    providerVoiceId: "Friendly_Person",
  },
  {
    id: "kavya",
    label: "Kavya",
    description: "Bright and quick. Suits fast-cut social edits.",
    gender: "female",
    languages: [],
    providerVoiceId: "Lively_Girl",
  },
  {
    id: "vikram",
    label: "Vikram",
    description: "Deep and cinematic. Built for mythic narration.",
    gender: "male",
    languages: [],
    providerVoiceId: "Deep_Voice_Man",
  },
] as const satisfies readonly Voice[];

export type VoiceId = (typeof VOICES)[number]["id"];

const VOICE_BY_ID = new Map(VOICES.map((voice) => [voice.id, voice]));

export function getVoice(id: string): Voice | undefined {
  return VOICE_BY_ID.get(id as VoiceId);
}

export const NO_VOICE = "none";

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

export type AspectRatio = CatalogItem & {
  width: number;
  height: number;
  ratio: string;
};

export const ASPECT_RATIOS = [
  {
    id: "9:16",
    label: "Vertical",
    description: "Reels, Shorts, TikTok",
    ratio: "9:16",
    width: 576,
    height: 1024,
  },
  {
    id: "1:1",
    label: "Square",
    description: "Feed posts",
    ratio: "1:1",
    width: 768,
    height: 768,
  },
  {
    id: "16:9",
    label: "Wide",
    description: "YouTube, landing pages",
    ratio: "16:9",
    width: 1024,
    height: 576,
  },
] as const satisfies readonly AspectRatio[];

export type AspectRatioId = (typeof ASPECT_RATIOS)[number]["id"];

const ASPECT_BY_ID = new Map(ASPECT_RATIOS.map((item) => [item.id, item]));

export function getAspectRatio(id: string): AspectRatio {
  return ASPECT_BY_ID.get(id as AspectRatioId) ?? ASPECT_RATIOS[0];
}

/** Durations we allow, in seconds. Longer costs proportionally more. */
export const DURATIONS = [5, 8, 10, 15] as const;
export type DurationSec = (typeof DURATIONS)[number];

// ---------------------------------------------------------------------------
// Validation — a single source of truth shared by API routes and forms.
// ---------------------------------------------------------------------------

const ids = <T extends readonly { id: string }[]>(items: T) =>
  items.map((item) => item.id) as [string, ...string[]];

export const generationInputSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(120),
  prompt: z
    .string()
    .trim()
    .min(10, "Describe the scene in a little more detail.")
    .max(2000),
  /** Narration text. Optional; falls back to the prompt when a voice is set. */
  script: z.string().trim().max(1000).default(""),
  style: z.enum(ids(VIDEO_STYLES)),
  setting: z.enum(ids(SETTINGS)),
  language: z.enum(ids(LANGUAGES)),
  voiceId: z.enum(ids(VOICES)),
  aspectRatio: z.enum(ids(ASPECT_RATIOS)),
  durationSec: z.union([z.literal(5), z.literal(8), z.literal(10), z.literal(15)]),
});

export type GenerationInput = z.infer<typeof generationInputSchema>;

export const GENERATION_DEFAULTS: GenerationInput = {
  title: "",
  prompt: "",
  script: "",
  style: "mythic",
  setting: "dravidian",
  language: "en",
  voiceId: "none",
  aspectRatio: "9:16",
  durationSec: 5,
};

/**
 * Assemble the prompt for the still.
 *
 * Order matters to these models: quality prefix, then subject, then style, then
 * place. The user's sentence sits early so it dominates; the lexicon follows to
 * pin down what the nouns in it actually look like.
 *
 * The negative is doing as much work as the positive. `JAPANESE_DEFAULTS` is
 * what stops a Varanasi ghat quietly becoming a Kyoto riverbank.
 */
export function buildImagePrompt(input: {
  prompt: string;
  style: string;
  setting: string;
}): { prompt: string; negativePrompt: string } {
  const style = getStyle(input.style);
  const place = getSetting(input.setting);

  // Reverent framing when the subject is devotional. Positives pull harder
  // than negatives on these models, and this is what the audience wants
  // anyway — the safety benefit and the quality benefit point the same way.
  const reverence = touchesReligion(input.prompt) ? [REVERENCE_PREFIX] : [];

  return {
    prompt: [
      QUALITY_PREFIX,
      ...reverence,
      input.prompt.trim(),
      style.tags,
      place.scene,
      place.dress,
      place.palette,
    ].join(", "),
    // SAFETY_NEGATIVES goes last and is never omitted. It is the only layer
    // that acts on what the model can produce rather than on what the user
    // typed, so a prompt that slipped past moderation still lands safely.
    negativePrompt: [
      QUALITY_NEGATIVES,
      JAPANESE_DEFAULTS,
      style.avoid,
      place.avoid,
      SAFETY_NEGATIVES,
    ].join(", "),
  };
}

/**
 * Assemble the prompt for the motion stage.
 *
 * Deliberately thinner than the still prompt. The still already carries the
 * look, and the video model is conditioned on it — repeating the whole lexicon
 * here only gives the model licence to reinterpret a frame that is already
 * correct. All it needs to know is what should move, and that the answer is
 * "not much": big camera moves are precisely what makes AI video read as a game
 * cinematic rather than a cel.
 */
export function buildMotionPrompt(input: {
  prompt: string;
  style: string;
}): { prompt: string; negativePrompt: string } {
  const style = getStyle(input.style);
  const reverence = touchesReligion(input.prompt) ? [REVERENCE_PREFIX] : [];

  return {
    prompt: [
      ...reverence,
      input.prompt.trim(),
      style.motionTags,
      "subtle motion, limited animation, held frames, stable camera",
    ].join(", "),
    // The motion stage needs these as much as the still does. It is
    // conditioned on an approved first frame, but it is still a generative
    // model and can drift somewhere the still never went.
    negativePrompt: [
      QUALITY_NEGATIVES,
      JAPANESE_DEFAULTS,
      "morphing, warping, distorted, flickering, rapid camera movement, zoom, shaky",
      SAFETY_NEGATIVES,
    ].join(", "),
  };
}

/**
 * What the narrator actually says.
 *
 * The prompt describes what the camera sees, which is not the same thing —
 * reading a shot description aloud sounds like a stage direction. When the user
 * has not written a script we fall back to the prompt anyway, because silent
 * narration would be worse, but the form nudges them to write one.
 */
export function narrationText(project: {
  script: string | null;
  prompt: string;
}): string {
  return project.script?.trim() || project.prompt.trim();
}
