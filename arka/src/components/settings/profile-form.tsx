"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, messageFor } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Country drives billing currency, so it is a real setting, not decoration. */
const COUNTRIES = [
  { id: "IN", label: "India" },
  { id: "US", label: "United States" },
  { id: "GB", label: "United Kingdom" },
  { id: "AE", label: "United Arab Emirates" },
  { id: "SG", label: "Singapore" },
  { id: "AU", label: "Australia" },
  { id: "CA", label: "Canada" },
  { id: "OT", label: "Elsewhere" },
] as const;

const COUNTRY_ITEMS = Object.fromEntries(COUNTRIES.map((c) => [c.id, c.label]));

export function ProfileForm({
  initial,
}: {
  initial: { name: string; email: string; country: string };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [country, setCountry] = useState(
    COUNTRIES.some((item) => item.id === initial.country) ? initial.country : "OT",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const dirty = name !== initial.name || country !== initial.country;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setPending(true);

    try {
      await api.patch("/api/profile", { name, country });
      toast.success("Saved.");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          className="max-w-sm"
        />
        {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={initial.email} disabled className="max-w-sm" />
        <p className="text-xs text-muted-foreground">
          Write to support if you need this changed.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="country">Country</Label>
        <Select
          items={COUNTRY_ITEMS}
          value={country}
          onValueChange={(value) => setCountry(value ?? "OT")}
        >
          <SelectTrigger id="country" className="max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          India is billed in rupees; everywhere else in dollars.
        </p>
      </div>

      <Button type="submit" disabled={pending || !dirty}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Save changes
      </Button>
    </form>
  );
}
