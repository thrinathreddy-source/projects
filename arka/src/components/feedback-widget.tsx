"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, messageFor } from "@/lib/client-api";
import { track } from "@/components/analytics-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const RATINGS = [1, 2, 3, 4, 5] as const;

/**
 * Feedback, one click away on every page.
 *
 * At this stage the highest-value thing the product can collect is a sentence
 * from someone who just tried it. Anything more elaborate than a rating and a
 * text box would lower the response rate.
 */
export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;

    setPending(true);
    try {
      await api.post("/api/feedback", { rating, message, page: pathname });
      track("feedback_submitted", { rating });
      toast.success("Thank you — we read every one of these.");
      setOpen(false);
      setMessage("");
      setRating(null);
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="fixed right-4 bottom-4 z-40 shadow-lg"
            aria-label="Send feedback"
          />
        }
      >
        <MessageSquarePlus className="size-4" />
        Feedback
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Tell us what you think</DialogTitle>
            <DialogDescription>
              Bugs, missing styles, pricing, anything. It goes straight to the
              people building this.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>How is it going?</Label>
              <div className="flex gap-1.5">
                {RATINGS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(rating === value ? null : value)}
                    aria-pressed={rating === value}
                    className={cn(
                      "size-9 rounded-md border text-sm transition-colors",
                      rating === value
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:border-input hover:text-foreground",
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-message">What happened?</Label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="The Telugu narration sounded off on the mythic style…"
                rows={4}
                maxLength={2000}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !message.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Send feedback
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
