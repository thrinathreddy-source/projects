import { z } from "zod";

/**
 * What a grievance can be about, and how long we have to answer it.
 *
 * Adapted from The Mayatara's grievance form, which had the right shape — a
 * short list of categories, a reference number, a reply that proves receipt —
 * and extended with the one thing Arka needs that a matching app did not: a
 * clock per category. Arka generates video of real-looking people, gods and
 * communities, so the complaints that matter most here are the ones the law
 * puts on the shortest deadline.
 *
 * The deadlines are the ones we hold ourselves to, and each is set at or
 * inside the statutory one under the IT Rules 2021, rule 3(2):
 *
 *   24 hours  acknowledge every complaint; act on content that shows a person
 *             in nudity or a sexual act, or impersonates them — which is what
 *             a deepfake or a morphed likeness is.
 *   72 hours  act on any other request to take content down.
 *   15 days   dispose of everything else.
 *
 * Confirm them with counsel before launch, the same as the policy pages.
 * Shortening one is always safe; lengthening one may not be.
 *
 * Client-safe: this module is imported by the public form, so it must not pull
 * in anything server-only.
 */

const HOURS = 1;
const DAYS = 24 * HOURS;

/** Every complaint is acknowledged within this, whatever it is about. */
export const ACKNOWLEDGE_WITHIN_HOURS = 24 * HOURS;

export type GrievanceCategory = {
  id: string;
  label: string;
  hint: string;
  /** Hours from filing until it must be resolved or dismissed. */
  resolveWithinHours: number;
};

export const GRIEVANCE_CATEGORIES = [
  {
    id: "likeness",
    label: "A video shows me or impersonates someone",
    hint: "Including deepfakes, morphed faces and anything passed off as a real person.",
    resolveWithinHours: 24 * HOURS,
  },
  {
    id: "sexual",
    label: "Sexual or nude content",
    hint: "Anything showing nudity or a sexual act.",
    resolveWithinHours: 24 * HOURS,
  },
  {
    id: "child-safety",
    label: "Content that puts a child at risk",
    hint: "We act on these first.",
    resolveWithinHours: 24 * HOURS,
  },
  {
    id: "religion-community",
    label: "Offends a faith, caste or community",
    hint: "A deity or sacred subject depicted degradingly, or content targeting a group.",
    resolveWithinHours: 72 * HOURS,
  },
  {
    id: "copyright",
    label: "Uses my artwork, music or other work",
    hint: "Tell us what the original is and where it was published.",
    resolveWithinHours: 72 * HOURS,
  },
  {
    id: "harmful",
    label: "Other harmful or unlawful content",
    hint: "Misinformation, harassment, or anything else that should come down.",
    resolveWithinHours: 72 * HOURS,
  },
  {
    id: "personal-data",
    label: "My personal data",
    hint: "Access, correction or erasure. Signed-in users can also export or delete from Settings.",
    resolveWithinHours: 15 * DAYS,
  },
  {
    id: "account",
    label: "A decision about my account",
    hint: "A suspension, a removed video, or a refused request you want reviewed.",
    resolveWithinHours: 15 * DAYS,
  },
  {
    id: "other",
    label: "Something else",
    hint: "",
    resolveWithinHours: 15 * DAYS,
  },
] as const satisfies readonly GrievanceCategory[];

export type GrievanceCategoryId = (typeof GRIEVANCE_CATEGORIES)[number]["id"];

const BY_ID = new Map<string, GrievanceCategory>(
  GRIEVANCE_CATEGORIES.map((category) => [category.id, category]),
);

export function getGrievanceCategory(id: string): GrievanceCategory | undefined {
  return BY_ID.get(id);
}

/** The deadline for a complaint in this category, filed at `filedAt`. */
export function grievanceDueAt(categoryId: string, filedAt: Date): Date {
  const category = getGrievanceCategory(categoryId);
  // An unknown category cannot reach the database — the schema refuses it —
  // but if one ever did, the shortest clock is the safe one to put it on.
  const hours = category?.resolveWithinHours ?? 24 * HOURS;
  return new Date(filedAt.getTime() + hours * 60 * 60 * 1000);
}

/**
 * "24 hours", "72 hours", "15 days". For the form and the acknowledgement.
 *
 * Up to 72 in hours, because that is how the rules state the short deadlines
 * and "3 days" reads as three working days to most people.
 */
export function describeDeadline(hours: number): string {
  if (hours <= 72) return `${hours} hours`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

const ids = GRIEVANCE_CATEGORIES.map((category) => category.id) as [
  GrievanceCategoryId,
  ...GrievanceCategoryId[],
];

export const grievanceInputSchema = z.object({
  category: z.enum(ids, { error: "Pick what this is about." }),
  name: z.string().trim().max(100).optional().default(""),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .email("We need a valid email address to reply to."),
  // Not run through the content filter, deliberately. Describing what a video
  // shows often means repeating it, and a safety report refused for its own
  // subject matter is the worst possible outcome of this form.
  message: z
    .string()
    .trim()
    .min(20, "Tell us a little more — a sentence or two.")
    .max(5000),
  contentUrl: z
    .string()
    .trim()
    .max(500)
    // Only http(s). This is shown to an admin as a link, and a `javascript:`
    // URL there would run in an admin session.
    .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), {
      message: "Paste the full link, starting with https://",
    })
    .optional()
    .default(""),
});

export type GrievanceInput = z.infer<typeof grievanceInputSchema>;
