// Urban Update — Brief pressure-test (adversarial AI audit).
//
// A second, skeptical model reads the generated Brief AND the exact evidence
// packet it was built from, and tries to break it: every figure that isn't in the
// data, every claim the data doesn't support, every causal leap without a matched
// control, any investment advice, any overstated certainty. It's the AI analogue
// of the deterministic verifier — defense in depth on the evidence standard before
// anything auto-publishes.
//
// Uses the same zero-dependency raw-fetch pattern as narrate.mjs. Requires
// ANTHROPIC_API_KEY (user-run; the key never touches the coding assistant). Skips
// gracefully if the key or the Brief is absent. Writes data/processed/brief-audit.json.
// Exit code: 0 = pass (or skipped/couldn't-run) · 4 = revise (issues found).
//
// Run: node src/pressure-test.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { loadFeeds, buildEvidence } from './narrate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, '..', 'data', 'processed');
const OUT = join(dir, 'brief-audit.json');

const MODEL = 'claude-opus-5';
const API = 'https://api.anthropic.com/v1/messages';

const SYSTEM = `You are an adversarial fact-checker auditing a daily NYC real-estate "Brief" before it is published. You are the last line of defense for an evidence standard: no claim ships unless the provided DATA supports it.

You receive the BRIEF (headline, summary, insights, neighborhood spotlights) and the DATA packet it was supposed to be built from. Assume nothing outside DATA is known. Hunt for problems:
- UNGROUNDED FIGURE: a number in the BRIEF that does not appear in DATA (allowing for rounding and unit changes like $759M for 759 or +58% for 58).
- UNSUPPORTED CLAIM: an assertion the DATA does not substantiate, or that overstates what the DATA shows.
- UNWARRANTED CAUSATION: asserting that one thing caused another without a matched-control comparison (association is fine only if labeled as such).
- OVERSTATED CERTAINTY: presenting an estimate, correlation, or lagged/period-average figure as a hard current fact.
- INVESTMENT ADVICE: any suggestion to buy, sell, hold, or that something is a good/bad investment.
- MISATTRIBUTION: crediting a figure to the wrong feed/period, or mixing periods misleadingly.

Be precise and quote the offending text. Do NOT invent problems — if the BRIEF is well grounded and appropriately hedged, say so and return an empty issues list. Judge only against DATA; do not use outside knowledge to "correct" figures. Verdict is "revise" if there is any high-severity issue (ungrounded figure, unsupported claim, causation, or advice), otherwise "pass".`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'revise'] },
    overall: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          type: { type: 'string' },
          location: { type: 'string' },
          quote: { type: 'string' },
          problem: { type: 'string' },
        },
        required: ['severity', 'type', 'quote', 'problem'],
      },
    },
  },
  required: ['verdict', 'overall', 'issues'],
};

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.log('ANTHROPIC_API_KEY not set — skipping pressure-test (no audit produced).'); process.exit(0); }

  let brief;
  try { brief = JSON.parse(await readFile(join(dir, 'narratives.json'), 'utf8')); }
  catch { console.log('No narratives.json to audit — skipping.'); process.exit(0); }

  const feeds = await loadFeeds();
  const packet = buildEvidence(feeds.dev, feeds.tx, feeds.risk, feeds.ll97, feeds.cross, feeds.capital, feeds.demand);

  // Hand the model the deterministic verifier's findings too, if present.
  let priorFlags = null;
  try { const v = JSON.parse(await readFile(join(dir, 'brief-verify.json'), 'utf8')); priorFlags = v.ungrounded; } catch { /* optional */ }

  const briefForAudit = { headline: brief.headline, summary: brief.summary, insights: brief.insights, neighborhoods: brief.neighborhoods };

  console.log(`Pressure-testing the Brief with ${MODEL}…`);
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Audit this BRIEF against its DATA. Flag every ungrounded figure, unsupported claim, unwarranted causation, overstated certainty, or investment advice; otherwise return an empty issues list and verdict "pass".\n\n`
          + (priorFlags && priorFlags.length ? `A deterministic checker already flagged these figures as not tracing to DATA: ${JSON.stringify(priorFlags)}. Confirm and explain each.\n\n` : '')
          + `BRIEF:\n${JSON.stringify(briefForAudit, null, 2)}\n\nDATA:\n${JSON.stringify(packet, null, 2)}`,
      }],
    }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    const hint = res.status === 401 ? ' → key invalid/rejected.' : res.status === 429 ? ' → rate limited; retry later.' : (res.status >= 500 ? ' → Anthropic service error; retry later.' : '');
    console.error(`Claude API ${res.status}${hint}\n${body}`);
    console.error('Skipping pressure-test — no audit produced (build continues).');
    process.exit(0);   // don't block the pipeline on an audit that couldn't run
  }
  const data = await res.json();
  const text = (data.content || []).find((b) => b.type === 'text');
  if (!text) { console.error('No text block in audit response; skipping.'); process.exit(0); }
  const parsed = JSON.parse(text.text);

  const out = {
    generatedAt: new Date().toISOString(),
    model: data.model || MODEL,
    briefGeneratedAt: brief.meta && brief.meta.generatedAt,
    auditor: 'adversarial fact-check vs. evidence packet',
    ...parsed,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2));

  const high = out.issues.filter((i) => i.severity === 'high').length;
  console.log(`Pressure-test verdict: ${out.verdict.toUpperCase()} — ${out.issues.length} issue(s) (${high} high). ${out.overall}`);
  for (const i of out.issues) console.log(`   • [${i.severity}] ${i.type} — ${i.quote}\n     ${i.problem}`);
  console.log(`Wrote ${OUT}`);
  process.exit(out.verdict === 'revise' ? 4 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(0); });   // never hard-fail the pipeline on the audit
}
