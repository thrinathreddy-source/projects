"use client";

import { useCallback, useEffect, useState } from "react";
import { Film, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, messageFor } from "@/lib/client-api";
import { ProjectCard, type ProjectCardData } from "@/components/projects/project-card";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Filter = "all" | "READY" | "RUNNING" | "FAILED";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "READY", label: "Ready" },
  { id: "RUNNING", label: "In progress" },
  { id: "FAILED", label: "Failed" },
];

type Page = { items: ProjectCardData[]; nextCursor: string | null };

export function ProjectsBrowser() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // A page is tagged with the filters it was loaded for, so "loading" is
  // derived rather than something an effect has to set synchronously.
  const [page, setPage] = useState<{
    key: string;
    items: ProjectCardData[];
    cursor: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const filterKey = `${filter}|${debouncedSearch}`;
  const loading = page?.key !== filterKey;
  const items = page?.key === filterKey ? page.items : [];
  const cursor = page?.key === filterKey ? page.cursor : null;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (nextCursor: string | null) => {
      const params = new URLSearchParams({ status: filter, limit: "24" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (nextCursor) params.set("cursor", nextCursor);

      return api.get<Page>(`/api/projects?${params.toString()}`);
    },
    [filter, debouncedSearch],
  );

  // Reload from scratch whenever the filters change.
  useEffect(() => {
    let active = true;

    load(null)
      .then((result) => {
        if (!active) return;
        setPage({ key: filterKey, items: result.items, cursor: result.nextCursor });
      })
      .catch((error) => {
        if (!active) return;
        toast.error(messageFor(error));
        // Settle into an empty state rather than spinning forever.
        setPage({ key: filterKey, items: [], cursor: null });
      });

    return () => {
      active = false;
    };
  }, [load, filterKey]);

  async function onLoadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const result = await load(cursor);
      setPage((current) =>
        current?.key === filterKey
          ? {
              key: filterKey,
              items: [...current.items, ...result.items],
              cursor: result.nextCursor,
            }
          : current,
      );
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                filter === option.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search titles and prompts"
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Film}
          title={debouncedSearch ? "Nothing matches that" : "No projects here"}
          description={
            debouncedSearch
              ? "Try a different word, or clear the search."
              : "Videos you generate will collect here."
          }
          action={
            debouncedSearch ? (
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            ) : (
              <ButtonLink href="/generate">
                <Sparkles className="size-4" />
                New video
              </ButtonLink>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>

          {cursor ? (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
