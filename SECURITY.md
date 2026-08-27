# Security Policy

Urban Update is a static, public research dashboard generated from public data.
It has no backend, no user accounts, and collects no visitor data. The threat
model is therefore narrow — mainly (1) keeping API keys out of the public repo
and (2) making sure the self-contained dashboard can't be turned into an XSS
vector by hostile values in a public dataset.

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than opening a public
issue:

- Preferred: open a [GitHub Security Advisory](https://github.com/cajiang/urban-update/security/advisories/new) on the repository.
- Or email the maintainer at the address on the GitHub profile.

Please include steps to reproduce and, if relevant, the affected file or data
source. Expect an initial response within a few days; this is a personal
portfolio project maintained on a best-effort basis.

## Secret handling

No secret is ever committed, logged, or placed in a URL query string.

- **`ANTHROPIC_API_KEY`** (used only to generate the AI Brief) is read from the
  environment at runtime and used in-process for a single HTTPS call. On the
  maintainer's machine it is stored DPAPI-encrypted at rest (per-user,
  per-machine) and decrypted into the process only when the refresh runs. It is
  never written to disk in plaintext, never printed, and never handled by any
  coding assistant.
- **`CENSUS_API_KEY`** (a free, low-sensitivity rate token) is read from the
  environment only. It is never embedded in the request URL that gets logged.
- `.gitignore` excludes `.env`, `.env.*`, `*.local`, and `secrets.json`. The
  only key-shaped string in the repo is a documented placeholder.
- The GitHub Pages deploy workflow is **keyless** — it only publishes the
  already-built, already-verified dashboard artifact; it holds no secrets.

## Dashboard hardening (XSS / CSP)

The dashboard inlines source JSON and AI output into a single HTML file. To keep
hostile free-text values (e.g. a DOB filing description, a DOF address, or model
output) from breaking out into executable markup:

- All inlined JSON is escaped so `<` becomes `<` and the U+2028/U+2029 line
  separators are neutralized — a `</script>` sequence in the data cannot close
  the script element.
- Free-text fields rendered into the DOM are HTML-escaped (`&`, `<`).
- A strict `Content-Security-Policy` meta tag is emitted with a per-build nonce:
  `default-src 'none'; script-src 'nonce-…'`. There are **no** inline event
  handlers and `'unsafe-inline'` is not used for scripts, so an injected inline
  handler would be blocked by the browser.

## Data integrity / publishing

Publishing is gated: the dashboard is committed and pushed only when both Brief
verifiers pass — a deterministic grounding check (every figure traces to the
evidence packet) and an adversarial AI audit (bound by SHA-256 to the exact
Brief reviewed, so a stale pass can't be reused). A source whose freshness can't
be verified is treated as unknown and blocks publishing (fail-closed).
