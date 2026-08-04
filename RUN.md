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
The **Brief** tab is written by Claude at refresh time. Everything else — including the Capital feed — builds without a key.

**Key handling (read this).** The key is read from the environment **only**; it is never written to any file, committed, or otherwise persisted. Set it **ephemerally**, in the same terminal, right before you run — so it disappears when the terminal closes:

```powershell
# PowerShell (recommended — ephemeral, nothing on disk)
$env:ANTHROPIC_API_KEY = "<your key>"
node src/refresh.mjs
```
```bash
# bash equivalent
export ANTHROPIC_API_KEY="<your key>"
node src/refresh.mjs
```

Rules of the road:
- **Never** paste the key into a file in this repo, a commit, or a chat window. `.env`/secrets are gitignored, but the safest path is to not put it on disk at all.
- If the key is ever exposed (pasted somewhere it shouldn't be), **rotate it** in the Anthropic Console — don't try to scrub it.
- For a persistent setup, pull it from a secret store at runtime (Windows Credential Manager, 1Password CLI) instead of a plaintext file.

Without a key, narration is skipped and the last brief (or the seed brief) is kept — the rest of the dashboard still builds.

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
src/pipeline.mjs        Development feed   → data/processed/development.json
src/transactions.mjs    Transactions feed  → transactions.json
src/risk.mjs            Risk feed          → risk.json
src/ll97.mjs            Local Law 97 feed  → ll97.json
src/capital.mjs         Capital feed (FRED, keyless) → capital.json
src/crosssignal.mjs     Cross-Signal join  → crosssignal.json
src/narrate.mjs         AI Brief (needs key)→ narratives.json
src/build-dashboard.mjs render all feeds   → dashboard/index.html
src/refresh.mjs         runs all of the above in order
```

## What each figure means
- **Filings** — New Building job applications filed with DOB that month.
- **vs. 12-mo avg** — deviation from the trailing-12-month average (trend baseline).
- **YoY** — vs. the same month one year earlier (seasonality-clean).
- **Regime** — Elevated / Cooling / In range, driven by whichever comparison is more extreme (±25%).
- **verify ↗** — opens the exact DOB records behind that number.

See [SOURCES.md](SOURCES.md) for the pinned dataset and [DECISIONS.md](DECISIONS.md) for why it's built this way.
