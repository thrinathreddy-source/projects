# Showcase assets

These clips replaced the free tier. Nobody gets free credits any more, so this
is the only thing that convinces a stranger the product is worth paying for —
it carries the whole top of the funnel.

## Adding a clip

Two files per entry, sharing one basename:

```
public/showcase/meenakshi-dawn.mp4    the clip itself
public/showcase/meenakshi-dawn.jpg    poster frame, shown before playback
```

Then add the matching entry to `SHOWCASE` in `src/lib/showcase.ts`. Entries
whose `.jpg` is missing are skipped, so a half-published clip never renders as a
broken frame — and if the list is empty the whole section disappears rather than
heading an empty grid.

## Producing them

Render through Arka itself, on a real account, so the clips are honestly what a
customer would get. Budget is about **₹232 for eight clips** — that is 6 stills
per clip (nobody keeps the first) plus 5 seconds of motion and narration. Run
`npm run economics` for the current figure.

Download the finished mp4 from the project page, then take the poster frame:

```bash
ffmpeg -i meenakshi-dawn.mp4 -vf "select=eq(n\,0)" -q:v 2 meenakshi-dawn.jpg
```

## What to publish

Eight strong clips persuade. Forty mediocre ones advertise the mediocre ones.

Every clip should survive the question the entire lexicon rests on: **does this
look like the place it claims to be?** A Temple South clip that renders a pagoda
is not a showcase entry, it is a bug report.

Keep the `prompt` field verbatim. A showcase that hides its inputs reads as a
reel; one that shows them reads as evidence.
