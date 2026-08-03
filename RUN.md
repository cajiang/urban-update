# Running the Development Feed

No dependencies to install — uses Node's built-in `fetch`. Requires Node 18+ (tested on Node 24).

```bash
# 1. Pull live DOB data, aggregate, detect regimes → data/processed/development.json
node src/pipeline.mjs

# 2. Build the self-contained dashboard → dashboard/index.html
node src/build-dashboard.mjs
```

Then open `dashboard/index.html` in any browser. It's fully self-contained (data inlined) — no server needed.

Or run every step in one command:

```bash
node src/refresh.mjs
```

### The AI Brief (optional, needs a key)
The **Brief** tab is written by Claude at refresh time. To enable live regeneration, set your Anthropic API key first:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
node src/refresh.mjs
```

Without a key, narration is skipped and the last brief (or the seed brief) is kept — the rest of the dashboard still builds. The key is read from the environment only; it is never written to any file.

The dashboard shows a **Data Provenance & Freshness** panel: the DOB source updates **daily**, and the panel flags if our last pull is more than 2 days behind the source. Re-run `refresh` to catch up.

### Keeping it auto-updated (optional)
To refresh automatically every day, register a Windows Scheduled Task (adjust the path):

```bash
schtasks /Create /SC DAILY /TN "UrbanUpdate-Refresh" /TR "node \"C:\\Users\\Calvin\\Documents\\Claude\\Projects\\PMOS\\Urban Update\\src\\refresh.mjs\"" /ST 07:00
```

This is off by default — the pipeline pulls live on every manual run regardless.

## Layout
```
src/lib/socrata.mjs     source registry + Socrata fetch helper (single source of truth for dataset IDs)
src/pipeline.mjs        ingest + analyze  → data/processed/development.json
src/build-dashboard.mjs render            → dashboard/index.html
```

## What each figure means
- **Filings** — New Building job applications filed with DOB that month.
- **vs. 12-mo avg** — deviation from the trailing-12-month average (trend baseline).
- **YoY** — vs. the same month one year earlier (seasonality-clean).
- **Regime** — Elevated / Cooling / In range, driven by whichever comparison is more extreme (±25%).
- **verify ↗** — opens the exact DOB records behind that number.

See [SOURCES.md](SOURCES.md) for the pinned dataset and [DECISIONS.md](DECISIONS.md) for why it's built this way.
