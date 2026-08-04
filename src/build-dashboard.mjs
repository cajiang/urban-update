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
const risk = JSON.parse(await readFile(join(dir, 'risk.json'), 'utf8'));
const ll97 = JSON.parse(await readFile(join(dir, 'll97.json'), 'utf8'));
let capital = null;
try { capital = JSON.parse(await readFile(join(dir, 'capital.json'), 'utf8')); } catch { /* optional */ }
let brief = null;
try { brief = JSON.parse(await readFile(join(dir, 'narratives.json'), 'utf8')); } catch { /* optional */ }

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
  .brief-lead{font-size:23px;line-height:1.4;font-weight:700;color:var(--ink);margin:0 0 14px;letter-spacing:-.01em}
  .brief-sum{font-size:15px;line-height:1.65;color:var(--ink-2);margin:0}
  .brief-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
  .brief-card .bt{font-size:15px;font-weight:650;color:var(--ink);margin-bottom:6px}
  .brief-card .bd{font-size:13.5px;line-height:1.6;color:var(--ink-2)}
  .feedchip{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--accent);background:#eaf1f8;border-radius:5px;padding:2px 7px;margin-top:10px}
  .ai-note{font-size:12px;color:var(--muted);background:var(--range-bg);border-radius:8px;padding:10px 14px}
  .fig{font-weight:650;font-variant-numeric:tabular-nums}
  .fig.up{color:var(--elev)} .fig.down{color:var(--cool)}
  .fig-money{color:#166534} .fig-num{color:var(--ink)}
  .quad{display:inline-block;font-weight:600}
  .chartwrap{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
  .chartwrap svg{width:100%;height:auto;display:block}
  .legend{display:flex;gap:20px;font-size:12.5px;color:var(--ink-2);margin-top:10px;flex-wrap:wrap}
  .legend .sw{display:inline-block;width:14px;height:3px;border-radius:2px;vertical-align:middle;margin-right:6px}
  .cyc{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 22px}
  .cyc .cyc-lead{font-size:16px;line-height:1.6;color:var(--ink);margin:0}
  .cyc .cyc-lead b{font-weight:700}
  .rolecap{font-size:11.5px;color:var(--muted);margin-top:6px;line-height:1.35}
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
    <button class="tab active" data-tab="brief">Brief</button>
    <button class="tab" data-tab="dev">Development</button>
    <button class="tab" data-tab="tx">Transactions</button>
    <button class="tab" data-tab="capital">Capital</button>
    <button class="tab" data-tab="cross">Cross-Signal</button>
    <button class="tab" data-tab="risk">Risk</button>
    <button class="tab" data-tab="ll97">Local Law 97</button>
  </div>
</div></header>

<main>
  <div class="panel active" id="panel-brief"></div>
  <div class="panel" id="panel-dev"></div>
  <div class="panel" id="panel-tx"></div>
  <div class="panel" id="panel-capital"></div>
  <div class="panel" id="panel-cross"></div>
  <div class="panel" id="panel-risk"></div>
  <div class="panel" id="panel-ll97"></div>

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
const RISK = ${JSON.stringify(risk)};
const LL97 = ${JSON.stringify(ll97)};
const CAP = ${JSON.stringify(capital)};
const BRIEF = ${JSON.stringify(brief)};

const fmt = (n) => Number(n||0).toLocaleString('en-US');
const pct = (x) => x==null ? '—' : (x>=0?'+':'') + Math.round(x*100) + '%';
const cls = (r) => r==='Elevated'?'elevated':r==='Cooling'?'cooling':'range';
const riskCls = (r) => r==='Rising'?'elevated':r==='Falling'?'cooling':'range';
const riskChip = (r) => '<span class="chip '+riskCls(r)+'">'+r+'</span>';
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

function provenanceBoxes(sources, generatedAt, lagNote, pubSub){
  const arr = Array.isArray(sources)?sources:[sources];
  const primary = arr[0];
  const off = (primary.provenance==='official')?'<span class="badge">Official</span>':'';
  const boxes = [
    {k:'Publisher', v:(primary.publisher||primary.attribution||'—')+off, s:pubSub||'Primary system of record — NYC Open Data'},
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
    +'<div class="xsig"><b>Risk</b> <span class="num" style="color:var(--muted)">'+fmt(z.hazardC||0)+' immediately-hazardous violations</span></div>'
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
    '<table><thead><tr><th>ZIP</th><th>Area</th><th>Borough</th><th class="n">Supply YoY</th><th class="n">Demand YoY</th><th class="n">Hazard (C)</th><th>Signal</th><th></th></tr></thead><tbody>'
    +C.zips.map(z=>'<tr><td class="num">'+z.zip+'</td><td class="desc">'+z.neighborhood+'</td><td>'+z.borough+'</td>'
      +'<td class="n '+upd(z.devYoY)+'">'+pct(z.devYoY)+'</td><td class="n '+upd(z.txYoY)+'">'+pct(z.txYoY)+'</td>'
      +'<td class="n">'+fmt(z.hazardC||0)+'</td>'
      +'<td>'+crossChip(z.cls)+'</td>'
      +'<td><a href="'+z.devEvidence+'" target="_blank" rel="noopener">filings</a> · <a href="'+z.txEvidence+'" target="_blank" rel="noopener">sales</a></td></tr>').join('')
    +'</tbody></table>');

  h+=section('Data Provenance &amp; Freshness', provenanceBoxes(m.sources.map(s=>({...s,provenance:'official',publisher:'NYC Open Data (DOB + DOF)'})), m.generatedAt, 'Joins two official city feeds · quarter ending '+m.referenceMonthLabel));
  h+=section('Methodology &amp; Evidence', methodBlock({baseline:m.method.signal, threshold:m.method.threshold, note:m.method.note}, m.sources.map(s=>s.label+' (<code>'+s.datasetId+'</code>)').join(' + ')));
  return h;
}

// ---------- Risk panel ----------
function renderRisk(){
  const R=RISK, c=R.citywide, m=R.meta;
  const worst=R.boroughs.slice().sort((a,b)=>b.weighted-a.weighted)[0];
  const c311yoy=c.complaints311Yoy? (c.complaints311-c.complaints311Yoy)/c.complaints311Yoy : null;
  let h='';
  h+=section('Risk Feed · '+m.windowLabel+' · <span style="color:var(--muted)">daily-updated agency data</span>',
    '<div class="headline"><p class="lead">'+R.narration.headline.replace(/Trend: (Rising|Falling|Stable)\\./,(x,g)=>'Trend: '+riskChip(g))+'</p>'
    +'<p class="verify"><a href="'+worst.evidenceUrl+'" target="_blank" rel="noopener">Verify these HPD violations ↗</a></p></div>');

  const kpis=[
    {label:'Immediately-hazardous (Class C)', big:fmt(c.C), sub:'HPD violations this quarter · <span class="'+upd(c.yoy)+'">'+arrow(c.yoy)+' '+pct(c.yoy)+' YoY</span> (weighted)'},
    {label:'Hazardous (Class B)', big:fmt(c.B), sub:'HPD violations this quarter'},
    {label:'311 building complaints', big:fmt(c.complaints311), sub:'to HPD/DOB · <span class="'+upd(c311yoy)+'">'+arrow(c311yoy)+' '+pct(c311yoy)+' YoY</span>'},
    {label:'New ECB penalty balance', big:'$'+fmt(Math.round(c.ecbBalance/1e6))+'M', sub:'financial enforcement this quarter'},
  ];
  h+=section('Citywide · Risk Pressure',
    '<div class="kpis">'+kpis.map(k=>'<div class="kpi"><div class="label">'+k.label+'</div><div class="big num">'+k.big+'</div><div class="sub">'+k.sub+'</div></div>').join('')
    +'</div><p class="verify" style="margin-top:14px;color:var(--ink-2);font-size:13.5px">'+R.narration.citySummary+'</p>');

  h+=section('By Borough · risk pressure · <span style="color:var(--accent)">click any borough to drill into ZIPs</span>',
    '<div class="grid">'+R.boroughs.slice().sort((a,b)=>b.weighted-a.weighted).map((b)=>{
      const i=R.boroughs.indexOf(b);
      return '<div class="card click" data-i="'+i+'"><div class="top"><span class="name">'+b.name+'</span>'+riskChip(b.regime)+'</div>'
      +'<div class="big num">'+fmt(b.weighted)+' <small>risk pts</small></div>'
      +'<div class="deltas"><span><b class="'+upd(b.yoy)+'">'+arrow(b.yoy)+' '+pct(b.yoy)+'</b> YoY</span><span><b>'+fmt(b.C)+'</b> Class C</span></div>'
      +sparkline(b.spark,'weighted')
      +'<div class="cardfoot"><span class="num">'+fmt(b.complaints311)+' 311 · $'+fmt(Math.round(b.ecbBalance/1e6))+'M ECB</span><a href="'+b.evidenceUrl+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">verify ↗</a></div>'
      +'<div class="hint">View '+b.neighborhoodCount+' ZIPs →</div></div>';
    }).join('')+'</div>');

  if(R.topRising.length) h+=section('Fastest-rising risk · ZIPs where hazardous violations are climbing',
    '<div class="grid">'+R.topRising.map(z=>
      '<div class="card"><div class="top"><span class="name">'+z.zip+' · '+z.neighborhood+'</span>'+riskChip('Rising')+'</div>'
      +'<div style="font-size:12px;color:var(--muted)">'+z.borough+'</div>'
      +'<div class="big num">'+fmt(z.weighted)+' <small>risk pts</small></div>'
      +'<div class="deltas"><span><b class="up">'+arrow(z.yoy)+' '+pct(z.yoy)+'</b> YoY</span><span><b>'+fmt(z.C)+'</b> Class C · '+fmt(z.complaints311)+' 311</span></div>'
      +'<div class="cardfoot"><span>immediately-hazardous rising</span><a href="'+z.evidenceUrl+'" target="_blank" rel="noopener">verify ↗</a></div></div>').join('')+'</div>');

  h+=section('Data Provenance &amp; Freshness', provenanceBoxes(m.sources.map(s=>({...s,publisher:s.attribution})), m.generatedAt, 'All three sources update daily/weekday — the fastest signals we track'));
  h+=section('Methodology &amp; Evidence', methodBlock(m.method, m.sources.map(s=>s.label+' (<code>'+s.datasetId+'</code>)').join(' · ')));
  return h;
}

// ---------- Local Law 97 panel ----------
const bigMoney = (n) => n>=1e9?'$'+(n/1e9).toFixed(1)+'B' : n>=1e6?'$'+(n/1e6).toFixed(1)+'M' : '$'+fmt(Math.round(n));
const share = (x) => Math.round((x||0)*100)+'%';
function renderLL97(){
  const L=LL97, c=L.citywide, m=L.meta;
  let h='';
  h+=section('Local Law 97 · carbon-penalty exposure · report year '+m.reportYear,
    '<div class="xintro">NYC\\'s <b>Local Law 97</b> caps carbon emissions for buildings over 25,000 sq ft. Penalties (<b>$268 per metric ton</b> over the limit) are <b>in effect now</b> (2024–2029) and the caps <b>tighten sharply in 2030</b>. '
    +'This estimates each covered building\\'s exposure from its reported emissions vs. its occupancy-based limit — the single largest looming compliance cost most owners can\\'t easily compute themselves.</div>');

  const kpis=[
    {label:'Covered buildings (≥25k sq ft)', big:fmt(c.covered), sub:'benchmarked, report year '+m.reportYear},
    {label:'Over the 2024–2029 limit', big:share(c.pct24), sub:fmt(c.over24)+' buildings · <span class="up">penalties now</span>'},
    {label:'Over the 2030–2034 limit', big:share(c.pct30), sub:fmt(c.over30)+' buildings · <span class="up">looming</span>'},
    {label:'Est. annual penalty exposure', big:bigMoney(c.pen24), sub:bigMoney(c.pen30)+' at the 2030 limits'},
  ];
  h+=section('Citywide exposure',
    '<div class="kpis">'+kpis.map(k=>'<div class="kpi"><div class="label">'+k.label+'</div><div class="big num">'+k.big+'</div><div class="sub">'+k.sub+'</div></div>').join('')+'</div>');

  h+=section('By Borough · <span style="color:var(--accent)">click any borough to drill into ZIPs</span>',
    '<div class="grid">'+L.boroughs.slice().sort((a,b)=>b.pen24-a.pen24).map((b)=>{
      const i=L.boroughs.indexOf(b);
      return '<div class="card click" data-i="'+i+'"><div class="top"><span class="name">'+b.name+'</span><span class="chip elevated">'+share(b.pct30)+' by 2030</span></div>'
      +'<div class="big num">'+bigMoney(b.pen24)+' <small>est. penalty/yr</small></div>'
      +'<div class="deltas"><span><b>'+share(b.pct24)+'</b> over 2024 limit</span><span><b>'+fmt(b.covered)+'</b> covered</span></div>'
      +'<div style="font-size:12px;color:var(--muted)">'+bigMoney(b.pen30)+' at the 2030 limits</div>'
      +'<div class="hint">View '+b.neighborhoodCount+' ZIPs →</div></div>';
    }).join('')+'</div>');

  h+=section('Highest-exposure buildings · est. 2024 penalty',
    '<table><thead><tr><th>Address</th><th>Borough</th><th>Type</th><th class="n">Floor area</th><th class="n">Est. penalty/yr</th></tr></thead><tbody>'
    +L.topBuildings.map(b=>'<tr><td>'+(b.address||'—')+'</td><td>'+b.borough+'</td><td class="desc">'+(b.ptype||'').slice(0,26)+'</td><td class="n">'+fmt(b.gfa)+' sf</td><td class="n">'+bigMoney(b.pen24)+'</td></tr>').join('')
    +'</tbody></table>');

  h+=section('Data Provenance &amp; Freshness', provenanceBoxes([{...m.source, publisher:m.source.attribution}], m.generatedAt, 'Benchmarking is annual · report year '+m.reportYear));
  h+=section('Methodology &amp; Evidence', methodBlock(m.method, m.source.label+' (<code>'+m.source.datasetId+'</code>, DOB). <a href="'+m.source.landing+'" target="_blank" rel="noopener">Dataset home ↗</a>'));
  return h;
}

// ---------- Capital panel (cost-of-capital lens) ----------
const bps = (n) => (n>=0?'+':'−')+Math.abs(n)+' bps';
// Dual-axis line chart: a rate (left axis) vs. recorded sales (right axis).
function lensChart(overlay){
  const W=720,H=250,padL=40,padR=54,padT=14,padB=26,n=overlay.length;
  const R=overlay.map(o=>o.rate),S=overlay.map(o=>o.sales);
  const rMin=Math.min(...R),rMax=Math.max(...R),sMin=Math.min(...S),sMax=Math.max(...S);
  const x=(i)=>padL+i*((W-padL-padR)/(n-1));
  const yR=(v)=>(H-padB)-((v-rMin)/((rMax-rMin)||1))*(H-padT-padB);
  const yS=(v)=>(H-padB)-((v-sMin)/((sMax-sMin)||1))*(H-padT-padB);
  const poly=(vals,yfn,color)=>'<polyline fill="none" stroke="'+color+'" stroke-width="1.9" points="'+vals.map((v,i)=>x(i).toFixed(1)+','+yfn(v).toFixed(1)).join(' ')+'"/>';
  let ticks='';
  overlay.forEach((o,i)=>{ if(o.month.slice(5)==='01'){ ticks+='<line x1="'+x(i).toFixed(1)+'" y1="'+padT+'" x2="'+x(i).toFixed(1)+'" y2="'+(H-padB)+'" stroke="#eef0f3"/>'
    +'<text x="'+x(i).toFixed(1)+'" y="'+(H-8)+'" font-size="10" fill="#6b7280" text-anchor="middle">'+o.month.slice(0,4)+'</text>'; }});
  const axL=(v)=>'<text x="'+(padL-6)+'" y="'+(yR(v)+3).toFixed(1)+'" font-size="10" fill="#b7791f" text-anchor="end">'+v.toFixed(1)+'%</text>';
  const axR=(v)=>'<text x="'+(W-padR+6)+'" y="'+(yS(v)+3).toFixed(1)+'" font-size="10" fill="#1c4e80" text-anchor="start">'+fmt(Math.round(v))+'</text>';
  return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="10-Year Treasury vs. recorded sales">'
    +ticks+axL(rMax)+axL(rMin)+axR(sMax)+axR(sMin)
    +poly(S,yS,'#1c4e80')+poly(R,yR,'#b7791f')+'</svg>';
}
function renderCapital(){
  if(!CAP) return section('Capital Conditions','<div class="xintro">No capital data yet. Run <code>node src/capital.mjs</code> to pull the FRED rate series.</div>');
  const K=CAP, m=K.meta, L=K.lens, cyc=L.cycle;
  let h='';
  h+=section('Capital Conditions · the cost of capital',
    '<div class="xintro">Interest rates are the master variable in real estate — they set the cost of every acquisition, construction loan, and refinancing. This tracks the rates NYC deals are priced off, straight from the <b>Federal Reserve</b>, and — as a <b>lens</b> — measures how local housing demand has moved with them.</div>');

  const rateKpi=(r)=>{
    const dir = r.yoyBps==null?'':(r.yoyBps>=0?'up':'down');
    return '<div class="kpi"><div class="label">'+r.name+'</div>'
      +'<div class="big num">'+r.latest.value.toFixed(2)+'%</div>'
      +'<div class="sub">'+(r.yoyBps==null?'':'<span class="'+dir+'">'+arrow(r.yoyBps)+' '+bps(r.yoyBps)+' YoY</span> · ')+'cycle '+r.cycleLow.value+'–'+r.cycleHigh.value+'%</div>'
      +'<div class="rolecap">'+r.role+'</div></div>';
  };
  h+=section('Current rates · latest print',
    '<div class="kpis">'+K.rates.map(rateKpi).join('')+'</div>'
    +'<p class="verify" style="margin-top:12px;color:var(--muted);font-size:12.5px">Latest: '
    +K.rates.map(r=>r.name+' '+r.latest.value.toFixed(2)+'% ('+dateOnly(r.latest.date+'T00:00:00')+')').join(' · ')+'</p>');

  // The lens: cycle comparison (hero) + overlay chart + correlation.
  if(cyc){
    const salesPct = cyc.sales? pct(cyc.sales.pct) : '—';
    h+=section('The lens · cost of capital vs. NYC housing demand',
      '<div class="cyc"><p class="cyc-lead">Since the <b>2021 low-rate boom</b>, the 30-year mortgage rose from <b>'+cyc.mortgage30.from.toFixed(2)+'%</b> to <b class="up">'+cyc.mortgage30.to.toFixed(2)+'%</b> and the 10-year Treasury from <b>'+cyc.treasury10.from.toFixed(2)+'%</b> to <b class="up">'+cyc.treasury10.to.toFixed(2)+'%</b>. '
      +'Over the same span, NYC recorded market sales '+(cyc.sales&&cyc.sales.pct<0?'fell':'moved')+' <b class="down">'+salesPct+'</b>'
      +(cyc.sales?' — from <b>'+fmt(cyc.sales.from)+'</b> to <b>'+fmt(cyc.sales.to)+'</b> sales per month':'')+' ('+cyc.toLabel+').</p></div>');
  }

  if(L.overlay&&L.overlay.length){
    h+=section('10-Year Treasury vs. recorded sales · monthly, 2016 → today',
      '<div class="chartwrap">'+lensChart(L.overlay)
      +'<div class="legend"><span><span class="sw" style="background:#b7791f"></span>10-Year Treasury (%, left axis)</span>'
      +'<span><span class="sw" style="background:#1c4e80"></span>Recorded sales (per month, right axis)</span></div></div>');
  }

  const mc=(L.correlations||[]).find(c=>c.rate==='30-Year Mortgage');
  if(mc){
    h+=section('Association · detrended',
      '<div class="xintro">On year-over-year changes (which strip out the shared long-run trend), the 30-year mortgage rate and recorded sales show a <b>modest inverse association</b> — Pearson <b>r = '+mc.r+'</b> over '+mc.n+' months ('+mc.from+' → '+mc.to+'). '
      +'Month-to-month the relationship is noisy — many forces move a single month\\'s sales — but at cycle scale the direction is clear. '
      +'<br><br><span style="color:var(--muted);font-size:13px">'+esc(L.supplyNote)+'</span></div>');
  }

  h+=section('Data Provenance &amp; Freshness', provenanceBoxes([{label:'Interest-rate series (10Y, mortgage, SOFR, Fed Funds)', datasetId:m.source.datasetId, updateFrequency:m.source.updateFrequency, dataUpdatedAt:m.source.dataUpdatedAt, provenance:'official', publisher:m.source.publisher}], m.generatedAt, m.source.note, 'Authoritative U.S. macro-financial data — Federal Reserve (FRED)'));
  h+=section('Methodology &amp; Evidence', methodBlock(m.method, m.source.label+'. Series pulled from the public FRED CSV endpoint (no API key). <a href="'+m.source.landing+'" target="_blank" rel="noopener">FRED home ↗</a>'));
  return h;
}

// ---------- Brief panel (LLM interpretation layer) ----------
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
// Colorize figures inside brief prose so the data reads "important, now".
// Rising % → amber, falling % → blue, $ amounts → green, comma-counts → bold ink.
// (Bare integers like ZIPs 11222, years 2026, "311" are intentionally NOT matched —
// only thousands-separated counts, which is what the meaningful figures use.)
function fig(text){
  const re=/(\$\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|trillion))?[KMB]?)|([+−\-]\d[\d,]*(?:\.\d+)?%)|(\d[\d,]*(?:\.\d+)?%)|(\d{1,3}(?:,\d{3})+)/g;
  return esc(text).replace(re,(m,money,spct,pct)=>{
    let cls='fig fig-num';
    if(money) cls='fig fig-money';
    else if(spct){ const s=spct[0]; cls='fig '+((s==='−'||s==='-')?'down':'up'); }
    return '<span class="'+cls+'">'+m+'</span>';
  });
}
function renderBrief(){
  const B=BRIEF;
  if(!B){
    return section('The Brief', '<div class="xintro">No brief generated yet. Set <code>ANTHROPIC_API_KEY</code> and run <code>node src/refresh.mjs</code> to generate the daily AI brief from the feeds.</div>');
  }
  const p=B.meta&&B.meta.periods||{};
  let h='';
  h+=section('The Brief · what matters now',
    '<div class="headline"><p class="brief-lead">'+fig(B.headline)+'</p><p class="brief-sum">'+fig(B.summary)+'</p></div>');

  h+=section('Key signals',
    '<div class="grid">'+(B.insights||[]).map(i=>
      '<div class="brief-card"><div class="bt">'+esc(i.title)+'</div><div class="bd">'+fig(i.detail)+'</div><span class="feedchip">'+esc(i.feed)+'</span></div>').join('')+'</div>');

  if((B.neighborhoods||[]).length) h+=section('Neighborhood spotlights',
    '<div class="grid">'+B.neighborhoods.map(n=>
      '<div class="brief-card"><div class="bt">'+esc(n.area)+'</div><div class="bd">'+fig(n.narrative)+'</div></div>').join('')+'</div>');

  const gen = B.meta&&B.meta.generatedAt ? new Date(B.meta.generatedAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : '';
  h+=section('About this brief',
    '<div class="ai-note"><b>Generated by '+esc((B.meta&&B.meta.model)||'Claude')+'</b> from the five feeds below'+(gen?', '+gen:'')+'. '
    +esc((B.meta&&B.meta.grounding)||'')+' Periods — Development: '+esc(p.development)+' · Transactions: '+esc(p.transactions)+' · Risk: '+esc(p.risk)+' · LL97: '+esc(p.ll97_report_year)+' · Cross-Signal: '+esc(p.cross_signal)+(p.capital?' · Capital: '+esc(p.capital):'')+'.</div>');
  return h;
}

document.getElementById('panel-brief').innerHTML = renderBrief();
document.getElementById('panel-dev').innerHTML = renderDev();
document.getElementById('panel-tx').innerHTML  = renderTx();
document.getElementById('panel-capital').innerHTML = renderCapital();
document.getElementById('panel-cross').innerHTML = renderCross();
document.getElementById('panel-risk').innerHTML = renderRisk();
document.getElementById('panel-ll97').innerHTML = renderLL97();
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
document.querySelectorAll('#panel-risk .card.click').forEach(el=>el.addEventListener('click',()=>openBorough('risk',+el.dataset.i)));
document.querySelectorAll('#panel-ll97 .card.click').forEach(el=>el.addEventListener('click',()=>openBorough('ll97',+el.dataset.i)));

function openBorough(feed,i){
  const F = feed==='dev'?DEV : feed==='tx'?TX : feed==='risk'?RISK : LL97, b=F.boroughs[i];
  const label = feed==='risk' ? F.meta.windowLabel : feed==='ll97' ? ('report year '+F.meta.reportYear) : F.meta.latestMonthLabel;
  const what = feed==='dev'?'New Building filings' : feed==='tx'?'recorded sales' : feed==='risk'?'hazardous violations' : 'LL97-covered buildings';
  const rankBy = feed==='dev'?'filings' : feed==='tx'?'sales' : feed==='risk'?'risk pressure' : 'penalty exposure';
  const unit = (feed==='risk'||feed==='ll97')?'ZIPs':'neighborhoods';
  document.getElementById('m-title').textContent=b.name+' — '+(feed==='risk'?'ZIP risk':feed==='ll97'?'ZIP exposure':'Neighborhoods');
  document.getElementById('m-sub').textContent=b.neighborhoodCount+' '+unit+' with '+what+' in '+label+' · ranked by '+rankBy+' · every row verifiable';
  document.getElementById('m-head').innerHTML=
    feed==='dev' ? '<tr><th>Neighborhood</th><th class="n">Filings</th><th class="n">Units</th><th class="n">12-mo avg</th><th class="n">YoY</th><th>Signal</th><th></th></tr>'
    : feed==='tx' ? '<tr><th>Neighborhood</th><th class="n">Sales</th><th class="n">Median</th><th class="n">12-mo avg</th><th class="n">YoY</th><th>Signal</th><th></th></tr>'
    : feed==='ll97' ? '<tr><th>ZIP</th><th class="n">Covered</th><th class="n">Over 2024</th><th class="n">Over 2030</th><th class="n">Est. penalty/yr</th><th></th></tr>'
    : '<tr><th>ZIP · Area</th><th class="n">Risk pts</th><th class="n">Class C</th><th class="n">Class B</th><th class="n">311</th><th class="n">YoY</th><th>Trend</th><th></th></tr>';
  document.getElementById('m-rows').innerHTML=b.neighborhoods.map(n=>{
    if(feed==='ll97'){
      return '<tr><td class="num">'+n.zip+'</td><td class="nn">'+fmt(n.covered)+'</td>'
        +'<td class="nn">'+share(n.pct24)+'</td><td class="nn">'+share(n.pct30)+'</td>'
        +'<td class="nn">'+bigMoney(n.pen24)+'</td>'
        +'<td><a href="'+n.evidenceUrl+'" target="_blank" rel="noopener">verify ↗</a></td></tr>';
    }
    if(feed==='risk'){
      return '<tr><td>'+n.zip+(n.neighborhood?' · '+n.neighborhood:'')+'</td><td class="nn">'+fmt(n.weighted)+'</td>'
        +'<td class="nn">'+fmt(n.C)+'</td><td class="nn">'+fmt(n.B)+'</td><td class="nn">'+fmt(n.complaints311)+'</td>'
        +'<td class="nn '+(n.yoy!=null?upd(n.yoy):'')+'">'+(n.yoy!=null?pct(n.yoy):'—')+'</td>'
        +'<td>'+riskChip(n.regime)+'</td>'
        +'<td><a href="'+n.evidenceUrl+'" target="_blank" rel="noopener">verify ↗</a></td></tr>';
    }
    const dev=feed==='dev', yoyBase = dev? n.yoyFilings : n.yoySales, minBase = dev?3:5;
    const yoyCell = (yoyBase>=minBase && n.yoy!=null)? pct(n.yoy) : '—';
    return '<tr><td>'+(dev?n.nta:n.neighborhood)+'</td><td class="nn">'+(dev?fmt(n.filings):fmt(n.sales))+'</td><td class="nn">'+(dev?fmt(n.units):money(n.med))+'</td>'
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
