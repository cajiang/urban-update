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

### The Affordability feed (needs the free Census key)
The **Affordability** tab and the `demand` refresh step use U.S. Census ACS data, which needs a free `CENSUS_API_KEY`. It's a low-sensitivity rate token (not a billing credential), so it lives as a user environment variable and the tooling reads it directly. Without it, the `demand` step skips and **keeps** the last good `demand.json` (it never wipes it). Everything else still builds.

### Easiest daily use — the check-on-open launcher
Instead of running commands, use **`.\open.ps1`**. Open it once a day and it will, at most once per day:

1. **Check every source** (`check-sources.mjs`) for new data — and do nothing expensive if nothing changed.
2. If something changed, **refresh** all feeds and regenerate the AI Brief.
3. **Verify the Brief two ways** before it can ever be published:
   - `verify-brief.mjs` — deterministic: confirms **every figure in the Brief traces to a real value in the feeds** (catches any ungrounded/hallucinated number).
   - `pressure-test.mjs` — an adversarial AI audit that flags unsupported claims, unwarranted causation, overstated certainty, or investment advice.
4. **Open the dashboard.**

```powershell
.\open.ps1            # check-on-open (once/day), refresh only if a source changed, local only
.\open.ps1 -Force     # refresh now regardless of the day / source check
.\open.ps1 -Publish   # also commit + push — ONLY if both verifiers pass
```

**Publishing is earned, not automatic.** `-Publish` commits and pushes the rebuilt dashboard *only when both verifiers pass*; otherwise it refreshes locally and leaves the verifier reports (`data/processed/brief-verify.json`, `brief-audit.json`) for review. Both API keys stay on your machine — the Anthropic key DPAPI-encrypted (see `run.ps1`'s header for the one-time setup), the Census key as a user env var — and neither is ever seen by the coding assistant.

### Fully hands-off (optional) — daily scheduled task
To run the check-on-open flow automatically each morning, register a Windows Scheduled Task that runs the launcher (adjust the path). Add `-Publish` only once you trust the verifiers:

```bash
schtasks /Create /SC DAILY /TN "UrbanUpdate-Daily" /TR "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\Calvin\\Documents\\Claude\\Projects\\PMOS\\Urban Update\\open.ps1\"" /ST 07:00
```

This is off by default. You can also run just the checks by hand: `node src/check-sources.mjs` (freshness) or `node src/verify-brief.mjs` (grounding).

## Layout
```
src/lib/socrata.mjs     source registry + Socrata fetch helper (single source of truth for dataset IDs)
src/lib/census.mjs      Census ACS fetch helper + variable registry (needs CENSUS_API_KEY)
src/pipeline.mjs        Development feed   → data/processed/development.json
src/transactions.mjs    Transactions feed  → transactions.json
src/risk.mjs            Risk feed          → risk.json
src/ll97.mjs            Local Law 97 feed  → ll97.json
src/capital.mjs         Capital feed (FRED, keyless) → capital.json
src/demand.mjs          Demand & Affordability feed (Census, needs key) → demand.json
src/crosssignal.mjs     Cross-Signal join (+ affordability overlay) → crosssignal.json
src/narrate.mjs         AI Brief (needs key)→ narratives.json  (exports buildEvidence/loadFeeds)
src/build-dashboard.mjs render all feeds   → dashboard/index.html
src/refresh.mjs         runs all 9 build steps in order
src/check-sources.mjs   freshness gate — is any source newer than our last pull? → source-check.json
src/verify-brief.mjs    deterministic Brief grounding verifier → brief-verify.json
src/pressure-test.mjs   adversarial AI audit of the Brief (needs key) → brief-audit.json
open.ps1                check-on-open launcher: check → refresh → verify → (gated) publish → open
run.ps1                 manual launcher: decrypt key, full refresh, open dashboard
```

## What each figure means
- **Filings** — New Building job applications filed with DOB that month.
- **vs. 12-mo avg** — deviation from the trailing-12-month average (trend baseline).
- **YoY** — vs. the same month one year earlier (seasonality-clean).
- **Regime** — Elevated / Cooling / In range, driven by whichever comparison is more extreme (±25%).
- **verify ↗** — opens the exact DOB records behind that number.

See [SOURCES.md](SOURCES.md) for the pinned dataset and [DECISIONS.md](DECISIONS.md) for why it's built this way.
