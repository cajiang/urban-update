// Urban Update — dashboard builder (multi-feed, tabbed).
// Reads data/processed/development.json + transactions.json and writes a
// self-contained dashboard/index.html (data inlined; opens in any browser).
//
// Run: node src/build-dashboard.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, '..', 'data', 'processed');
const OUT = join(__dirname, '..', 'dashboard', 'index.html');

const dev = JSON.parse(await readFile(join(dir, 'development.json'), 'utf8'));
const tx = JSON.parse(await readFile(join(dir, 'transactions.json'), 'utf8'));
const cross = JSON.parse(await readFile(join(dir, 'crosssignal.json'), 'utf8'));

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Urban Update — NYC Real Estate Intelligence</title>
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
  a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
  .wrap{max-width:1080px;margin:0 auto;padding:0 24px}

  header.mast{background:var(--ink);color:#fff;padding:22px 0 0}
  .mast .top{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px}
  .brand{font-weight:700;letter-spacing:.14em;font-size:15px}
  .brand span{opacity:.6;font-weight:500}
  .asof{font-size:12.5px;opacity:.75}
  .tabs{display:flex;gap:4px;margin-top:16px}
  .tab{background:none;border:none;color:#c9ccd3;font-size:13.5px;font-weight:600;letter-spacing:.02em;
    padding:10px 16px;cursor:pointer;border-bottom:2px solid transparent}
  .tab:hover{color:#fff}
  .tab.active{color:#fff;border-bottom-color:#fff}

  .panel{display:none} .panel.active{display:block}
  section{padding:28px 0;border-bottom:1px solid var(--line)}
  .eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}

  .headline{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px 24px}
  .headline .lead{font-size:20px;line-height:1.4;margin:0}
  .verify{font-size:12px}

  .chip{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.03em;padding:3px 9px;border-radius:999px;vertical-align:middle}
  .chip.elevated{color:var(--elev);background:var(--elev-bg)}
  .chip.cooling{color:var(--cool);background:var(--cool-bg)}
  .chip.range{color:var(--range);background:var(--range-bg)}

  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
  .kpi .label{font-size:12px;color:var(--muted);margin-bottom:8px}
  .kpi .big{font-size:30px;font-weight:700;letter-spacing:-.01em}
  .kpi .sub{font-size:12.5px;color:var(--ink-2);margin-top:4px}
  .up{color:var(--elev)} .down{color:var(--cool)}

  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
  .card .top{display:flex;justify-content:space-between;align-items:center}
  .card .name{font-weight:650;font-size:15px}
  .card .big{font-size:26px;font-weight:700}
  .card .big small{font-size:13px;font-weight:500;color:var(--muted)}
  .deltas{display:flex;gap:16px;font-size:12.5px;color:var(--ink-2)}
  .deltas b{font-weight:600}
  .spark{width:100%;height:40px;display:block}
  .cardfoot{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted)}
  .card.click{cursor:pointer;transition:transform .08s ease,box-shadow .12s ease,border-color .12s ease}
  .card.click:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(20,23,31,.08);border-color:#cfd3da}
  .card .hint{font-size:11.5px;color:var(--accent);font-weight:600;margin-top:2px}

  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
  td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .desc{color:var(--ink-2);font-size:12.5px}

  .prov{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  .prov .box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .prov .k{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
  .prov .v{font-size:14px;color:var(--ink);font-weight:600}
  .prov .v small{display:block;font-weight:400;color:var(--ink-2);font-size:12px;margin-top:3px}
  .badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#166534;background:#e7f6ec;border:1px solid #bfe6cb;border-radius:5px;padding:2px 6px;margin-left:6px}
  .fresh-ok{color:#166534} .fresh-stale{color:#b7791f}

  .xsig{font-size:13px;color:var(--ink-2);display:flex;gap:8px;align-items:baseline}
  .xsig b{color:var(--ink);font-weight:600;width:58px;display:inline-block}
  .xintro{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;font-size:14px;color:var(--ink-2)}
  .xintro b{color:var(--ink)}
  .quad{display:inline-block;font-weight:600}
  .method{font-size:13px;color:var(--ink-2)}
  .method h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
  .method .row{margin-bottom:12px}
  .foot{font-size:12px;color:var(--muted);padding:22px 0 40px}

  .modal-ov{position:fixed;inset:0;background:rgba(20,23,31,.5);display:none;align-items:flex-start;justify-content:center;padding:40px 16px;z-index:50;overflow:auto}
  .modal-ov.open{display:flex}
  .modal{background:var(--card);border-radius:14px;max-width:860px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  .modal .mhead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:20px 22px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--card);border-radius:14px 14px 0 0}
  .modal .mtitle{font-size:18px;font-weight:700}
  .modal .msub{font-size:12.5px;color:var(--muted);margin-top:3px}
  .modal .close{border:none;background:var(--range-bg);width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px;color:var(--ink-2);flex:none}
  .modal .close:hover{background:#e4e6ea}
  .modal .mbody{padding:6px 22px 20px}
  .modal td.nn{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}

  @media(max-width:820px){.kpis,.prov{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr 1fr}}
  @media(max-width:560px){.grid{grid-template-columns:1fr}.mast .top{flex-direction:column}}
</style>
</head>
<body>
<header class="mast"><div class="wrap">
  <div class="top">
    <div class="brand">URBAN&nbsp;UPDATE <span>· NYC Real Estate Intelligence</span></div>
    <div class="asof" id="asof"></div>
  </div>
  <div class="tabs">
    <button class="tab active" data-tab="dev">Development</button>
    <button class="tab" data-tab="tx">Transactions</button>
    <button class="tab" data-tab="cross">Cross-Signal</button>
  </div>
</div></header>

<main>
  <div class="panel active" id="panel-dev"></div>
  <div class="panel" id="panel-tx"></div>
  <div class="panel" id="panel-cross"></div>

  <div class="modal-ov" id="ov"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <div class="mhead"><div><div class="mtitle" id="m-title"></div><div class="msub" id="m-sub"></div></div>
      <button class="close" id="m-close" aria-label="Close">✕</button></div>
    <div class="mbody"><table><thead id="m-head"></thead><tbody id="m-rows"></tbody></table></div>
  </div></div>
</main>

<script>
const DEV = ${JSON.stringify(dev)};
const TX  = ${JSON.stringify(tx)};
const CROSS = ${JSON.stringify(cross)};

const fmt = (n) => Number(n||0).toLocaleString('en-US');
const pct = (x) => x==null ? '—' : (x>=0?'+':'') + Math.round(x*100) + '%';
const cls = (r) => r==='Elevated'?'elevated':r==='Cooling'?'cooling':'range';
const arrow = (x) => x==null?'':(x>=0?'▲':'▼');
const upd = (x) => x==null?'':(x>=0?'up':'down');
const dateOnly = (iso) => iso ? new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}) : '—';
const money = (n) => '$'+fmt(Math.round(n));

function sparkline(series, key){
  const vals = series.map(p=>p[key]||0);
  const w=180,h=40,pad=3, mn=Math.min(...vals),mx=Math.max(...vals),rng=(mx-mn)||1;
  const x=(i)=>pad+i*((w-2*pad)/(series.length-1)), y=(v)=>h-pad-((v-mn)/rng)*(h-2*pad);
  const pts=series.map((p,i)=>x(i)+','+y(p[key]||0).toFixed(1)).join(' ');
  return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'
    +'<polyline points="'+pts+'" fill="none" stroke="#1c4e80" stroke-width="1.6"/>'
    +'<polygon points="'+pts+' '+w+','+h+' '+pad+','+h+'" fill="#1c4e80" opacity="0.07"/></svg>';
}

function section(eyebrow, inner){ return '<section><div class="wrap"><p class="eyebrow">'+eyebrow+'</p>'+inner+'</div></section>'; }

function provenanceBoxes(sources, generatedAt, lagNote){
  const arr = Array.isArray(sources)?sources:[sources];
  const primary = arr[0];
  const off = (primary.provenance==='official')?'<span class="badge">Official</span>':'';
  const boxes = [
    {k:'Publisher', v:(primary.publisher||primary.attribution||'—')+off, s:'Primary system of record — NYC Open Data'},
  ];
  arr.forEach(s=>boxes.push({k:'Source dataset', v:s.label,
    s:'ID '+s.datasetId+' · '+(s.updateFrequency||'—')+' · updated '+dateOnly(s.dataUpdatedAt)}));
  boxes.push({k:'This dashboard', v:'<span class="fresh-ok">Data pulled '+dateOnly(generatedAt)+'</span>', s:lagNote||'Pulled live from source on each build'});
  return '<div class="prov">'+boxes.slice(0,4).map(b=>'<div class="box"><div class="k">'+b.k+'</div><div class="v">'+b.v+'<small>'+b.s+'</small></div></div>').join('')+'</div>';
}

function methodBlock(m, sourceLine){
  const rows = [['Source',sourceLine],['Baseline',m.baseline],['Regime threshold',m.threshold]];
  if(m.lag) rows.push(['Reporting lag',m.lag]);
  rows.push(['Facts vs. inference',m.note]);
  return '<div class="method">'+rows.map(r=>'<div class="row"><h3>'+r[0]+'</h3><span>'+r[1]+'</span></div>').join('')+'</div>';
}

// ---------- Development panel ----------
function renderDev(){
  const D=DEV, c=D.citywide, elevated=D.boroughs.filter(b=>b.regime==='Elevated').length;
  const reg=D.boroughs.slice().sort((a,b)=>Math.abs(b.dominant.v)-Math.abs(a.dominant.v))[0];
  let h='';
  h+=section('Development Feed · Regime Call',
    '<div class="headline"><p class="lead">'+D.narration.headline.replace(/Signal: (Elevated|Cooling|In range)\\./,(m,g)=>'Signal: <span class="chip '+cls(g)+'">'+g+'</span>')+'</p>'
    +'<p class="verify"><a href="'+reg.evidenceUrl+'" target="_blank" rel="noopener">Verify these filings in the DOB dataset ↗</a></p></div>');

  const kpis=[
    {label:'Filings — '+D.meta.latestMonthLabel, big:fmt(c.latest.filings), sub:'<span class="'+upd(c.yoy)+'">'+arrow(c.yoy)+' '+pct(c.yoy)+' YoY</span> · '+pct(c.deviation)+' vs. 12-mo avg'},
    {label:'Proposed dwelling units', big:fmt(c.latest.units), sub:'across all New Building filings'},
    {label:'Boroughs flagged Elevated', big:elevated+' / 5', sub:'dominant signal ≥ +25%'},
    {label:'Full-demolition filings', big:fmt(D.demolitions.latest.filings), sub:'redevelopment signal · '+D.demolitions.regime},
  ];
  h+=section('Citywide · New Building filings',
    '<div class="kpis">'+kpis.map(k=>'<div class="kpi"><div class="label">'+k.label+'</div><div class="big num">'+k.big+'</div><div class="sub">'+k.sub+'</div></div>').join('')
    +'</div><p class="verify" style="margin-top:14px;color:var(--ink-2);font-size:13.5px">'+D.narration.citySummary+'</p>');

  h+=section('By Borough · '+D.meta.latestMonthLabel+' · <span style="color:var(--accent)">click any borough to drill into neighborhoods</span>',
    '<div class="grid">'+D.boroughs.map((b,i)=>
      '<div class="card click" data-i="'+i+'"><div class="top"><span class="name">'+b.name+'</span><span class="chip '+cls(b.regime)+'">'+b.regime+'</span></div>'
      +'<div class="big num">'+fmt(b.latest.filings)+' <small>filings</small></div>'
      +'<div class="deltas"><span><b class="'+upd(b.yoy)+'">'+arrow(b.yoy)+' '+pct(b.yoy)+'</b> YoY</span><span><b>'+pct(b.deviation)+'</b> vs 12-mo avg</span></div>'
      +sparkline(b.spark,'filings')
      +'<div class="cardfoot"><span class="num">'+fmt(b.latest.units)+' units proposed</span><a href="'+b.evidenceUrl+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">verify ↗</a></div>'
      +'<div class="hint">View '+b.neighborhoodCount+' neighborhoods →</div></div>').join('')+'</div>');

  h+=section('Largest New Building filings this period',
    '<table><thead><tr><th>Address</th><th>Borough</th><th class="n">Units</th><th class="n">Stories</th><th>Project</th></tr></thead><tbody>'
    +D.notable.map(n=>'<tr><td>'+(n.address||'—')+'</td><td>'+n.borough+'</td><td class="n">'+fmt(n.units)+'</td><td class="n">'+(n.stories||'—')+'</td><td class="desc">'+(n.description||'').replace(/</g,'&lt;').slice(0,70)+'</td></tr>').join('')
    +'</tbody></table>');

  h+=section('Data Provenance &amp; Freshness', provenanceBoxes(D.meta.source, D.meta.generatedAt, 'DOB updates daily · pulled live on each build'));
  h+=section('Methodology &amp; Evidence', methodBlock(D.meta.method, D.meta.source.label+' (NYC Open Data, dataset <code>'+D.meta.source.datasetId+'</code>). <a href="'+D.meta.source.landing+'" target="_blank" rel="noopener">Dataset home ↗</a>'));
  return h;
}

// ---------- Transactions panel ----------
function renderTx(){
  const T=TX, c=T.citywide;
  const cooling=T.boroughs.filter(b=>b.regime==='Cooling').length, elevated=T.boroughs.filter(b=>b.regime==='Elevated').length;
  const reg=T.boroughs.slice().sort((a,b)=>Math.abs(b.dominant.v)-Math.abs(a.dominant.v))[0];
  let h='';
  h+=section('Transactions Feed · Regime Call',
    '<div class="headline"><p class="lead">'+T.narration.headline.replace(/Signal: (Elevated|Cooling|In range)\\./,(m,g)=>'Signal: <span class="chip '+cls(g)+'">'+g+'</span>')+'</p>'
    +'<p class="verify"><a href="'+reg.evidenceUrl+'" target="_blank" rel="noopener">Verify these sales in the DOF dataset ↗</a></p></div>');

  const kpis=[
    {label:'Market sales — '+T.meta.latestMonthLabel, big:fmt(c.latest.sales), sub:'<span class="'+upd(c.yoy)+'">'+arrow(c.yoy)+' '+pct(c.yoy)+' YoY</span> · '+pct(c.deviation)+' vs. 12-mo avg'},
    {label:'Median sale price', big:money(c.latest.med), sub:'citywide · <span class="'+upd(c.medianYoY)+'">'+arrow(c.medianYoY)+' '+pct(c.medianYoY)+' YoY</span>'},
    {label:'Total $ volume', big:'$'+fmt(Math.round(c.latest.vol/1e9))+'B', sub:'<span class="'+upd(c.volumeYoY)+'">'+arrow(c.volumeYoY)+' '+pct(c.volumeYoY)+' YoY</span>'},
    {label:'Boroughs cooling', big:cooling+' / 5', sub:elevated+' elevated · dominant signal ±25%'},
  ];
  h+=section('Citywide · Recorded market sales',
    '<div class="kpis">'+kpis.map(k=>'<div class="kpi"><div class="label">'+k.label+'</div><div class="big num">'+k.big+'</div><div class="sub">'+k.sub+'</div></div>').join('')
    +'</div><p class="verify" style="margin-top:14px;color:var(--ink-2);font-size:13.5px">'+T.narration.citySummary+'</p>');

  h+=section('By Borough · '+T.meta.latestMonthLabel+' · <span style="color:var(--accent)">click any borough to drill into neighborhoods</span>',
    '<div class="grid">'+T.boroughs.map((b,i)=>
      '<div class="card click" data-i="'+i+'"><div class="top"><span class="name">'+b.name+'</span><span class="chip '+cls(b.regime)+'">'+b.regime+'</span></div>'
      +'<div class="big num">'+fmt(b.latest.sales)+' <small>sales</small></div>'
      +'<div class="deltas"><span><b class="'+upd(b.yoy)+'">'+arrow(b.yoy)+' '+pct(b.yoy)+'</b> YoY</span><span><b>'+pct(b.deviation)+'</b> vs 12-mo avg</span></div>'
      +sparkline(b.spark,'sales')
      +'<div class="cardfoot"><span class="num">median '+money(b.latest.med)+'</span><a href="'+b.evidenceUrl+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">verify ↗</a></div>'
      +'<div class="hint">View '+b.neighborhoodCount+' neighborhoods →</div></div>').join('')+'</div>');

  h+=section('Largest recorded sales this period',
    '<table><thead><tr><th>Address</th><th>Borough</th><th>Neighborhood</th><th class="n">Price</th><th>Type</th></tr></thead><tbody>'
    +T.notable.map(n=>'<tr><td>'+(n.address||'—')+'</td><td>'+n.borough+'</td><td class="desc">'+n.neighborhood+'</td><td class="n">'+money(n.price)+'</td><td class="desc">'+(n.type||'').replace(/</g,'&lt;').slice(0,32)+'</td></tr>').join('')
    +'</tbody></table>');

  h+=section('Data Provenance &amp; Freshness', provenanceBoxes(T.meta.sources, T.meta.generatedAt, 'DOF updates monthly · latest complete month lags ~2 mo'));
  h+=section('Methodology &amp; Evidence', methodBlock(T.meta.method, T.meta.sources.map(s=>s.label+' (<code>'+s.datasetId+'</code>)').join(' + ')+' — NYC Department of Finance.'));
  return h;
}

// ---------- Cross-Signal panel ----------
function crossChip(c){
  const map={'Supply building, demand softening':['elevated','Oversupply watch'],'Demand outpacing supply':['cooling','Tightening'],'Heating':['elevated','Heating'],'Cooling':['cooling','Cooling'],'Mixed / flat':['range','Mixed']};
  const [k,lab]=map[c]||['range',c]; return '<span class="chip '+k+'">'+lab+'</span>';
}
function xcard(z){
  return '<div class="card"><div class="top"><span class="name">'+z.zip+' · '+z.neighborhood+'</span>'+crossChip(z.cls)+'</div>'
    +'<div style="font-size:12px;color:var(--muted)">'+z.borough+'</div>'
    +'<div class="xsig"><b>Supply</b> <span class="'+upd(z.devYoY)+'">'+arrow(z.devYoY)+' '+pct(z.devYoY)+'</span> <span class="num" style="color:var(--muted)">'+fmt(z.devCur)+' filings</span></div>'
    +'<div class="xsig"><b>Demand</b> <span class="'+upd(z.txYoY)+'">'+arrow(z.txYoY)+' '+pct(z.txYoY)+'</span> <span class="num" style="color:var(--muted)">'+fmt(z.txCur)+' sales</span></div>'
    +'<div class="cardfoot"><span>verify:</span><span><a href="'+z.devEvidence+'" target="_blank" rel="noopener">filings ↗</a> &nbsp;·&nbsp; <a href="'+z.txEvidence+'" target="_blank" rel="noopener">sales ↗</a></span></div></div>';
}
function renderCross(){
  const C=CROSS, m=C.meta;
  let h='';
  h+=section('Cross-Signal · Supply vs. Demand · '+m.windowLabel,
    '<div class="xintro">This view joins <b>New Building filings</b> (supply, DOB) and <b>recorded sales</b> (demand, DOF) by property ZIP, comparing the latest quarter year-over-year. '
    +'It flags where the two <b>diverge</b> — the non-obvious signal a market report is built to catch: '
    +'<span class="quad" style="color:var(--elev)">supply building while demand softens</span> (oversupply watch), or '
    +'<span class="quad" style="color:var(--cool)">demand outpacing new supply</span> (tightening).</div>');

  const counts=C.counts||{};
  const kpis=[
    {label:'Oversupply watch', big:(counts['Supply building, demand softening']||0), sub:'supply ▲ · demand ▼'},
    {label:'Tightening', big:(counts['Demand outpacing supply']||0), sub:'demand ▲ · supply ▼'},
    {label:'Heating (both ▲)', big:(counts['Heating']||0), sub:'supply & demand rising'},
    {label:'Cooling (both ▼)', big:(counts['Cooling']||0), sub:'supply & demand falling'},
  ];
  h+=section('Divergence tally · '+C.zips.length+' qualifying ZIPs',
    '<div class="kpis">'+kpis.map(k=>'<div class="kpi"><div class="label">'+k.label+'</div><div class="big num">'+k.big+'</div><div class="sub">'+k.sub+'</div></div>').join('')+'</div>');

  if(C.oversupply.length) h+=section('Oversupply watch — supply building, demand softening',
    '<div class="grid">'+C.oversupply.map(xcard).join('')+'</div>');
  if(C.tightening.length) h+=section('Tightening — demand outpacing new supply',
    '<div class="grid">'+C.tightening.map(xcard).join('')+'</div>');

  h+=section('All qualifying ZIPs · ranked by divergence',
    '<table><thead><tr><th>ZIP</th><th>Area</th><th>Borough</th><th class="n">Supply YoY</th><th class="n">Demand YoY</th><th>Signal</th><th></th></tr></thead><tbody>'
    +C.zips.map(z=>'<tr><td class="num">'+z.zip+'</td><td class="desc">'+z.neighborhood+'</td><td>'+z.borough+'</td>'
      +'<td class="n '+upd(z.devYoY)+'">'+pct(z.devYoY)+'</td><td class="n '+upd(z.txYoY)+'">'+pct(z.txYoY)+'</td>'
      +'<td>'+crossChip(z.cls)+'</td>'
      +'<td><a href="'+z.devEvidence+'" target="_blank" rel="noopener">filings</a> · <a href="'+z.txEvidence+'" target="_blank" rel="noopener">sales</a></td></tr>').join('')
    +'</tbody></table>');

  h+=section('Data Provenance &amp; Freshness', provenanceBoxes(m.sources.map(s=>({...s,provenance:'official',publisher:'NYC Open Data (DOB + DOF)'})), m.generatedAt, 'Joins two official city feeds · quarter ending '+m.referenceMonthLabel));
  h+=section('Methodology &amp; Evidence', methodBlock({baseline:m.method.signal, threshold:m.method.threshold, note:m.method.note}, m.sources.map(s=>s.label+' (<code>'+s.datasetId+'</code>)').join(' + ')));
  return h;
}

document.getElementById('panel-dev').innerHTML = renderDev();
document.getElementById('panel-tx').innerHTML  = renderTx();
document.getElementById('panel-cross').innerHTML = renderCross();
document.getElementById('asof').textContent =
  'Development as of '+DEV.meta.latestMonthLabel+' · Transactions as of '+TX.meta.latestMonthLabel;

// tab switching
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('panel-'+t.dataset.tab).classList.add('active');
}));

