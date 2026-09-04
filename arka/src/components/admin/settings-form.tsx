"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, messageFor } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type SettingField = {
  key: string;
  label: string;
  kind: "number" | "boolean";
  help: string;
  value: number | boolean;
};

/**
 * Live configuration.
 *
 * Credit pricing and the spend cap have to be changeable faster than a deploy —
 * if a provider doubles its rate on a Sunday, the fix is a number in this form.
 */
export function SettingsForm({ fields }: { fields: SettingField[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, number | boolean>>(
    Object.fromEntries(fields.map((field) => [field.key, field.value])),
  );
  const [saving, setSaving] = useState<string | null>(null);

  async function save(key: string, value: number | boolean) {
    setSaving(key);
    try {
      await api.patch("/api/admin/settings", { key, value });
      setValues((current) => ({ ...current, [key]: value }));
      toast.success("Saved.");
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setSaving(null);
    }
  }

  const numbers = fields.filter((field) => field.kind === "number");
  const toggles = fields.filter((field) => field.kind === "boolean");

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Values</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {numbers.map((field) => (
            <form
              key={field.key}
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                const parsed = Number(values[field.key]);
                if (!Number.isFinite(parsed)) {
                  toast.error("That needs to be a number.");
                  return;
                }
                void save(field.key, parsed);
              }}
            >
              <Label htmlFor={field.key}>{field.label}</Label>
              <div className="flex gap-2">
                <Input
                  id={field.key}
                  value={String(values[field.key] ?? "")}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: event.target.value as unknown as number,
                    }))
                  }
                  inputMode="decimal"
                  className="tabular-nums"
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={saving === field.key || values[field.key] === field.value}
                >
                  {saving === field.key ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{field.help}</p>
            </form>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium">Switches</h2>
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {toggles.map((field) => (
            <div key={field.key} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Label htmlFor={field.key} className="cursor-pointer">
                  {field.label}
                </Label>
                <p className="text-xs text-muted-foreground">{field.help}</p>
              </div>
              <Switch
                id={field.key}
                checked={Boolean(values[field.key])}
                disabled={saving === field.key}
                onCheckedChange={(checked) => void save(field.key, checked)}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
