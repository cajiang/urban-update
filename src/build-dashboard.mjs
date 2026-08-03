// Urban Update — dashboard builder.
// Reads data/processed/development.json and writes a self-contained
// dashboard/index.html (data inlined; opens in any browser, no server).
//
// Run: node src/build-dashboard.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN = join(__dirname, '..', 'data', 'processed', 'development.json');
const OUT = join(__dirname, '..', 'dashboard', 'index.html');

const data = JSON.parse(await readFile(IN, 'utf8'));

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Urban Update — NYC Development Feed</title>
<style>
  :root{
    --ink:#14171f; --ink-2:#3a4150; --muted:#6b7280; --line:#e6e8ec;
    --bg:#f6f7f9; --card:#ffffff; --accent:#1c4e80;
    --elev:#b7791f; --elev-bg:#fdf3e2; --cool:#1c6ea4; --cool-bg:#e8f2f9;
    --range:#6b7280; --range-bg:#f0f1f3;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.5;-webkit-font-smoothing:antialiased}
  .num{font-variant-numeric:tabular-nums}
  a{color:var(--accent);text-decoration:none}
  a:hover{text-decoration:underline}
  .wrap{max-width:1080px;margin:0 auto;padding:0 24px}

  /* masthead */
  header.mast{background:var(--ink);color:#fff;padding:22px 0}
  .mast .wrap{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px}
  .brand{font-weight:700;letter-spacing:.14em;font-size:15px}
  .brand span{opacity:.6;font-weight:500}
  .asof{font-size:12.5px;opacity:.75}

  section{padding:28px 0;border-bottom:1px solid var(--line)}
  .eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}

  /* headline */
  .headline{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px 24px}
  .headline .lead{font-size:20px;line-height:1.4;margin:0;color:var(--ink)}
  .verify{font-size:12px}

  /* chips */
  .chip{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.03em;
    padding:3px 9px;border-radius:999px;vertical-align:middle}
  .chip.elevated{color:var(--elev);background:var(--elev-bg)}
  .chip.cooling{color:var(--cool);background:var(--cool-bg)}
  .chip.range{color:var(--range);background:var(--range-bg)}

  /* KPI row */
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
  .kpi .label{font-size:12px;color:var(--muted);margin-bottom:8px}
  .kpi .big{font-size:30px;font-weight:700;letter-spacing:-.01em}
  .kpi .sub{font-size:12.5px;color:var(--ink-2);margin-top:4px}
  .up{color:var(--elev)} .down{color:var(--cool)}

  /* borough grid */
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;
    display:flex;flex-direction:column;gap:10px}
  .card .top{display:flex;justify-content:space-between;align-items:center}
  .card .name{font-weight:650;font-size:15px}
  .card .big{font-size:26px;font-weight:700}
  .card .big small{font-size:13px;font-weight:500;color:var(--muted)}
  .deltas{display:flex;gap:16px;font-size:12.5px;color:var(--ink-2)}
  .deltas b{font-weight:600}
  .spark{width:100%;height:40px;display:block}
  .cardfoot{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted)}

  /* table */
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
  td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .desc{color:var(--ink-2);font-size:12.5px}

  /* method */
  .method{font-size:13px;color:var(--ink-2)}
  .method h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
  .method .row{margin-bottom:12px}
  .foot{font-size:12px;color:var(--muted);padding:22px 0 40px}

  /* provenance */
  .prov{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  .prov .box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .prov .k{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
  .prov .v{font-size:14px;color:var(--ink);font-weight:600}
  .prov .v small{display:block;font-weight:400;color:var(--ink-2);font-size:12px;margin-top:3px}
  .badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
    color:#166534;background:#e7f6ec;border:1px solid #bfe6cb;border-radius:5px;padding:2px 6px;margin-left:6px}
  .fresh-ok{color:#166534} .fresh-stale{color:#b7791f}

  /* clickable cards + drill-down modal */
  .card.click{cursor:pointer;transition:transform .08s ease,box-shadow .12s ease,border-color .12s ease}
  .card.click:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(20,23,31,.08);border-color:#cfd3da}
  .card .hint{font-size:11.5px;color:var(--accent);font-weight:600;margin-top:2px}
  .modal-ov{position:fixed;inset:0;background:rgba(20,23,31,.5);display:none;align-items:flex-start;
    justify-content:center;padding:40px 16px;z-index:50;overflow:auto}
  .modal-ov.open{display:flex}
  .modal{background:var(--card);border-radius:14px;max-width:860px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  .modal .mhead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:20px 22px;
    border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--card);border-radius:14px 14px 0 0}
  .modal .mtitle{font-size:18px;font-weight:700}
  .modal .msub{font-size:12.5px;color:var(--muted);margin-top:3px}
  .modal .close{border:none;background:var(--range-bg);width:30px;height:30px;border-radius:8px;
    cursor:pointer;font-size:15px;color:var(--ink-2);flex:none}
  .modal .close:hover{background:#e4e6ea}
  .modal .mbody{padding:6px 22px 20px}
  .modal td.nn{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}

  @media(max-width:820px){.kpis{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr 1fr}.prov{grid-template-columns:1fr 1fr}}
  @media(max-width:560px){.grid{grid-template-columns:1fr}.mast .wrap{flex-direction:column}}
</style>
</head>
<body>
<header class="mast"><div class="wrap">
  <div class="brand">URBAN&nbsp;UPDATE <span>· NYC Real Estate Intelligence</span></div>
  <div class="asof" id="asof"></div>
</div></header>

<main>
  <section><div class="wrap">
    <p class="eyebrow">Development Feed · Regime Call</p>
    <div class="headline">
      <p class="lead" id="headline"></p>
      <p class="verify" id="headline-verify"></p>
    </div>
  </div></section>

  <section><div class="wrap">
    <p class="eyebrow">Citywide · New Building filings</p>
    <div class="kpis" id="kpis"></div>
    <p class="verify" id="city-line" style="margin-top:14px;color:var(--ink-2);font-size:13.5px"></p>
  </div></section>

  <section><div class="wrap">
    <p class="eyebrow">By Borough · <span id="latest-lbl"></span> · <span style="color:var(--accent)">click any borough to drill into neighborhoods</span></p>
    <div class="grid" id="boroughs"></div>
  </div></section>

  <!-- neighborhood drill-down modal -->
  <div class="modal-ov" id="ov"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <div class="mhead">
      <div><div class="mtitle" id="m-title"></div><div class="msub" id="m-sub"></div></div>
      <button class="close" id="m-close" aria-label="Close">✕</button>
    </div>
    <div class="mbody"><table><thead><tr>
      <th>Neighborhood</th><th class="n">Filings</th><th class="n">Units</th>
      <th class="n">12-mo avg</th><th class="n">YoY</th><th>Signal</th><th></th>
    </tr></thead><tbody id="m-rows"></tbody></table></div>
  </div></div>

  <section><div class="wrap">
    <p class="eyebrow">Largest New Building filings this period</p>
    <table><thead><tr>
      <th>Address</th><th>Borough</th><th class="n">Units</th><th class="n">Stories</th><th>Project</th>
    </tr></thead><tbody id="notable"></tbody></table>
  </div></section>

  <section><div class="wrap method">
    <p class="eyebrow">Methodology &amp; Evidence</p>
    <div class="row"><h3>Source</h3><span id="m-source"></span></div>
    <div class="row"><h3>Baseline</h3><span id="m-baseline"></span></div>
    <div class="row"><h3>Regime threshold</h3><span id="m-threshold"></span></div>
    <div class="row"><h3>Facts vs. inference</h3><span id="m-note"></span></div>
  </div></section>

  <section><div class="wrap">
    <p class="eyebrow">Data Provenance &amp; Freshness</p>
    <div class="prov" id="prov"></div>
  </div></section>

  <div class="wrap foot" id="foot"></div>
</main>

<script>
const DATA = ${JSON.stringify(data)};

const fmt = (n) => Number(n||0).toLocaleString('en-US');
const pct = (x) => x==null ? '—' : (x>=0?'+':'') + Math.round(x*100) + '%';
const cls = (r) => r==='Elevated'?'elevated':r==='Cooling'?'cooling':'range';
const arrow = (x) => x==null?'':(x>=0?'▲':'▼');
const upd = (x) => x==null?'':(x>=0?'up':'down');

function sparkline(series){
  const vals = series.map(p=>p.filings);
  const w=180,h=40,pad=3;
  const mn=Math.min(...vals),mx=Math.max(...vals),rng=(mx-mn)||1;
  const x=(i)=>pad+i*((w-2*pad)/(series.length-1));
  const y=(v)=>h-pad-((v-mn)/rng)*(h-2*pad);
  const pts=series.map((p,i)=>x(i)+','+y(p.filings).toFixed(1)).join(' ');
  const area='0,'+h+' '+pts.replace(/,/g,'@').split(' ').map(s=>s.replace('@',',')).join(' ')+' '+w+','+h;
  return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'
    + '<polyline points="'+pts+' '+w+','+y(vals[vals.length-1]).toFixed(1)+'" fill="none" stroke="#1c4e80" stroke-width="1.6"/>'
    + '<polygon points="'+pts+' '+w+','+h+' '+pad+','+h+'" fill="#1c4e80" opacity="0.07"/>'
    + '</svg>';
}

// masthead / labels
document.getElementById('asof').textContent =
  'As of '+DATA.meta.latestMonthLabel+' · Source: '+DATA.meta.source.label;
document.getElementById('latest-lbl').textContent = DATA.meta.latestMonthLabel;

// headline
const hb = DATA.narration.headline;
const reg = DATA.boroughs.slice().sort((a,b)=>Math.abs(b.dominant.v)-Math.abs(a.dominant.v))[0];
document.getElementById('headline').innerHTML =
  hb.replace(/Signal: (Elevated|Cooling|In range)\\./,
    (m,g)=>'Signal: <span class="chip '+cls(g)+'">'+g+'</span>');
document.getElementById('headline-verify').innerHTML =
  '<a href="'+reg.evidenceUrl+'" target="_blank" rel="noopener">Verify these filings in the DOB dataset ↗</a>';

// KPIs
const c = DATA.citywide;
const elevated = DATA.boroughs.filter(b=>b.regime==='Elevated').length;
const kpis = [
  {label:'Filings — '+DATA.meta.latestMonthLabel, big:fmt(c.latest.filings),
   sub:'<span class="'+upd(c.yoy)+'">'+arrow(c.yoy)+' '+pct(c.yoy)+' YoY</span> · '+pct(c.deviation)+' vs. 12-mo avg'},
  {label:'Proposed dwelling units', big:fmt(c.latest.units), sub:'across all New Building filings'},
  {label:'Boroughs flagged Elevated', big:elevated+' / 5', sub:'dominant signal ≥ +25%'},
  {label:'Full-demolition filings', big:fmt(DATA.demolitions.latest.filings),
   sub:'redevelopment signal · '+DATA.demolitions.regime},
];
document.getElementById('kpis').innerHTML = kpis.map(k=>
  '<div class="kpi"><div class="label">'+k.label+'</div>'
  +'<div class="big num">'+k.big+'</div><div class="sub">'+k.sub+'</div></div>').join('');
document.getElementById('city-line').textContent = DATA.narration.citySummary;

// borough cards (clickable → neighborhood drill-down)
document.getElementById('boroughs').innerHTML = DATA.boroughs.map((b,i)=>
  '<div class="card click" data-i="'+i+'"><div class="top"><span class="name">'+b.name+'</span>'
  +'<span class="chip '+cls(b.regime)+'">'+b.regime+'</span></div>'
  +'<div class="big num">'+fmt(b.latest.filings)+' <small>filings</small></div>'
  +'<div class="deltas"><span><b class="'+upd(b.yoy)+'">'+arrow(b.yoy)+' '+pct(b.yoy)+'</b> YoY</span>'
  +'<span><b>'+pct(b.deviation)+'</b> vs 12-mo avg</span></div>'
  +sparkline(b.spark)
  +'<div class="cardfoot"><span class="num">'+fmt(b.latest.units)+' units proposed</span>'
  +'<a href="'+b.evidenceUrl+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">verify ↗</a></div>'
  +'<div class="hint">View '+b.neighborhoodCount+' neighborhoods →</div></div>').join('');
document.querySelectorAll('.card.click').forEach(el=>
  el.addEventListener('click',()=>openBorough(+el.dataset.i)));

// neighborhood drill-down
function openBorough(i){
  const b = DATA.boroughs[i];
  document.getElementById('m-title').textContent = b.name + ' — Neighborhoods';
  document.getElementById('m-sub').textContent =
    b.neighborhoodCount + ' neighborhoods with New Building filings in '
    + DATA.meta.latestMonthLabel + ' · ranked by filings · every row verifiable';
  document.getElementById('m-rows').innerHTML = b.neighborhoods.map(n=>
    '<tr><td>'+n.nta+'</td>'
    +'<td class="nn">'+fmt(n.filings)+'</td>'
    +'<td class="nn">'+fmt(n.units)+'</td>'
    +'<td class="nn">'+n.baseline.toFixed(1)+'</td>'
    +'<td class="nn '+(n.yoyFilings>=3?upd(n.yoy):'')+'">'+(n.yoyFilings>=3&&n.yoy!=null?pct(n.yoy):'—')+'</td>'
    +'<td><span class="chip '+cls(n.regime)+'">'+n.regime+'</span></td>'
    +'<td><a href="'+n.evidenceUrl+'" target="_blank" rel="noopener">verify ↗</a></td></tr>').join('');
  document.getElementById('ov').classList.add('open');
}
const closeModal = () => document.getElementById('ov').classList.remove('open');
document.getElementById('m-close').addEventListener('click', closeModal);
document.getElementById('ov').addEventListener('click', e=>{ if(e.target.id==='ov') closeModal(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

// notable table
document.getElementById('notable').innerHTML = DATA.notable.map(n=>
  '<tr><td>'+(n.address||'—')+'</td><td>'+n.borough+'</td>'
  +'<td class="n">'+fmt(n.units)+'</td><td class="n">'+(n.stories||'—')+'</td>'
  +'<td class="desc">'+(n.description||'').replace(/</g,'&lt;').slice(0,70)+'</td></tr>').join('');

// methodology
document.getElementById('m-source').innerHTML =
  DATA.meta.source.label+' (NYC Open Data, dataset <code>'+DATA.meta.source.datasetId+'</code>). '
  +'<a href="'+DATA.meta.source.landing+'" target="_blank" rel="noopener">Dataset home ↗</a>';
document.getElementById('m-baseline').textContent = DATA.meta.method.baseline;
document.getElementById('m-threshold').textContent = DATA.meta.method.threshold
  + ' The dominant signal is whichever of the two comparisons (trailing-12-month vs. year-over-year) is more extreme; both are always shown.';
document.getElementById('m-note').textContent = DATA.meta.method.note;

// provenance & freshness
const S = DATA.meta.source;
const dateOnly = (iso) => iso ? new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}) : '—';
const pulledAt = new Date(DATA.meta.generatedAt);
const srcAt = S.dataUpdatedAt ? new Date(S.dataUpdatedAt) : null;
const staleDays = srcAt ? Math.round((pulledAt - srcAt)/86400000) : null;
const freshClass = (staleDays!=null && staleDays<=2) ? 'fresh-ok' : 'fresh-stale';
const officialBadge = (S.provenance==='official') ? '<span class="badge">Official</span>' : '';
document.getElementById('prov').innerHTML = [
  {k:'Publisher', v:(S.publisher||'—')+officialBadge, s:'Primary system of record — NYC Open Data'},
  {k:'Source dataset', v:S.label, s:'Dataset ID '+S.datasetId},
  {k:'Source update frequency', v:(S.updateFrequency||'—'), s:'Last DOB refresh: '+dateOnly(S.dataUpdatedAt)},
  {k:'This dashboard', v:'<span class="'+freshClass+'">Data pulled '+dateOnly(DATA.meta.generatedAt)+'</span>',
   s: staleDays==null?'':(staleDays<=2?'Current with source':staleDays+' days behind source — re-run pipeline')},
].map(b=>'<div class="box"><div class="k">'+b.k+'</div><div class="v">'+b.v+'<small>'+b.s+'</small></div></div>').join('');
document.getElementById('foot').innerHTML =
  'Generated '+new Date(DATA.meta.generatedAt).toLocaleString('en-US')
  +' · Urban Update — Development Feed (v1). Every figure is a computed fact from primary DOB filings; '
  +'click any “verify” link to inspect the underlying records.';
</script>
</body>
</html>`;

await writeFile(OUT, html);
console.log(`Wrote ${OUT} (${(html.length/1024).toFixed(1)} KB)`);
