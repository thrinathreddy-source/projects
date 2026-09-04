"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, messageFor } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export function ApiKeys({ enabled }: { enabled: boolean }) {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get<ApiKeyRow[]>("/api/keys")
      .then(setKeys)
      .catch(() => setKeys([]));
  }, []);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const created = await api.post<ApiKeyRow & { key: string }>("/api/keys", { name });
      setFreshKey(created.key);
      setKeys((current) => [created, ...(current ?? [])]);
      setName("");
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: string) {
    setRevoking(id);
    try {
      await api.delete(`/api/keys/${id}`);
      setKeys((current) => (current ?? []).filter((key) => key.id !== id));
      toast.success("Key revoked.");
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setRevoking(null);
    }
  }

  async function onCopy() {
    if (!freshKey) return;
    await navigator.clipboard.writeText(freshKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!enabled) {
    return (
      <Alert>
        <AlertDescription>
          API access is part of the Studio plan. Upgrade to generate keys and
          drive Arka from your own tooling.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {freshKey ? (
        <Alert>
          <AlertDescription className="space-y-2">
            <p className="font-medium text-foreground">
              Copy this key now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">
                {freshKey}
              </code>
              <Button size="sm" variant="outline" onClick={onCopy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-2 sm:max-w-xs">
          <Label htmlFor="key-name">New key</Label>
          <Input
            id="key-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Production server"
            maxLength={60}
          />
        </div>
        <Button type="submit" variant="outline" disabled={creating}>
          {creating ? <Loader2 className="size-4 animate-spin" /> : null}
          Create key
        </Button>
      </form>

      {keys === null ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys"
          description="Create one to call Arka from your own scripts or backend."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{key.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {key.prefix}…{" "}
                  <span className="font-sans">
                    ·{" "}
                    {key.lastUsedAt
                      ? `used ${formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })}`
                      : "never used"}
                  </span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Revoke ${key.name}`}
                className="text-muted-foreground hover:text-destructive"
                disabled={revoking === key.id}
                onClick={() => onRevoke(key.id)}
              >
                {revoking === key.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
