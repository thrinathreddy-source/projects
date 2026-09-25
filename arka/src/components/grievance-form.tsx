"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, messageFor } from "@/lib/client-api";
import {
  describeDeadline,
  getGrievanceCategory,
  GRIEVANCE_CATEGORIES,
} from "@/lib/grievance-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORY_ITEMS = Object.fromEntries(
  GRIEVANCE_CATEGORIES.map((category) => [category.id, category.label]),
);

type Filed = { reference: string; acknowledged: boolean };

/**
 * The public grievance form.
 *
 * Works signed out, because the person with a complaint about a video is
 * usually not an Arka user. The reply names a reference and a deadline, and
 * the page says both again, so nobody leaves wondering whether it went through.
 */
export function GrievanceForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [category, setCategory] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [contentUrl, setContentUrl] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [filed, setFiled] = useState<Filed | null>(null);

  const selected = category ? getGrievanceCategory(category) : undefined;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);

    try {
      const result = await api.post<Filed>("/api/grievances", {
        category,
        name,
        email,
        contentUrl,
        message,
      });
      setFiled(result);
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  if (filed) {
    return (
      <div className="rounded-lg border border-border bg-card p-5" role="status">
        <div className="flex items-center gap-2 text-foreground">
          <CheckCircle2 className="size-5 text-primary" />
          <p className="font-medium">We have it.</p>
        </div>
        <p className="mt-3 text-sm">
          Your reference is <strong className="font-mono">{filed.reference}</strong>.
          {selected
            ? ` A person will reply with a decision within ${describeDeadline(
                selected.resolveWithinHours,
              )}.`
            : null}
        </p>
        <p className="mt-2 text-sm">
          {filed.acknowledged
            ? `A confirmation is on its way to ${email}.`
            : "We could not send a confirmation email just now — keep the reference above. Your complaint is recorded either way."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="grievance-category">What is this about?</Label>
        <Select
          items={CATEGORY_ITEMS}
          value={category || null}
          onValueChange={(value) => setCategory(value ?? "")}
        >
          <SelectTrigger id="grievance-category" className="w-full">
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {GRIEVANCE_CATEGORIES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected ? (
          <p className="text-xs text-muted-foreground">
            {selected.hint ? `${selected.hint} ` : ""}We decide these within{" "}
            {describeDeadline(selected.resolveWithinHours)}.
          </p>
        ) : null}
        {errors.category ? <p className="text-xs text-destructive">{errors.category}</p> : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="grievance-name">Your name (optional)</Label>
          <Input
            id="grievance-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            autoComplete="name"
          />
          {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="grievance-email">Email for our reply</Label>
          <Input
            id="grievance-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={320}
            autoComplete="email"
            required
          />
          {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="grievance-url">Link to the video (if there is one)</Label>
        <Input
          id="grievance-url"
          type="url"
          inputMode="url"
          value={contentUrl}
          onChange={(event) => setContentUrl(event.target.value)}
          maxLength={500}
          placeholder="https://"
        />
        {errors.contentUrl ? (
          <p className="text-xs text-destructive">{errors.contentUrl}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="grievance-message">What happened?</Label>
        <Textarea
          id="grievance-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={6}
          maxLength={5000}
          required
          placeholder="Describe what you saw and why it should come down. Include where it was posted if you know."
        />
        {errors.message ? <p className="text-xs text-destructive">{errors.message}</p> : null}
      </div>

      <Button type="submit" disabled={pending || !category}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Send complaint
      </Button>
    </form>
  );
}
