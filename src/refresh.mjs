// Urban Update — one-shot refresh: re-pull live data, then rebuild the dashboard.
// Run: node src/refresh.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
for (const step of ['pipeline.mjs', 'transactions.mjs', 'risk.mjs', 'crosssignal.mjs', 'build-dashboard.mjs']) {
  console.log(`\n▶ ${step}`);
  const r = spawnSync(process.execPath, [join(here, step)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log('\n✓ Refresh complete — open dashboard/index.html');
