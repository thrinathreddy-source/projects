# Portfolio

Four projects, kept as their own folders in this repo for review.

## [arka](arka/)
Turn a line of text into a short anime-style video. Built for Indian creators —
twelve languages, vertical by default, priced in rupees. A full workflow product
(queue, credits, model dispatch, storage, delivery), not a chat wrapper.
Next.js + Postgres.

## [ai-inbox](ai-inbox/)
Next.js app with automated SEO tooling — a weekly audit that runs through
GitHub Actions, checks listing quality, and (when configured) reports through
Search Console and the Google Indexing API.

## [openglass-multilingual](openglass-multilingual/) — "Drishti"
Smart glasses that answer you in your own language, offline, with no account
and no subscription: press a button, speak Telugu, hear Telugu back. Software
(gateway + language pipeline) is working today on a laptop or phone; hardware
(monocular birdbath display glasses) is at the planning stage. See
[ARCHITECTURE.md](openglass-multilingual/ARCHITECTURE.md) and
[BUILD_PROCESS.md](openglass-multilingual/BUILD_PROCESS.md) for the design.

## [mayatara](mayatara/)
Document generation tooling — scripts that produce land proposal and state
documents as `.docx`/PDF (Node + Python), plus a companion Next.js app
(`mayatara/maytara`).

---

Each project's own README has full setup instructions. Large local artifacts
(dependency installs, build caches, downloaded voice models, `.env` files with
real credentials) are intentionally excluded — see each folder's `.env.example`
or `.env.template` for the configuration shape.
