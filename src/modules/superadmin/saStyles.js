/*
 * DFX Control - SuperAdmin console. Forest-green enterprise look: dark green
 * sidebar, warm off-white work area, white cards with a hairline border and a
 * barely-there shadow. Teal-green for money billed, amber for scheme money,
 * one colour per meaning elsewhere (green good, amber attention, red problem).
 * Manrope throughout; figures use tabular numbers.
 */
export const SA_CSS = `
.sa{--page:#F6F7F5;--paper:#FFFFFF;--glass:rgba(255,255,255,.9);--tint:#F3F5F3;--rule:#E3E8E5;--rule2:#EEF1EF;
--ink:#17201E;--ink2:#33403C;--muted:#66736F;--faint:#7A8783;
--primary:#10201D;--primary-2:#1C302C;
--acc:#0F766E;--acc-ink:#0B5E58;--acc-soft:#E6F2F0;--gold:#D99A2B;--eyebrow:#B7791F;
--bill:#0F5E4C;--scheme:#E3A15C;
--live:#16865B;--warn:#D97706;--bad:#D14343;--app:#6D5BD0;--web:#0F766E;--teal:#0F766E;--info:#3478C6;
--live-bg:#E8F5EE;--warn-bg:#FDF3E4;--bad-bg:#FCEDED;--app-bg:#EFEDFB;--teal-bg:#E6F2F0;--info-bg:#EAF2FB;
--live-ink:#0E6B47;--warn-ink:#8A4B05;--bad-ink:#A12D2D;--app-ink:#4F3FB0;--teal-ink:#0B5E58;--info-ink:#245C9C;
--side:#0E1B19;--side-2:#17302B;--side-ink:#C9D3D0;--side-faint:#8FA09B;--side-acc:#2BB3A3;
--sh:0 2px 10px rgba(16,32,29,.04);--sh-h:0 4px 16px rgba(16,32,29,.08);--r:14px;--ease:cubic-bezier(.2,.8,.2,1);
font-family:"Manrope","Segoe UI",system-ui,sans-serif;color:var(--ink);min-height:100dvh;font-size:14px;line-height:1.5;
-webkit-font-smoothing:antialiased;text-wrap:pretty;background:var(--page)}
.sa *{box-sizing:border-box}
.sa .mono{font-family:"JetBrains Mono","Fira Code",ui-monospace,Consolas,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.sa .fig,.sa td.r,.sa .num{font-variant-numeric:tabular-nums}
.h-live{--c:var(--live);--cb:var(--live-bg)}.h-web{--c:var(--acc);--cb:var(--acc-soft)}.h-app{--c:var(--app);--cb:var(--app-bg)}
.h-warn{--c:var(--warn);--cb:var(--warn-bg)}.h-bad{--c:var(--bad);--cb:var(--bad-bg)}.h-teal{--c:var(--teal);--cb:var(--teal-bg)}
.h-ink{--c:var(--ink2);--cb:var(--rule2)}.h-info{--c:var(--info);--cb:var(--info-bg)}
.sa-link{all:unset;cursor:pointer;color:var(--muted);font-weight:600;font-size:13px;transition:color .15s}
.sa-link:hover{color:var(--acc-ink)}
/* tabs */
.sa-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-bottom:14px;padding-bottom:2px}
.sa-tabs button{all:unset;cursor:pointer;white-space:nowrap;padding:8px 14px;border-radius:9px;font-weight:600;color:var(--muted);display:flex;align-items:center;gap:8px;background:var(--paper);border:1px solid var(--rule);transition:color .15s,background .15s,border-color .15s}
.sa-tabs button:hover{color:var(--ink);border-color:#CFD8D4}
.sa-tabs button[aria-selected="true"]{background:var(--primary);color:#fff;border-color:var(--primary)}
.sa-tabs .cnt{font-size:11.5px;background:var(--live-bg);color:var(--live-ink);border-radius:999px;padding:0 7px;font-weight:700}
.sa-tabs .cnt.zero,.sa-seg .cnt.zero{background:var(--rule2);color:var(--faint)}
.sa-tabs button[aria-selected="true"] .cnt{background:rgba(255,255,255,.18);color:#fff}
.sa button:focus-visible,.sa input:focus-visible,.sa select:focus-visible,.sa [tabindex]:focus-visible,.sa a:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.sa-grid{display:grid;gap:16px}
/* KPI tiles (monitoring pages) */
.sa-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0;background:var(--paper);border:1px solid var(--rule);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh)}
.sa-kpis:not(.six){display:flex;flex-wrap:wrap}
.sa-kpis:not(.six)>.sa-kpi{flex:1 1 190px}
.sa-kpis>.sa-kpi{border:0;border-radius:0;box-shadow:1px 0 0 var(--rule),0 1px 0 var(--rule);padding:16px 18px 18px}
.sa-kpis>.sa-kpi.go:hover{transform:none;box-shadow:1px 0 0 var(--rule),0 1px 0 var(--rule);background:var(--tint)}
.sa-kpi.go{cursor:pointer;transition:border-color .2s var(--ease),box-shadow .2s var(--ease),background .2s var(--ease)}
.sa-kpi.go:hover{box-shadow:var(--sh-h)}
.sa-kpis.six{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:760px){.sa-kpis.six{grid-template-columns:repeat(2,minmax(0,1fr))}}
.sa-kpi{position:relative;overflow:hidden;background:var(--paper);border:1px solid var(--rule);border-radius:12px;padding:14px 16px;display:grid;grid-template-columns:1fr;gap:4px;align-content:start}
.sa-kpi .chip{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--cb,var(--acc-soft));color:var(--c,var(--acc));z-index:1}
.sa-kpi .lbl{font-size:13px;color:var(--muted);font-weight:600;padding-right:40px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.sa-kpi .val{font-size:26px;font-weight:700;letter-spacing:-.02em;line-height:1.2;color:var(--ink);white-space:nowrap;font-variant-numeric:tabular-nums}
.sa-kpi .sub{font-size:12.5px;color:var(--muted);margin-top:2px}
.sa-kpi.h-bad .val{color:var(--bad)}
.sa-pulse{width:8px;height:8px;border-radius:50%;background:var(--live);flex:none;animation:saPulse 2s infinite}
@keyframes saPulse{0%{box-shadow:0 0 0 0 rgba(22,134,91,.45)}70%{box-shadow:0 0 0 7px rgba(22,134,91,0)}100%{box-shadow:0 0 0 0 rgba(22,134,91,0)}}
/* panels */
.sa-card{background:var(--paper);border:1px solid var(--rule);border-radius:var(--r);box-shadow:var(--sh);min-width:0;display:flex;flex-direction:column}
.sa-card-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 0;flex-wrap:wrap}
.sa-card-h h3{margin:0;font-size:16px;font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:10px;color:var(--ink)}
.sa-card-h h3 .ic{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--cb,var(--acc-soft));color:var(--c,var(--acc))}
.sa-card-h small{color:var(--muted);font-size:12.5px}
.sa-card-b{padding:14px 18px 18px;flex:1;min-height:0}
.sa-fill{position:relative;flex:1;min-height:300px}
.sa-fill>.in{position:absolute;inset:0;overflow-y:auto;padding:4px 18px 12px}
/* badges */
.sa-pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;white-space:nowrap;border-radius:999px;padding:2px 10px;line-height:18px;background:var(--rule2);color:var(--muted)}
.sa-pill i{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block;flex:none}
.t-live{background:var(--live-bg);color:var(--live-ink)}.t-warn{background:var(--warn-bg);color:var(--warn-ink)}.t-bad{background:var(--bad-bg);color:var(--bad-ink)}
.t-pri{background:var(--acc-soft);color:var(--acc-ink)}.t-app{background:var(--app-bg);color:var(--app-ink)}.t-sky{background:var(--info-bg);color:var(--info-ink)}
.t-mute{background:var(--rule2);color:var(--muted)}
.sa-feed .t-live,.sa-feed .t-warn,.sa-feed .t-bad,.sa-feed .t-mute{background:none}
/* tables */
.sa-tbl{overflow-x:auto}
.sa-tbl table{width:100%;border-collapse:collapse;font-size:13.5px}
.sa-tbl th{text-align:left;font-size:12.5px;color:var(--muted);font-weight:600;padding:10px 16px;border-bottom:1px solid var(--rule);white-space:nowrap;background:#FAFBFA}
.sa-tbl td{padding:12px 16px;border-bottom:1px solid var(--rule2);vertical-align:middle;white-space:nowrap}
.sa-tbl td.wrap{white-space:normal}
.sa-tbl tr:last-child td{border-bottom:0}
.sa-tbl tbody tr.click{cursor:pointer;transition:background .15s}
.sa-tbl tbody tr.click:hover{background:var(--tint)}
.sa-tbl div.who{display:flex;align-items:center;gap:10px}
.sa-tbl div.who>div{min-width:0}
.sa-tbl .who b{display:block;font-weight:600;color:var(--ink)}
.sa-tbl .who span:not(.sa-ini){display:block;font-size:12px;color:var(--muted)}
.sa-ini{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;font-size:11.5px;font-weight:700;flex:none;background:var(--cb,var(--acc-soft));color:var(--c,var(--acc))}
.sa-tbl .r{text-align:right}
.sa-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 16px;border-bottom:1px solid var(--rule)}
.sa-in,.sa-sel{height:38px;border:1px solid var(--rule);border-radius:9px;background:var(--paper);padding:0 12px;font:inherit;font-size:13.5px;color:var(--ink);min-width:0;transition:border-color .15s,box-shadow .15s}
.sa-in{min-width:180px;flex:1 1 200px;max-width:340px}
.sa-filters .sa-sel[type="date"]{flex:0 0 148px;width:148px}
.sa-in:hover,.sa-sel:hover{border-color:#CFD8D4}
.sa-in:focus,.sa-sel:focus{border-color:var(--acc);outline:none;box-shadow:0 0 0 3px var(--acc-soft)}
.sa-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:38px;padding:0 16px;border-radius:9px;font-weight:600;font-size:13.5px;background:var(--primary);color:#fff;transition:background .15s,box-shadow .15s}
.sa-btn:hover{background:var(--primary-2)}
.sa-btn.ghost{background:var(--paper);color:var(--ink);border:1px solid var(--rule)}
.sa-btn.ghost:hover{border-color:#CFD8D4;background:var(--tint)}
.sa-btn.danger{background:var(--bad)}.sa-btn.danger:hover{background:#B83737}
.sa-btn.sm{height:32px;padding:0 12px;font-size:12.5px}
.sa-btn[disabled]{opacity:.45;cursor:not-allowed;pointer-events:none}
.sa-empty{margin:12px;padding:30px 16px;text-align:center;color:var(--muted);font-size:13.5px;border:1px dashed var(--rule);border-radius:12px;background:#FAFBFA;text-wrap:balance}
.sa-empty b{display:block;color:var(--ink);margin-bottom:3px}
.sa-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;border-top:1px solid var(--rule);color:var(--muted);font-size:12.5px;flex-wrap:wrap}
.sa-bar{height:8px;border-radius:99px;background:var(--rule2);overflow:hidden}
.sa-bar>i{display:block;height:100%;border-radius:99px;background:var(--acc);transition:width .4s var(--ease)}
.sa-bar.warn>i{background:var(--warn)}.sa-bar.bad>i{background:var(--bad)}
.sa-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px}
.sa-two{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px}
@media (max-width:1100px){.sa-two{grid-template-columns:1fr}}
.sa-kv{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:13.5px;margin:0}
.sa-kv dt{color:var(--muted)}.sa-kv dd{margin:0;text-align:right;font-weight:600;overflow-wrap:anywhere}
.sa-feed{display:grid}
.sa-feed>div{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;padding:10px 0;border-bottom:1px solid var(--rule2)}
.sa-feed>div:last-child{border-bottom:0}
.sa-ico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none}
.sa-ico.t-live{background:var(--live-bg)!important}.sa-ico.t-bad{background:var(--bad-bg)!important}.sa-ico.t-warn{background:var(--warn-bg)!important}.sa-ico.t-mute{background:var(--rule2)!important}
.sa-feed .txt{font-size:13.5px;min-width:0}.sa-feed .txt b{font-weight:600}.sa-feed .txt span{display:block;color:var(--muted);font-size:12px}
.sa-feed time{font-size:12px;color:var(--muted);white-space:nowrap}
.sa-legend{display:flex;gap:16px;font-size:12.5px;color:var(--ink2);flex-wrap:wrap;font-weight:500}
.sa-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:-1px}
/* health banner */
.sa-health{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;border-radius:var(--r);padding:14px 18px 16px;border:1px solid}
.sa-health.ok{background:var(--live-bg);border-color:#C5E5D4}
.sa-health.warn{background:var(--warn-bg);border-color:#F1DAB2}
.sa-health.bad{background:var(--bad-bg);border-color:#F2C9C9}
.sa-health .orb{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;color:#fff}
.sa-health.ok .orb{background:var(--live)}.sa-health.warn .orb{background:var(--warn)}.sa-health.bad .orb{background:var(--bad)}
.sa-health b{font-size:16px;letter-spacing:-.01em;display:block}
.sa-health ul{margin:4px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 18px;font-size:13px;color:var(--ink2)}
.sa-health li::before{content:"•";margin-right:6px;color:var(--faint)}
@media (max-width:700px){.sa-health{grid-template-columns:auto 1fr}.sa-health>.side{grid-column:1/-1}}
/* system map */
.sa-map text{font-family:"Manrope",system-ui,sans-serif}
.sa-map .v{font-weight:700}
.sa-map .link{fill:none;stroke-width:2.5;stroke-linecap:round}
.sa-map .bed{fill:none;stroke:#EEF2EF;stroke-width:12;stroke-linecap:round}
.sa-map .ties{fill:none;stroke:#DCE3DF;stroke-width:12;stroke-dasharray:2 9}
.sa-map .rail{fill:none;stroke-width:2;stroke-linecap:round}
.sa-map .train{fill:none;stroke-width:5;stroke-linecap:round;animation:saTrain var(--d,1.6s) linear infinite,saBlink .7s ease-in-out infinite alternate}
.sa-map .train.back{stroke-width:3;animation-direction:reverse,alternate;opacity:.7}
@keyframes saTrain{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
@keyframes saBlink{from{opacity:1}to{opacity:.45}}
/* drawer & forms */
.sa-drawer-bg{position:fixed;inset:0;background:rgba(14,27,25,.45);z-index:60;animation:saFade .16s ease-out}
.sa-drawer{position:fixed;top:0;right:0;bottom:0;width:min(820px,calc(100vw - 48px));background:var(--page);z-index:61;border-radius:16px 0 0 16px;border:1px solid var(--rule);box-shadow:0 24px 64px rgba(16,32,29,.22);display:flex;flex-direction:column;overflow:hidden;animation:saIn .26s var(--ease)}
@keyframes saIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:none}}
@keyframes saFade{from{opacity:0}to{opacity:1}}
@media (max-width:640px){.sa-drawer{width:100vw;height:100dvh;border-radius:0;animation:saFade .16s ease-out}}
.sa-drawer-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 24px;background:var(--paper);border-bottom:1px solid var(--rule)}
.sa-drawer-h h2{margin:0;font-size:19px;letter-spacing:-.015em;font-weight:700}
.sa-drawer-h p{margin:2px 0 0;color:var(--muted);font-size:13px}
.sa-drawer-b{overflow-y:auto;padding:20px 24px 24px;display:grid;gap:16px;align-content:start;min-height:0}
.sa-x{all:unset;cursor:pointer;width:38px;height:38px;border-radius:9px;display:grid;place-items:center;color:var(--muted);flex:none}
.sa-x:hover{background:var(--tint);color:var(--ink)}
.sa-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media (max-width:620px){.sa-form{grid-template-columns:1fr}}
.sa-field{display:grid;gap:5px;align-content:start}.sa-field.full{grid-column:1/-1}
.sa-field label{font-size:12.5px;font-weight:600;color:var(--ink2)}
.sa-field label em{color:var(--bad);font-style:normal}
.sa-field .help{font-size:12px;color:var(--muted)}
.sa-field .err{font-size:12px;color:var(--bad);font-weight:600}
.sa-field .sa-in,.sa-field .sa-sel{max-width:none;width:100%;height:40px}
.sa-fs{border:1px solid var(--rule);border-radius:var(--r);background:var(--paper);padding:0 18px 18px;margin:0;min-width:0}
.sa-fs legend{float:left;width:100%;margin:0 0 14px;padding:14px 0 12px;border-bottom:1px solid var(--rule2);font-size:13.5px;color:var(--ink);font-weight:700;display:flex;align-items:center;gap:8px}
.sa-fs legend::before{content:"";width:3px;height:14px;border-radius:2px;background:var(--acc)}
.sa-fs legend + *{clear:both}
.sa-alert{border-radius:12px;padding:10px 14px;font-size:13.5px;display:flex;gap:10px;align-items:flex-start;border:1px solid}
.sa-alert svg{flex:none;margin-top:1px}
.sa-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}
.sa-chips span{background:rgba(255,255,255,.8);border:1px solid #EFD9AE;border-radius:7px;padding:2px 9px;font-size:12.5px;color:var(--ink2);font-weight:600}
.sa-chips em{font-style:normal;font-weight:500;color:var(--muted);margin-left:5px}
.sa-alert.bad{background:var(--bad-bg);color:var(--bad-ink);border-color:#F2C9C9}.sa-alert.ok{background:var(--live-bg);color:var(--live-ink);border-color:#C5E5D4}
.sa-alert.warn{background:var(--warn-bg);color:var(--warn-ink);border-color:#F1DAB2}.sa-alert.info{background:var(--acc-soft);color:var(--acc-ink);border-color:#C3E0DB}
.sa-secret{font-family:"JetBrains Mono",monospace;background:var(--tint);border:1px dashed #C9D3D0;border-radius:10px;padding:9px 12px;display:flex;justify-content:space-between;gap:10px;align-items:center;overflow-wrap:anywhere;font-size:13px}
.sa-skel{background:linear-gradient(90deg,var(--rule2) 25%,#F8FAF9 50%,var(--rule2) 75%);background-size:200% 100%;animation:saShim 1.2s infinite;border-radius:8px}
@keyframes saShim{from{background-position:200% 0}to{background-position:-200% 0}}
.sa-muted{color:var(--muted)}.sa-dim{color:var(--faint)}
.sa-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.sa-json{font-family:"JetBrains Mono",monospace;font-size:12px;background:var(--tint);border:1px solid var(--rule2);border-radius:10px;padding:8px 10px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;margin:6px 0 0;color:var(--ink2)}
.sa-log{font-family:"JetBrains Mono",monospace;font-size:12px;line-height:1.55;background:#0E1B19;color:#D5DFDB;border-radius:10px;padding:10px 12px;max-height:300px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
/* segmented controls: pill-like rectangles, selected = dark green */
.sa-seg{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.sa-seg button{all:unset;cursor:pointer;height:36px;padding:0 18px;border-radius:9px;font-weight:600;font-size:13.5px;color:var(--ink);background:var(--paper);border:1px solid var(--rule);display:flex;align-items:center;gap:7px;transition:background .15s,border-color .15s,color .15s}
.sa-seg button:hover{border-color:#CFD8D4;background:var(--tint)}
.sa-seg button[aria-selected="true"]{background:var(--primary);color:#fff;border-color:var(--primary)}
.sa-seg .cnt{font-size:11px;font-weight:700;border-radius:999px;padding:0 7px;background:var(--live-bg);color:var(--live-ink)}
.sa-seg .cnt.bad{background:var(--bad);color:#fff}
.sa-seg button[aria-selected="true"] .cnt{background:rgba(255,255,255,.18);color:#fff}
.sa-seg.sm{gap:5px}.sa-seg.sm button{height:30px;padding:0 8px;font-size:11.5px;border-radius:8px;color:var(--muted)}
.sa-seg.sm button[aria-selected="true"]{color:#fff}
.sa-dev{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:1000px){.sa-dev{grid-template-columns:1fr}}
.sa-dev>.sa-card:first-child{position:sticky;top:80px;max-height:calc(100dvh - 100px)}
.sa-dev-list{overflow-y:auto;padding:6px;display:grid;gap:1px;align-content:start;flex:1;min-height:0}
.sa-dev-list button{all:unset;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;font-size:13px;color:var(--ink2)}
.sa-dev-list button em{font-style:normal;font-size:11.5px;color:var(--faint);flex:none}
.sa-dev-list button:hover{background:var(--tint)}
.sa-dev-list button[aria-current="true"]{background:var(--acc-soft);color:var(--acc-ink);font-weight:600}
.sa-grid-tbl th{position:sticky;top:0;z-index:1;background:#FAFBFA}
.sa-grid-tbl{max-height:calc(100dvh - 300px)}

/* ── App shell ─────────────────────────────────────────────────────────── */
.sa-app{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:100dvh}
.sa-side{background:var(--side);color:var(--side-ink);display:flex;flex-direction:column;position:sticky;top:0;height:100dvh;z-index:40}
.sa-side-brand{display:grid;justify-items:center;padding:30px 20px 26px}
.sa-mark{font-family:"Fraunces",Georgia,serif;font-weight:500;color:#F4F6F5;font-size:30px;letter-spacing:.08em;line-height:1}
.sa-mark-sub{font-size:11px;letter-spacing:.42em;color:var(--side-ink);margin-top:6px;padding-left:.42em;font-weight:600}
.sa-side-nav{flex:1;overflow-y:auto;overflow-x:hidden;padding:4px 14px 14px;display:grid;align-content:start;gap:4px}
.sa-side-nav .item,.sa-side-nav .subitem{all:unset;cursor:pointer;display:flex;align-items:center;gap:12px;border-radius:10px;color:var(--side-ink);font-weight:500;transition:background .15s,color .15s;position:relative}
.sa-side-nav .item{padding:11px 14px;font-size:14px}
.sa-side-nav .item:hover,.sa-side-nav .subitem:hover{background:rgba(255,255,255,.05);color:#fff}
.sa-side-nav .item.on-parent{color:#fff}
.sa-side-nav .item[aria-current="page"],.sa-side-nav .subitem[aria-current="page"]{background:var(--side-2);color:#fff;box-shadow:inset 0 0 0 1px rgba(43,179,163,.22)}
.sa-side-nav .item[aria-current="page"]::before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:0 3px 3px 0;background:var(--side-acc)}
.sa-side-nav .item .live{margin-left:auto;font-style:normal;font-size:11.5px;font-weight:700;color:#BFEBD5;background:rgba(43,179,163,.16);border-radius:999px;padding:1px 9px;display:flex;align-items:center;gap:6px}
.sa-side-nav .item .live i{width:6px;height:6px;border-radius:50%;background:#34D399;animation:saPulse 2s infinite}
.sa-side-nav .chev{transition:transform .2s;opacity:.7;transform:rotate(-90deg)}.sa-side-nav .chev.up{transform:none}
.sa-side-nav .sub{display:grid;gap:2px;margin:2px 0 8px 20px;padding-left:8px;border-left:1px solid rgba(255,255,255,.1)}
.sa-side-nav .subitem{padding:9px 8px;font-size:13px;white-space:nowrap}
.sa-side-foot{display:flex;align-items:center;gap:12px;padding:16px 18px;border-top:1px solid rgba(255,255,255,.08)}
.sa-side-foot .av{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.25);color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px;flex:none}
.sa-side-foot .me{min-width:0;flex:1}
.sa-side-foot .me b{display:block;color:#fff;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-side-foot .me span{display:block;font-size:11.5px;color:var(--side-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-side-foot .out{all:unset;cursor:pointer;width:34px;height:34px;border-radius:8px;display:grid;place-items:center;color:var(--side-faint)}
.sa-side-foot .out:hover{background:rgba(255,255,255,.07);color:#fff}
.sa-body{min-width:0;display:flex;flex-direction:column}
/* top header */
.sa-top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:12px;padding:14px clamp(16px,2.4vw,30px);background:rgba(246,247,245,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--rule)}
.sa-search{all:unset;cursor:text;display:flex;align-items:center;gap:10px;height:40px;flex:0 1 380px;min-width:0;padding:0 8px 0 14px;border:1px solid var(--rule);border-radius:10px;background:var(--paper);color:var(--faint);font-size:13px;box-sizing:border-box;transition:border-color .15s}
.sa-search:hover{border-color:#CFD8D4}
.sa-search .ph{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-kbd{display:inline-flex;gap:3px}
.sa-kbd kbd{font:600 11px "Manrope",sans-serif;color:var(--muted);background:var(--tint);border:1px solid var(--rule);border-radius:5px;padding:1px 6px}
.sa-top-right{margin-left:auto;display:flex;align-items:center;gap:12px}
.sa-clock{display:flex;align-items:center;gap:10px;height:40px;padding:0 14px;border:1px solid var(--rule);border-radius:10px;background:var(--paper);font-size:13px;color:var(--ink2);white-space:nowrap}
.sa-clock b{font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.sa-clock em{font-style:normal;color:var(--muted);font-size:12px}
.sa-iconbtn{all:unset;cursor:pointer;position:relative;width:40px;height:40px;border-radius:10px;display:grid;place-items:center;border:1px solid var(--rule);background:var(--paper);color:var(--ink2);box-sizing:border-box;transition:border-color .15s,background .15s}
.sa-iconbtn:hover{border-color:#CFD8D4;background:var(--tint)}
.sa-iconbtn .dot{position:absolute;top:8px;right:9px;width:8px;height:8px;border-radius:50%;background:var(--bad);box-shadow:0 0 0 2px var(--paper)}
.sa-avatar{all:unset;cursor:pointer;width:40px;height:40px;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px;flex:none}
.sa-burger{all:unset;cursor:pointer;display:none;width:40px;height:40px;border-radius:10px;place-items:center;background:var(--paper);border:1px solid var(--rule);box-sizing:border-box}
.sa-pop{position:absolute;top:calc(100% + 8px);right:0;width:min(360px,calc(100vw - 32px));background:var(--paper);border:1px solid var(--rule);border-radius:12px;box-shadow:0 16px 40px rgba(16,32,29,.14);z-index:50;overflow:hidden;animation:saFade .12s ease-out}
.sa-pop-h{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--rule2);font-weight:700;font-size:14px}
.sa-pop-list{max-height:360px;overflow-y:auto}
.sa-pop-list button{all:unset;cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;width:100%;box-sizing:border-box;padding:10px 14px;border-bottom:1px solid var(--rule2);font-size:13px}
.sa-pop-list button:hover,.sa-pop-list button:focus-visible{background:var(--tint)}
.sa-pop-list b{font-weight:600}.sa-pop-list span{display:block;color:var(--muted);font-size:12px}
.sa-scrim{position:fixed;inset:0;background:rgba(14,27,25,.5);z-index:39}
/* page heading */
.sa-content{padding:22px clamp(16px,2.4vw,30px) 56px;max-width:1560px;width:100%}
.sa-ph{display:flex;align-items:flex-end;justify-content:space-between;gap:16px 24px;flex-wrap:wrap;margin-bottom:20px}
.sa-ph>div:first-child{flex:1 1 380px}
.sa-ph .eyebrow{font-size:13px;font-weight:600;color:var(--eyebrow);margin-bottom:2px}
.sa-ph h1{margin:0;font-size:32px;font-weight:700;letter-spacing:-.02em;line-height:1.15;color:var(--ink)}
.sa-ph p{margin:6px 0 0;color:var(--muted);font-size:14px}
.sa-ph .actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;flex:0 0 auto}
.sa-range{display:flex;align-items:center;gap:10px;height:40px;padding:0 14px;border:1px solid var(--rule);border-radius:9px;background:var(--paper);font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap}
.sa-range em{font-style:normal;font-weight:500;color:var(--muted)}
.sa-updbar{justify-content:flex-end;margin:-8px 0 14px}
/* command palette */
.sa-cmd-bg{position:fixed;inset:0;background:rgba(14,27,25,.45);z-index:80;animation:saFade .12s ease-out}
.sa-cmd{position:fixed;top:12vh;left:50%;transform:translateX(-50%);width:min(620px,calc(100vw - 32px));background:var(--paper);border-radius:14px;border:1px solid var(--rule);box-shadow:0 24px 64px rgba(16,32,29,.25);z-index:81;overflow:hidden;display:flex;flex-direction:column;max-height:70vh}
.sa-cmd-in{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--rule)}
.sa-cmd-in input{all:unset;flex:1;font-size:15px;color:var(--ink)}
.sa-cmd-in input::placeholder{color:var(--faint)}
.sa .sa-cmd-in input:focus-visible{outline:none}
.sa-cmd-in:focus-within{box-shadow:inset 0 -2px 0 var(--acc)}
.sa-cmd-res{overflow-y:auto;padding:6px 0}
.sa-cmd-grp{font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding:10px 16px 4px}
.sa-cmd-res button{all:unset;cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;width:100%;box-sizing:border-box;padding:9px 16px;font-size:13.5px}
.sa-cmd-res button[aria-selected="true"]{background:var(--acc-soft)}
.sa-cmd-res b{font-weight:600;display:block}.sa-cmd-res span{display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-cmd-foot{display:flex;gap:16px;padding:9px 16px;border-top:1px solid var(--rule2);font-size:12px;color:var(--muted)}

/* ── Dashboard ─────────────────────────────────────────────────────────── */
.db-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.db-kpi{position:relative;border-radius:var(--r);border:1px solid var(--rule);padding:18px 16px 16px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 14px;min-width:0;box-shadow:var(--sh)}
.db-kpi.k-bill{background:#F1F7F3;border-color:#DDEBE3}.db-kpi.k-scheme{background:#FDF6EF;border-color:#F3E3D2}
.db-kpi.k-cust{background:#F5F3FC;border-color:#E5E0F6}.db-kpi.k-shop{background:#F1F5FC;border-color:#DFE7F5}
.db-kpi .ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center}
.k-bill .ic{background:#DCEDE4;color:var(--bill)}.k-scheme .ic{background:#FBE5CF;color:#B8681C}
.k-cust .ic{background:#E5E0F8;color:var(--app)}.k-shop .ic{background:#DCE7F8;color:var(--info)}
.db-kpi .lbl{font-size:13.5px;font-weight:700;color:var(--ink);margin-top:2px}
.db-kpi .val{padding-right:52px;font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1.2;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;margin-top:2px}
.db-kpi .trend{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px;color:var(--muted);white-space:nowrap}
.db-kpi .sub{font-size:12.5px;color:var(--muted);margin-top:6px}
.db-kpi .sub b{color:var(--ink2);font-weight:700}
.db-kpi .spark{position:absolute;top:30px;right:16px}
.db-tp{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:700;border-radius:999px;padding:1px 8px;line-height:18px}
.db-tp.up{background:#DDF1E5;color:var(--live-ink)}.db-tp.down{background:#FBE1E1;color:var(--bad-ink)}.db-tp.flat{background:var(--rule2);color:var(--muted)}
.db-main{display:grid;grid-template-columns:minmax(0,1.85fr) minmax(0,1fr);gap:16px}
.db-chart-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:18px 18px 0}
.db-chart-h h3{margin:0;font-size:16px;font-weight:700;display:flex;gap:12px;align-items:center}
.db-chart-h h3 small{display:block;font-size:12.5px;font-weight:500;color:var(--muted);margin-top:1px}
.db-chart-h .ic,.db-card-h .ic{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:none;background:#DCEDE4;color:var(--bill)}
.db-chip{display:flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:1px solid var(--rule);border-radius:9px;font-size:13px;font-weight:600;color:var(--ink);background:var(--paper);white-space:nowrap}
.db-chart{position:relative;padding:8px 18px 16px}
.db-tip{position:absolute;pointer-events:none;background:var(--paper);border:1px solid var(--rule);border-radius:10px;box-shadow:0 8px 24px rgba(16,32,29,.12);padding:10px 12px;font-size:12.5px;min-width:170px;z-index:5;transform:translate(-50%,-100%)}
.db-tip b{display:block;font-size:13px;margin-bottom:6px;color:var(--ink)}
.db-tip div{display:flex;align-items:center;gap:8px;justify-content:space-between;color:var(--ink2)}
.db-tip div span{display:flex;align-items:center;gap:7px}
.db-tip i{width:8px;height:8px;border-radius:50%;display:inline-block}
.db-tip div em{font-style:normal;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.db-dec-h{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:16px 18px 6px}
.db-dec-h h3{margin:0;font-size:16px;font-weight:700;display:flex;align-items:center;gap:12px}
.db-dec-h .ic{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--warn-bg);color:var(--warn)}
.db-badge{font-size:12px;font-weight:700;color:var(--bad-ink);background:#FBE1E1;border-radius:7px;padding:2px 9px;white-space:nowrap}
.db-dec{padding:0 14px 10px;overflow-y:auto;max-height:330px}
.db-dec button{all:unset;cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;width:100%;box-sizing:border-box;padding:11px 4px;border-bottom:1px solid var(--rule2);border-radius:6px;transition:background .15s}
.db-dec button:last-child{border-bottom:0}
.db-dec button:hover{background:var(--tint)}
.db-dec .ring{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#FCE8E8;color:var(--bad)}
.db-dec .ring.warn{background:var(--warn-bg);color:var(--warn)}
.db-dec b{font-weight:700;font-size:13.5px;color:var(--ink)}
.db-dec .what{font-weight:500;color:var(--ink2);font-size:13.5px}
.db-dec span.why{display:block;font-size:11.5px;color:var(--muted);margin-top:1px}
.db-dec .go{color:var(--muted)}
.db-row3{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr);gap:16px}
.db-card-h{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;padding:16px 16px 0}
.db-card-h h3{margin:0;font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;white-space:nowrap}
.db-card-h .ic{width:34px;height:34px}
.db-card-h .ic.amber{background:#FBE5CF;color:#B8681C}
.db-card-b{padding:14px 16px 18px}
.db-split{display:flex;height:12px;border-radius:99px;overflow:hidden;background:var(--rule2);margin-top:4px}
.db-split i{display:block;height:100%}
.db-legend{display:flex;gap:28px;flex-wrap:wrap;margin-top:14px;font-size:13px;color:var(--ink2)}
.db-legend span{display:flex;align-items:center;gap:8px}
.db-legend i{width:10px;height:10px;border-radius:3px}
.db-legend em{font-style:normal;color:var(--muted);font-weight:600}
.db-mini{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
.db-mini .num{font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1.15;color:var(--ink)}
.db-mini small{display:block;font-size:12.5px;color:var(--muted);margin-top:6px}
.db-view{all:unset;cursor:pointer;font-size:12.5px;white-space:nowrap;font-weight:600;color:var(--ink2);display:flex;align-items:center;gap:4px}
.db-view:hover{color:var(--acc-ink)}
@media (max-width:1439px){.db-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:1280px){.db-row3{grid-template-columns:1fr 1fr}.db-row3>:first-child{grid-column:1/-1}}
@media (max-width:1100px){.db-main{grid-template-columns:1fr}}

@media (max-width:1023px){.sa-app{grid-template-columns:1fr}.sa-side{position:fixed;left:0;top:0;bottom:0;width:260px;transform:translateX(-100%);transition:transform .22s var(--ease)}.sa-side.open{transform:none}.sa-burger{display:grid}}
@media (max-width:760px){
  .sa-top{gap:8px}.sa-clock,.sa-search .ph,.sa-search .sa-kbd{display:none}.sa-search{flex:0 0 40px;width:40px;padding:0;justify-content:center}
  .sa-ph .actions{width:100%}.sa-ph .actions>*{flex:1 1 auto;min-width:0}.sa-ph .actions .sa-btn{width:100%}
  .sa-range{width:100%;min-width:0;overflow:hidden}.sa-range em{display:none}
  .db-period{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.db-period button{justify-content:center;padding:0 4px;font-size:13px}
  .db-chart-h .db-chip{display:none}
  .sa-ph h1{font-size:26px}
  .db-kpis,.db-row3{grid-template-columns:1fr}
  .db-kpi .val{font-size:26px}
  .sa-updbar{justify-content:flex-start;margin:0 0 12px;row-gap:4px}
  .sa-kpis,.sa-kpis.six{grid-template-columns:repeat(2,minmax(0,1fr));gap:0}
  .sa-kpi{padding:12px;gap:2px}
  .sa-kpis:not(.six)>.sa-kpi{flex-basis:40%}
  .sa-kpi .chip{display:none}
  .sa-kpi .lbl{white-space:normal;font-size:12px;line-height:1.3;padding-right:0}
  .sa-kpi .val{font-size:20px;white-space:normal;overflow-wrap:anywhere}
  .sa-tbl{overflow-x:visible}
  .sa-tbl table,.sa-tbl tbody{display:block;width:100%}
  .sa-tbl thead{display:none}
  .sa-tbl tbody tr{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:12px 14px;border-bottom:1px solid var(--rule2)}
  .sa-tbl tbody tr:last-child{border-bottom:0}
  .sa-tbl td{display:block;padding:0;border:0;white-space:normal;min-width:0;max-width:100%!important;text-align:left!important}
  .sa-tbl td:first-child{flex:1 1 100%}
  .sa-tbl td:empty{display:none}
  .sa-tbl td[colspan]{flex:1 1 100%}
  .sa-filters>*{flex:1 1 calc(50% - 4px)!important;min-width:0!important;max-width:none!important;width:auto!important}
  .sa-filters>.sa-in{flex-basis:100%!important}
  .sa-drawer-h{flex-wrap:wrap;padding:14px 16px}
  .sa-drawer-h>div:first-child{flex:1 1 200px;min-width:0}
  .sa-drawer-b{padding:14px 14px 28px}
}
.sa-swipe{display:none}
@media (max-width:760px){.sa-swipe{display:block;font-size:11.5px;color:var(--faint);text-align:center;margin-top:6px}}
@media (prefers-reduced-motion:reduce){.sa *{animation:none!important;transition:none!important}}
`;
