"use client";

import { useEffect, useState } from "react";

interface Comment {
  id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function CommentRow({ comment }: { comment: Comment }) {
  const [reportState, setReportState] = useState<"idle" | "sending" | "done">("idle");

  async function report() {
    setReportState("sending");
    try {
      await fetch("/api/pulse/live/comments/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: comment.id }),
      });
    } finally {
      setReportState("done");
    }
  }

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span className="font-typewriter" style={{ fontSize: 11.5, color: "var(--saffron)" }}>
          {comment.author_name || "Anonymous"}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--ink-muted)" }}>{timeAgo(comment.created_at)}</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 4 }}>
        {comment.body}
      </p>
      {reportState === "done" ? (
        <span style={{ fontSize: 10.5, color: "var(--ink-muted)" }}>Reported</span>
      ) : (
        <button
          onClick={report}
          disabled={reportState === "sending"}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 10.5, color: "var(--ink-muted)", textDecoration: "underline" }}
        >
          Report
        </button>
      )}
    </div>
  );
}

export function PulseComments({ headlineId }: { headlineId: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  useEffect(() => {
    fetch(`/api/pulse/live/comments?headlineId=${encodeURIComponent(headlineId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setLoadError(data.error); return; }
        setComments(data.comments || []);
      })
      .catch(() => setLoadError("Couldn't load the discussion."));
  }, [headlineId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 2) return;
    setPosting(true);
    setPostError("");
    try {
      const res = await fetch("/api/pulse/live/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headlineId, authorName: name, body: text }),
      });
      const data = await res.json();
      if (!res.ok) { setPostError(data.error || "Couldn't post comment."); return; }
      setComments((prev) => [...(prev || []), data.comment]);
      setText("");
    } catch {
      setPostError("Couldn't post comment.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
      {loadError && <p style={{ fontSize: 11.5, color: "var(--maroon)" }}>{loadError}</p>}

      {comments === null && !loadError && (
        <p className="font-typewriter" style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>Loading discussion...</p>
      )}

      {comments !== null && comments.length === 0 && (
        <p style={{ fontSize: 11.5, color: "var(--ink-muted)", marginBottom: 8 }}>No comments yet — be the first.</p>
      )}

      {comments !== null && comments.length > 0 && (
        <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 10 }}>
          {comments.map((c) => <CommentRow key={c.id} comment={c} />)}
        </div>
      )}

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="input-stamped"
          style={{ fontSize: 12, padding: "6px 10px" }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add to the discussion..."
          rows={2}
          required
          className="input-stamped resize-none"
          style={{ fontSize: 12.5, padding: "6px 10px" }}
        />
        {postError && <span style={{ fontSize: 11, color: "var(--maroon)" }}>{postError}</span>}
        <button
          type="submit"
          disabled={posting || text.trim().length < 2}
          className="btn-secondary"
          style={{ fontSize: 11.5, padding: "6px 14px", alignSelf: "flex-end", opacity: posting ? 0.6 : 1 }}
        >
          {posting ? "Posting..." : "Post"}
        </button>
      </form>
    </div>
  );
}
