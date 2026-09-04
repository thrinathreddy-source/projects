"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Loader2, Lock, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  ASPECT_RATIOS,
  DURATIONS,
  GENERATION_DEFAULTS,
  LANGUAGES,
  SETTINGS,
  VIDEO_STYLES,
  VOICES,
  buildImagePrompt,
  type GenerationInput,
} from "@/lib/catalog";
import { api, ApiError, messageFor } from "@/lib/client-api";
import { track } from "@/components/analytics-provider";
import { formatCredits } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Starter prompts, written for the audience this is actually built for. */
const EXAMPLES = [
  "A young Kathakali dancer practising alone on a rooftop as the monsoon breaks",
  "Two brothers racing cycles through a gully at golden hour",
  "Abhimanyu steps into the Chakravyuha, dust rising around him",
  "A chaiwala opens his stall in the blue light before dawn",
];

export type PlanLimits = {
  code: string;
  name: string;
  maxDurationSec: number;
  allowFinal: boolean;
  allowMotion: boolean;
};

export function GenerateForm({
  plan,
  balance,
  onQueued,
  onAspectRatioChange,
}: {
  plan: PlanLimits;
  balance: number;
  onQueued: (projectId: string) => void;
  onAspectRatioChange?: (aspectRatio: string) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<GenerationInput>(GENERATION_DEFAULTS);
  const [cost, setCost] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const clientToken = useRef(crypto.randomUUID());

  const update = useCallback(
    <K extends keyof GenerationInput>(key: K, value: GenerationInput[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
      if (key === "aspectRatio") onAspectRatioChange?.(value as string);
      setFieldErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    },
    [onAspectRatioChange],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await api.post<{ credits: number }>("/api/estimate", {
          durationSec: form.durationSec,
          voiceId: form.voiceId,
          tier: "STILL",
        });
        if (!cancelled) setCost(result.credits);
      } catch {
        if (!cancelled) setCost(null);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.durationSec, form.voiceId]);

  const affordable = cost === null || balance >= cost;

  const voices = useMemo(() => VOICES.filter((v) => v.languages.length === 0), []);
  const languageItems = useMemo(
    () => Object.fromEntries(LANGUAGES.map((i) => [i.id, i.label])),
    [],
  );
  const voiceItems = useMemo(
    () => Object.fromEntries(voices.map((i) => [i.id, i.label])),
    [voices],
  );

  /**
   * The expanded prompt, computed client-side from the same builder the worker
   * uses. Showing it is the point: the lexicon is the part of Arka nobody else
   * has, and it is otherwise completely invisible to the person paying for it.
   */
  const expanded = useMemo(
    () =>
      buildImagePrompt({
        prompt: form.prompt || "…",
        style: form.style,
        setting: form.setting,
      }),
    [form.prompt, form.style, form.setting],
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setPending(true);

    try {
      const project = await api.post<{ id: string }>("/api/projects", {
        ...form,
        clientToken: clientToken.current,
      });

      track("generation_started", {
        style: form.style,
        setting: form.setting,
        language: form.language,
      });

      clientToken.current = crypto.randomUUID();
      onQueued(project.id);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        if (error.code === "INSUFFICIENT_CREDITS") {
          toast.error(error.message, {
            action: { label: "Get credits", onClick: () => router.push("/billing") },
          });
          return;
        }
      }
      toast.error(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-12">
      {/* ── 01 THE SHOT ─────────────────────────────────────────────── */}
      <Plate n="01" title="The shot">
        <Field label="Title" htmlFor="title" error={fieldErrors.title}>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Monsoon rooftop"
            maxLength={120}
            required
            className="rounded-none border-x-0 border-t-0 border-b-2 px-0 text-lg focus-visible:ring-0"
          />
        </Field>

        <Field
          label="What happens"
          htmlFor="prompt"
          error={fieldErrors.prompt}
          hint="One clear moment. Name the light and the action — the setting below fills in the place."
        >
          <Textarea
            id="prompt"
            value={form.prompt}
            onChange={(e) => update("prompt", e.target.value)}
            placeholder="A young Kathakali dancer practising alone as the monsoon breaks"
            rows={3}
            maxLength={2000}
            required
            className="rounded-none border-2 text-base"
          />
          <div className="flex flex-wrap gap-1.5 pt-2.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => update("prompt", example)}
                className="annotation border border-border px-2 py-1 text-muted-foreground transition-colors hover:border-cyan hover:text-cyan"
              >
                {example.slice(0, 34)}…
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Narration"
          htmlFor="script"
          error={fieldErrors.script}
          hint="What the voice says. Leave empty and we read the prompt, which sounds like a stage direction."
        >
          <Textarea
            id="script"
            value={form.script}
            onChange={(e) => update("script", e.target.value)}
            placeholder="He was sixteen. He knew how to enter. Nobody taught him how to leave."
            rows={2}
            maxLength={1000}
            className="rounded-none border-2"
          />
        </Field>
      </Plate>

      {/* ── 02 THE LOOK ─────────────────────────────────────────────── */}
      <Plate n="02" title="The look" caption="How it is drawn">
        <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
          {VIDEO_STYLES.map((style) => {
            const on = form.style === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => update("style", style.id)}
                aria-pressed={on}
                className={cn(
                  "group relative overflow-hidden bg-background p-3 text-left transition-colors",
                  on && "bg-card",
                )}
              >
                <span
                  className="mb-2.5 block h-12"
                  style={{
                    background: `linear-gradient(150deg, ${style.accent} 0%, transparent 75%)`,
                    opacity: on ? 1 : 0.4,
                  }}
                />
                <span
                  className={cn("poster block text-lg", on ? "text-vermilion" : "text-foreground")}
                >
                  {style.label}
                </span>
                <span className="annotation mt-1 block text-muted-foreground">
                  {style.drawingsPerSecond}fps
                </span>
                {on ? <span className="absolute inset-x-0 top-0 h-0.5 bg-vermilion" /> : null}
              </button>
            );
          })}
        </div>
      </Plate>

      {/* ── 03 THE PLACE ────────────────────────────────────────────── */}
      <Plate
        n="03"
        title="The place"
        caption="Swaps generic words for specific ones before the model sees them"
      >
        <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
          {SETTINGS.map((place) => {
            const on = form.setting === place.id;
            return (
              <button
                key={place.id}
                type="button"
                onClick={() => update("setting", place.id)}
                aria-pressed={on}
                title={place.description}
                className={cn(
                  "relative bg-background p-3 text-left transition-colors",
                  on && "bg-card",
                )}
              >
                <span
                  className="mb-2.5 block h-1.5"
                  style={{ background: place.accent, opacity: on ? 1 : 0.45 }}
                />
                <span
                  className={cn("poster block text-lg", on ? "text-vermilion" : "text-foreground")}
                >
                  {place.label}
                </span>
                <span className="mt-1 block font-mono text-[10px] leading-snug text-muted-foreground">
                  {place.description}
                </span>
                {on ? <span className="absolute inset-x-0 top-0 h-0.5 bg-vermilion" /> : null}
              </button>
            );
          })}
        </div>

        {/* The lexicon, made visible. */}
        <div className="mt-4 border border-border">
          <button
            type="button"
            onClick={() => setShowPrompt((v) => !v)}
            className="annotation flex w-full items-center justify-between px-3 py-2.5 text-cyan transition-colors hover:bg-card"
          >
            <span className="flex items-center gap-2">
              <Wand2 className="size-3.5" />
              What Arka actually sends the model
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", showPrompt && "rotate-180")} />
          </button>
          {showPrompt ? (
            <div className="space-y-3 border-t border-border p-3">
              <p className="font-mono text-[11px] leading-relaxed break-words text-muted-foreground">
                {expanded.prompt}
              </p>
              <p className="font-mono text-[11px] leading-relaxed break-words text-vermilion/70">
                <span className="annotation text-vermilion">negative · </span>
                {expanded.negativePrompt}
              </p>
            </div>
          ) : null}
        </div>
      </Plate>

      {/* ── 04 THE FRAME ────────────────────────────────────────────── */}
      <Plate n="04" title="The frame">
        <div className="grid gap-8 sm:grid-cols-2">
          <Field label="Aspect" error={fieldErrors.aspectRatio}>
            <div className="flex gap-px border border-border bg-border">
              {ASPECT_RATIOS.map((r) => {
                const on = form.aspectRatio === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => update("aspectRatio", r.id)}
                    aria-pressed={on}
                    className={cn(
                      "flex flex-1 flex-col items-center gap-2 bg-background py-3 transition-colors",
                      on && "bg-card",
                    )}
                  >
                    <span
                      className={cn("block border-2", on ? "border-vermilion" : "border-muted-foreground")}
                      style={{
                        width: r.id === "16:9" ? 26 : r.id === "1:1" ? 18 : 12,
                        height: r.id === "16:9" ? 15 : r.id === "1:1" ? 18 : 21,
                      }}
                    />
                    <span className="annotation">{r.id}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field
            label="Length"
            error={fieldErrors.durationSec}
            hint={plan.maxDurationSec < 15 ? `${plan.name} allows up to ${plan.maxDurationSec}s.` : undefined}
          >
            <div className="flex gap-px border border-border bg-border">
              {DURATIONS.map((d) => {
                const locked = d > plan.maxDurationSec;
                const on = form.durationSec === d;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={locked}
                    onClick={() => update("durationSec", d)}
                    aria-pressed={on}
                    className={cn(
                      "poster flex flex-1 items-center justify-center gap-1 bg-background py-4 text-xl transition-colors",
                      on ? "bg-card text-vermilion" : "text-muted-foreground",
                      locked && "cursor-not-allowed opacity-30",
                    )}
                  >
                    {locked ? <Lock className="size-3" /> : null}
                    {d}s
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Language" htmlFor="language" error={fieldErrors.language}>
            <Select
              items={languageItems}
              value={form.language}
              onValueChange={(v) => update("language", (v ?? "en") as GenerationInput["language"])}
            >
              <SelectTrigger id="language" className="w-full rounded-none border-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <span lang={l.id}>{l.native}</span>
                    <span className="ml-2 text-muted-foreground">{l.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Voice" htmlFor="voice" error={fieldErrors.voiceId}>
            <Select
              items={voiceItems}
              value={form.voiceId}
              onValueChange={(v) => update("voiceId", (v ?? "none") as GenerationInput["voiceId"])}
            >
              <SelectTrigger id="voice" className="w-full rounded-none border-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {voices.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                    <span className="ml-2 text-muted-foreground">{v.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Plate>

      {/* ── Commit ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-vermilion/40 pt-6">
        <div>
          <p className="annotation text-muted-foreground">Stage one · the still</p>
          <p className="mt-1.5 text-sm">
            {cost === null ? (
              "Pricing…"
            ) : (
              <>
                <span className="poster text-2xl text-vermilion">{formatCredits(cost)}</span>
                <span className="ml-2 text-muted-foreground">
                  credits · you have {formatCredits(balance)}
                </span>
              </>
            )}
          </p>
        </div>

        {affordable ? (
          <Button type="submit" size="xl" className="rounded-none" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Draw the still
          </Button>
        ) : (
          <Button size="xl" className="rounded-none" render={<Link href="/billing" />}>
            Get credits
          </Button>
        )}
      </div>
    </form>
  );
}

/** A numbered section, matching the plate language of the marketing pages. */
function Plate({
  n,
  title,
  caption,
  children,
}: {
  n: string;
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-baseline gap-3 border-b border-border pb-2">
        <span className="poster text-3xl text-vermilion tabular-nums">{n}</span>
        <h2 className="poster text-2xl">{title}</h2>
        {caption ? (
          <span className="annotation ml-auto hidden text-muted-foreground sm:block">
            {caption}
          </span>
        ) : null}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="annotation block text-muted-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="font-mono text-[11px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