// neighborhood drill-down (both feeds)
document.querySelectorAll('#panel-dev .card.click').forEach(el=>el.addEventListener('click',()=>openBorough('dev',+el.dataset.i)));
document.querySelectorAll('#panel-tx .card.click').forEach(el=>el.addEventListener('click',()=>openBorough('tx',+el.dataset.i)));

function openBorough(feed,i){
  const dev=feed==='dev', F=dev?DEV:TX, b=F.boroughs[i];
  document.getElementById('m-title').textContent=b.name+' — Neighborhoods';
  document.getElementById('m-sub').textContent=b.neighborhoodCount+' neighborhoods with '
    +(dev?'New Building filings':'recorded sales')+' in '+F.meta.latestMonthLabel
    +' · ranked by '+(dev?'filings':'sales')+' · every row verifiable';
  document.getElementById('m-head').innerHTML= dev
    ? '<tr><th>Neighborhood</th><th class="n">Filings</th><th class="n">Units</th><th class="n">12-mo avg</th><th class="n">YoY</th><th>Signal</th><th></th></tr>'
    : '<tr><th>Neighborhood</th><th class="n">Sales</th><th class="n">Median</th><th class="n">12-mo avg</th><th class="n">YoY</th><th>Signal</th><th></th></tr>';
  document.getElementById('m-rows').innerHTML=b.neighborhoods.map(n=>{
    const yoyBase = dev? n.yoyFilings : n.yoySales, minBase = dev?3:5;
    const yoyCell = (yoyBase>=minBase && n.yoy!=null)? pct(n.yoy) : '—';
    const col2 = dev? fmt(n.filings) : fmt(n.sales);
    const col3 = dev? fmt(n.units) : money(n.med);
    return '<tr><td>'+(dev?n.nta:n.neighborhood)+'</td><td class="nn">'+col2+'</td><td class="nn">'+col3+'</td>'
      +'<td class="nn">'+n.baseline.toFixed(1)+'</td>'
      +'<td class="nn '+(yoyBase>=minBase?upd(n.yoy):'')+'">'+yoyCell+'</td>'
      +'<td><span class="chip '+cls(n.regime)+'">'+n.regime+'</span></td>'
      +'<td><a href="'+n.evidenceUrl+'" target="_blank" rel="noopener">verify ↗</a></td></tr>';
  }).join('');
  document.getElementById('ov').classList.add('open');
}
const closeModal=()=>document.getElementById('ov').classList.remove('open');
document.getElementById('m-close').addEventListener('click',closeModal);
document.getElementById('ov').addEventListener('click',e=>{if(e.target.id==='ov')closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
</script>
</body>
</html>`;

await writeFile(OUT, html);
console.log(`Wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB)`);
