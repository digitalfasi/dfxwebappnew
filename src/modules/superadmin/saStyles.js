/*
 * DFX Control - SuperAdmin console. Light, luminous "control room": a soft
 * blue-teal field, frosted white panels, one colour per meaning (green live,
 * blue web, violet app, amber attention, red problem, teal data), figures in
 * Fira Code. Built to be read at a glance by someone who is not technical.
 */
export const SA_CSS = `
.sa{--page:#F2F5FB;--paper:#FFFFFF;--glass:rgba(255,255,255,.88);--tint:#F7F9FD;--rule:#E3E8F2;--rule2:#EEF1F7;
--ink:#0E1630;--ink2:#2E3752;--muted:#5B6480;--faint:#8A93AB;
--acc:#3563F0;--acc-ink:#2447C4;--acc-soft:#EAF0FF;--grad:linear-gradient(135deg,#3563F0 0%,#7B4DEB 100%);
--live:#10A36A;--warn:#D9820B;--bad:#E5484D;--app:#7B4DEB;--web:#3563F0;--teal:#0FA3B1;
--live-bg:#E5F7EF;--warn-bg:#FFF4E0;--bad-bg:#FDECEC;--app-bg:#F1EBFF;--teal-bg:#E2F6F8;
--sh:0 1px 2px rgba(16,24,64,.04),0 8px 24px rgba(16,24,64,.06);--r:14px;
font-family:"Instrument Sans","Segoe UI",system-ui,sans-serif;color:var(--ink);min-height:100dvh;font-size:14px;line-height:1.5;
-webkit-font-smoothing:antialiased;
background:var(--page)}
.sa *{box-sizing:border-box}
.sa .mono,.sa .fig,.sa td.r{font-family:"Fira Code",ui-monospace,Consolas,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.sa .num{font-variant-numeric:tabular-nums}
.h-live{--c:var(--live);--cb:var(--live-bg)}.h-web{--c:var(--web);--cb:var(--acc-soft)}.h-app{--c:var(--app);--cb:var(--app-bg)}
.h-warn{--c:var(--warn);--cb:var(--warn-bg)}.h-bad{--c:var(--bad);--cb:var(--bad-bg)}.h-teal{--c:var(--teal);--cb:var(--teal-bg)}
.h-ink{--c:var(--ink2);--cb:var(--rule2)}
/* top bar */
.sa-bar-top{position:sticky;top:env(safe-area-inset-top,0px);z-index:30;background:rgba(255,255,255,.82);backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--rule)}
.sa-bar-in{max-width:1500px;margin:0 auto;padding:0 clamp(16px,2.4vw,28px);height:60px;display:flex;align-items:center;gap:26px}
.sa-word{display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px;letter-spacing:-.02em;white-space:nowrap}
.sa-word i{width:32px;height:32px;border-radius:10px;background:var(--grad);display:grid;place-items:center;color:#fff;box-shadow:0 6px 16px rgba(53,99,240,.35)}
.sa-word span{font-weight:500;color:var(--faint)}
.sa-mods{display:flex;gap:4px;background:var(--tint);border:1px solid var(--rule);border-radius:12px;padding:3px}
.sa-mods button{all:unset;cursor:pointer;padding:7px 14px;border-radius:9px;font-weight:600;color:var(--muted);display:flex;align-items:center;gap:7px;transition:all .15s}
.sa-mods button:hover{color:var(--ink)}
.sa-mods button[aria-current="page"]{background:var(--paper);color:var(--acc-ink);box-shadow:0 1px 3px rgba(16,24,64,.1)}
.sa-bar-right{margin-left:auto;display:flex;align-items:center;gap:16px;font-size:13px;color:var(--muted);white-space:nowrap}
.sa-bar-right .fig{color:var(--ink);font-weight:500}
.sa-onl{display:flex;align-items:center;gap:8px;background:var(--live-bg);color:#0B7A4F;border-radius:999px;padding:5px 12px;font-weight:600}
.sa-avatar{width:32px;height:32px;border-radius:50%;background:var(--grad);color:#fff;display:grid;place-items:center;font-weight:700;font-size:12px;flex:none}
.sa-link{all:unset;cursor:pointer;color:var(--muted);font-weight:600;font-size:13px}
.sa-link:hover{color:var(--acc-ink)}
@media (max-width:860px){.sa-bar-in{height:auto;flex-wrap:wrap;gap:8px 14px;padding-block:10px}.sa-bar-right{margin-left:0;width:100%;justify-content:space-between}.sa-hide-sm{display:none}}
.sa-main{max-width:1500px;margin:0 auto;padding:18px clamp(16px,2.4vw,28px) 56px}
/* tabs */
.sa-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-bottom:14px;padding-bottom:2px}
.sa-tabs button{all:unset;cursor:pointer;white-space:nowrap;padding:8px 14px;border-radius:10px;font-weight:600;color:var(--muted);display:flex;align-items:center;gap:8px;background:var(--glass);border:1px solid var(--rule);transition:all .15s}
.sa-tabs button:hover{color:var(--ink);border-color:#CDD5E6}
.sa-tabs button[aria-selected="true"]{background:var(--grad);color:#fff;border-color:transparent;box-shadow:0 6px 16px rgba(53,99,240,.28)}
.sa-tabs .cnt{font-family:"Fira Code",monospace;font-size:11.5px;background:var(--live-bg);color:#0B7A4F;border-radius:999px;padding:0 7px;font-weight:600}
.sa-tabs button[aria-selected="true"] .cnt{background:rgba(255,255,255,.25);color:#fff}
.sa-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 14px;font-size:12.5px;color:var(--faint)}
.sa button:focus-visible,.sa input:focus-visible,.sa select:focus-visible,.sa [tabindex]:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.sa-grid{display:grid;gap:16px}
/* KPI tiles */
.sa-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
/* Six cards read as two even rows of three, never 5 + 1. */
.sa-kpis.six{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:760px){.sa-kpis.six{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:420px){.sa-kpis.six{grid-template-columns:1fr}}
.sa-kpi{position:relative;overflow:hidden;background:var(--paper);border:1px solid var(--rule);border-radius:12px;box-shadow:0 1px 2px rgba(16,24,64,.04);padding:14px 16px;display:grid;grid-template-columns:auto 1fr;gap:2px 12px;align-items:center}

.sa-kpi .chip{grid-row:1/3;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--cb,var(--acc-soft));color:var(--c,var(--acc));position:relative;z-index:1}
.sa-kpi .lbl{font-size:12.5px;color:var(--muted);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.sa-kpi .val{font-family:"Fira Code",monospace;font-size:24px;font-weight:600;letter-spacing:-.03em;line-height:1.15;color:var(--ink);position:relative;z-index:1;white-space:nowrap}
.sa-kpi .sub{grid-column:1/-1;font-size:12px;color:var(--faint);position:relative;z-index:1;margin-top:6px}
.sa-kpi.h-bad .val{color:var(--bad)}
.sa-pulse{width:8px;height:8px;border-radius:50%;background:var(--live);flex:none;animation:saPulse 2s infinite}
@keyframes saPulse{0%{box-shadow:0 0 0 0 rgba(16,163,106,.5)}70%{box-shadow:0 0 0 8px rgba(16,163,106,0)}100%{box-shadow:0 0 0 0 rgba(16,163,106,0)}}
@media (prefers-reduced-motion:reduce){.sa-drawer,.sa-drawer-bg{animation:none}}
/* panels */
.sa-card{background:var(--paper);border:1px solid var(--rule);border-radius:12px;box-shadow:0 1px 2px rgba(16,24,64,.04);min-width:0;display:flex;flex-direction:column}
.sa-card-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px 0;flex-wrap:wrap}
.sa-card-h h3{margin:0;font-size:14.5px;font-weight:650;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}
.sa-card-h h3 .ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--cb,var(--acc-soft));color:var(--c,var(--acc))}
.sa-card-h small{color:var(--faint);font-size:12.5px}
.sa-card-b{padding:12px 16px 16px;flex:1;min-height:0}
.sa-fill{position:relative;flex:1;min-height:300px}
.sa-fill>.in{position:absolute;inset:0;overflow-y:auto;padding:4px 16px 12px}
/* badges */
.sa-pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;white-space:nowrap;border-radius:999px;padding:2px 10px;line-height:18px;background:var(--rule2);color:var(--muted)}
.sa-pill i{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block;flex:none}
.t-live{background:var(--live-bg);color:#0B7A4F}.t-warn{background:var(--warn-bg);color:#9A5A04}.t-bad{background:var(--bad-bg);color:#B42A2F}
.t-pri{background:var(--acc-soft);color:var(--acc-ink)}.t-app{background:var(--app-bg);color:#5B32C4}.t-sky{background:var(--teal-bg);color:#0A7E89}
.t-mute{background:var(--rule2);color:var(--muted)}
.sa-feed .t-live,.sa-feed .t-warn,.sa-feed .t-bad,.sa-feed .t-mute{background:none}
/* tables */
.sa-tbl{overflow-x:auto}
.sa-tbl table{width:100%;border-collapse:collapse;font-size:13.5px}
.sa-tbl th{text-align:left;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);font-weight:600;padding:10px 14px;border-bottom:1px solid var(--rule);white-space:nowrap;background:rgba(247,249,253,.7)}
.sa-tbl td{padding:10px 14px;border-bottom:1px solid var(--rule2);vertical-align:middle;white-space:nowrap}
.sa-tbl td.wrap{white-space:normal}
.sa-tbl tr:last-child td{border-bottom:0}
.sa-tbl tbody tr.click{cursor:pointer;transition:background .12s}
.sa-tbl tbody tr.click:hover{background:#F2F6FF}
.sa-tbl div.who{display:flex;align-items:center;gap:10px}
.sa-tbl div.who>div{min-width:0}
.sa-tbl .who b{display:block;font-weight:600;color:var(--ink)}
.sa-tbl .who span:not(.sa-ini){display:block;font-size:12px;color:var(--muted)}
.sa-ini{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:11.5px;font-weight:700;flex:none;background:var(--cb,var(--acc-soft));color:var(--c,var(--acc))}
.sa-tbl .r{text-align:right}
.sa-tbl td.r{font-size:13px}
.sa-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 14px;border-bottom:1px solid var(--rule)}
.sa-in,.sa-sel{height:38px;border:1px solid var(--rule);border-radius:10px;background:var(--paper);padding:0 12px;font:inherit;font-size:13.5px;color:var(--ink);min-width:0}
.sa-in{min-width:220px;flex:1 1 220px;max-width:340px}
.sa-in:hover,.sa-sel:hover{border-color:#CDD5E6}
.sa-in:focus,.sa-sel:focus{border-color:var(--acc);outline:none;box-shadow:0 0 0 3px var(--acc-soft)}
.sa-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 16px;border-radius:10px;font-weight:600;font-size:13.5px;background:var(--grad);color:#fff;box-shadow:0 6px 16px rgba(53,99,240,.25);transition:filter .15s,transform .1s}
.sa-btn:hover{filter:brightness(1.07)}.sa-btn:active{transform:scale(.98)}
.sa-btn.ghost{background:var(--paper);color:var(--ink);border:1px solid var(--rule);box-shadow:none}
.sa-btn.ghost:hover{border-color:#CDD5E6;filter:none;background:var(--tint)}
.sa-btn.danger{background:var(--bad);box-shadow:0 6px 16px rgba(229,72,77,.25)}
.sa-btn.sm{height:32px;padding:0 12px;font-size:12.5px}
.sa-btn[disabled]{opacity:.45;cursor:not-allowed;pointer-events:none}
.sa-empty{padding:28px 16px;text-align:center;color:var(--muted);font-size:13.5px}
.sa-empty b{display:block;color:var(--ink);margin-bottom:3px}
.sa-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-top:1px solid var(--rule);color:var(--muted);font-size:12.5px;flex-wrap:wrap}
.sa-bar{height:8px;border-radius:99px;background:var(--rule2);overflow:hidden}
.sa-bar>i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#3563F0,#0FA3B1)}
.sa-bar.warn>i{background:linear-gradient(90deg,#F2B33D,#D9820B)}.sa-bar.bad>i{background:linear-gradient(90deg,#F27A6B,#E5484D)}
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
.sa-feed .txt{font-size:13.5px;min-width:0}.sa-feed .txt b{font-weight:600}.sa-feed .txt span{display:block;color:var(--faint);font-size:12px}
.sa-feed time{font-size:12px;color:var(--faint);white-space:nowrap}
.sa-legend{display:flex;gap:14px;font-size:12px;color:var(--muted);flex-wrap:wrap}
.sa-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
/* health banner */
.sa-health{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;border-radius:var(--r);padding:14px 18px;border:1px solid;box-shadow:var(--sh)}
.sa-health.ok{background:linear-gradient(100deg,#E5F7EF,#F3FBF7 60%,#fff);border-color:#BFE8D4}
.sa-health.warn{background:linear-gradient(100deg,#FFF1D9,#FFF8EC 60%,#fff);border-color:#F4D9A8}
.sa-health.bad{background:linear-gradient(100deg,#FDE3E3,#FEF1F1 60%,#fff);border-color:#F4C2C2}
.sa-health .orb{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;color:#fff}
.sa-health.ok .orb{background:linear-gradient(135deg,#16B978,#0B8E5B);box-shadow:0 0 0 6px rgba(16,163,106,.15)}
.sa-health.warn .orb{background:linear-gradient(135deg,#F2B33D,#D9820B);box-shadow:0 0 0 6px rgba(217,130,11,.15)}
.sa-health.bad .orb{background:linear-gradient(135deg,#F27A6B,#E5484D);box-shadow:0 0 0 6px rgba(229,72,77,.15)}
.sa-health b{font-size:16.5px;letter-spacing:-.01em;display:block}
.sa-health ul{margin:4px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 18px;font-size:13px;color:var(--ink2)}
.sa-health li::before{content:"•";margin-right:6px;color:var(--faint)}
@media (max-width:700px){.sa-health{grid-template-columns:auto 1fr}.sa-health>.side{grid-column:1/-1}}
/* system map */
.sa-map text{font-family:"Instrument Sans",system-ui,sans-serif}
.sa-map .v{font-family:"Fira Code",monospace;font-weight:600}
.sa-map .link{fill:none;stroke-width:2.5;stroke-linecap:round}
.sa-map .link.idle{stroke-dasharray:4 7;opacity:.55}
.sa-map .flow{animation:saDash 1.4s linear infinite}
@keyframes saDash{to{stroke-dashoffset:-22}}
/* drawer & forms */
.sa-drawer-bg{position:fixed;inset:0;background:rgba(14,22,48,.38);backdrop-filter:blur(2px);z-index:60;animation:saFade .16s ease-out}
.sa-drawer{position:fixed;top:0;right:0;bottom:0;width:min(800px,100vw);background:var(--page);z-index:61;box-shadow:-18px 0 50px rgba(14,22,48,.16);display:flex;flex-direction:column;animation:saSlide .22s cubic-bezier(.2,.8,.2,1)}
.sa-drawer-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 22px;background:var(--paper);border-bottom:1px solid var(--rule)}
.sa-drawer-h h2{margin:0;font-size:19px;letter-spacing:-.02em;font-weight:700}
.sa-drawer-h p{margin:2px 0 0;color:var(--muted);font-size:13px}
.sa-drawer-b{overflow-y:auto;padding:18px 22px 40px;display:grid;gap:16px;align-content:start}
@keyframes saFade{from{opacity:0}to{opacity:1}}
@keyframes saSlide{from{transform:translateX(32px);opacity:.5}to{transform:none;opacity:1}}
.sa-x{all:unset;cursor:pointer;width:38px;height:38px;border-radius:10px;display:grid;place-items:center;color:var(--muted);flex:none}
.sa-x:hover{background:var(--tint);color:var(--ink)}
.sa-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media (max-width:620px){.sa-form{grid-template-columns:1fr}}
.sa-field{display:grid;gap:5px;align-content:start}.sa-field.full{grid-column:1/-1}
.sa-field label{font-size:12.5px;font-weight:600;color:var(--ink2)}
.sa-field label em{color:var(--bad);font-style:normal}
.sa-field .help{font-size:12px;color:var(--faint)}
.sa-field .err{font-size:12px;color:var(--bad);font-weight:600}
.sa-field .sa-in,.sa-field .sa-sel{max-width:none;width:100%;height:40px}
.sa-fs{border:1px solid var(--rule);border-radius:var(--r);background:var(--paper);padding:14px 16px 16px;margin:0}
.sa-fs legend{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--acc-ink);font-weight:700;padding:0 6px}
.sa-alert{border-radius:12px;padding:10px 14px;font-size:13.5px;display:flex;gap:10px;align-items:flex-start;border:1px solid}
.sa-alert svg{flex:none;margin-top:1px}
.sa-alert.bad{background:var(--bad-bg);color:#8E1F24;border-color:#F4C2C2}.sa-alert.ok{background:var(--live-bg);color:#0A5E3C;border-color:#BFE8D4}
.sa-alert.warn{background:var(--warn-bg);color:#7A4503;border-color:#F4D9A8}.sa-alert.info{background:var(--acc-soft);color:var(--acc-ink);border-color:#CBD8FB}
.sa-secret{font-family:"Fira Code",monospace;background:var(--tint);border:1px dashed #B9C3DA;border-radius:10px;padding:9px 12px;display:flex;justify-content:space-between;gap:10px;align-items:center;overflow-wrap:anywhere;font-size:13px}
.sa-skel{background:linear-gradient(90deg,var(--rule2) 25%,#F8FAFD 50%,var(--rule2) 75%);background-size:200% 100%;animation:saShim 1.2s infinite;border-radius:8px}
@keyframes saShim{from{background-position:200% 0}to{background-position:-200% 0}}
.sa-muted{color:var(--muted)}.sa-dim{color:var(--faint)}
.sa-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.sa-json{font-family:"Fira Code",monospace;font-size:12px;background:var(--tint);border:1px solid var(--rule2);border-radius:10px;padding:8px 10px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;margin:6px 0 0;color:var(--ink2)}
.sa-log{font-family:"Fira Code",monospace;font-size:12px;line-height:1.55;background:#0F1530;color:#D7DDF0;border-radius:10px;padding:10px 12px;max-height:300px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.sa-log .e{color:#FF9D9D}.sa-log .w{color:#FFD27A}
.sa-seg{display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:2px}
.sa-seg button{all:unset;cursor:pointer;padding:7px 14px;border-radius:9px;font-weight:600;font-size:13px;color:var(--muted);background:var(--paper);border:1px solid var(--rule);display:flex;align-items:center;gap:7px}
.sa-seg button:hover{color:var(--ink);border-color:#CDD5E6}
.sa-seg button[aria-selected="true"]{background:#0A1D3A;color:#fff;border-color:#0A1D3A}
.sa-seg .cnt{font-family:"Fira Code",monospace;font-size:11px;border-radius:999px;padding:0 7px;background:var(--live-bg);color:#0B7A4F}
.sa-seg .cnt.bad{background:var(--bad);color:#fff}
.sa-dev{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:1000px){.sa-dev{grid-template-columns:1fr}}
.sa-dev>.sa-card:first-child{position:sticky;top:76px;max-height:calc(100dvh - 96px)}
.sa-dev-list{overflow-y:auto;padding:6px;display:grid;gap:1px;align-content:start;flex:1;min-height:0}
.sa-dev-list button{all:unset;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;font-size:13px;color:var(--ink2)}
.sa-dev-list button .mono{font-size:12.5px}
.sa-dev-list button em{font-style:normal;font-family:"Fira Code",monospace;font-size:11.5px;color:var(--faint);flex:none}
.sa-dev-list button:hover{background:var(--tint)}
.sa-dev-list button[aria-current="true"]{background:var(--acc-soft);color:var(--acc-ink);font-weight:600}
.sa-crumbs{display:flex;flex-wrap:wrap;gap:2px;padding:10px 14px;border-bottom:1px solid var(--rule2);font-family:"Fira Code",monospace;font-size:12px;color:var(--faint)}
.sa-crumbs button{all:unset;cursor:pointer;color:var(--acc-ink)}.sa-crumbs button:hover{text-decoration:underline}
.sa-grid-tbl th{position:sticky;top:0;z-index:1;background:#F7F9FD}
.sa-grid-tbl{max-height:calc(100dvh - 300px)}
.sa-code{font-family:"Fira Code",monospace;font-size:12.5px;line-height:1.6;overflow:auto;max-height:calc(100dvh - 260px);background:#FBFCFE;border-radius:0 0 12px 12px;padding:8px 0}
.sa-code>div{display:grid;grid-template-columns:58px 1fr;white-space:pre}
.sa-code>div.hit{background:#FFF4D6}
.sa-code span{color:#A3ACC2;text-align:right;padding-right:14px;user-select:none;border-right:1px solid var(--rule2)}
.sa-code code{padding-left:14px;color:var(--ink2)}
/* railway: signals run along the track like a train */
.sa-map .bed{fill:none;stroke:#EDF1F8;stroke-width:12;stroke-linecap:round}
.sa-map .ties{fill:none;stroke:#D5DCEA;stroke-width:12;stroke-dasharray:2 9}
.sa-map .rail{fill:none;stroke-width:2;stroke-linecap:round}
.sa-map .train{fill:none;stroke-width:5;stroke-linecap:round;animation:saTrain var(--d,1.6s) linear infinite,saBlink .7s ease-in-out infinite alternate}
.sa-map .train.back{stroke-width:3;animation-direction:reverse,alternate;opacity:.7}
@keyframes saTrain{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
@keyframes saBlink{from{opacity:1}to{opacity:.45}}
.sa-sect{display:flex;align-items:center;gap:10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:6px 0 -4px}
.sa-sect::after{content:"";flex:1;height:1px;background:var(--rule)}
/* app shell: navy sidebar (as in the original DFX super admin), light work area */
.sa-app{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:100dvh}
.sa-side{background:#0A1D3A;color:#CBD5E1;display:flex;flex-direction:column;position:sticky;top:0;height:100dvh;z-index:40}
.sa-side-brand{display:flex;align-items:center;gap:12px;padding:20px 20px 18px;border-bottom:1px solid rgba(255,255,255,.07)}
.sa-side-brand .mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3563F0,#7B4DEB);display:grid;place-items:center;color:#fff;box-shadow:0 6px 18px rgba(53,99,240,.45)}
.sa-side-brand b{display:block;color:#fff;font-size:15px;letter-spacing:-.01em}
.sa-side-brand span{display:block;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#64748B;font-weight:600;margin-top:1px}
.sa-side-nav{flex:1;overflow-y:auto;padding:14px 12px;display:grid;align-content:start;gap:2px}
.sa-side-nav .grp{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#64748B;font-weight:700;padding:4px 12px 8px}
.sa-side-nav .item,.sa-side-nav .subitem{all:unset;cursor:pointer;display:flex;align-items:center;gap:12px;border-radius:9px;color:#CBD5E1;font-weight:500;transition:background .15s,color .15s;border-left:3px solid transparent}
.sa-side-nav .item{padding:10px 12px;font-size:13.5px}
.sa-side-nav .item:hover,.sa-side-nav .subitem:hover{background:rgba(255,255,255,.05);color:#fff}
.sa-side-nav .item.on-parent{color:#fff}
.sa-side-nav .item[aria-current="page"],.sa-side-nav .subitem[aria-current="page"]{background:#1E4EAF;color:#fff;border-left-color:#D4AF37}
.sa-side-nav .item .live{margin-left:auto;font-style:normal;font-family:"Fira Code",monospace;font-size:11.5px;color:#7CE3B5;background:rgba(16,163,106,.16);border-radius:999px;padding:1px 8px;display:flex;align-items:center;gap:6px}
.sa-side-nav .item .live i{width:6px;height:6px;border-radius:50%;background:#34D399;box-shadow:0 0 0 0 rgba(52,211,153,.6);animation:saPulse 2s infinite}
.sa-side-nav .chev{transition:transform .2s;opacity:.7}.sa-side-nav .chev.up{transform:rotate(180deg)}
.sa-side-nav .sub{display:grid;gap:2px;margin:2px 0 6px 20px;padding-left:10px;border-left:1px solid rgba(255,255,255,.08)}
.sa-side-nav .subitem{padding:8px 10px;font-size:13px}
.sa-side-nav .subitem svg{opacity:.75}
.sa-side-foot{display:flex;align-items:center;gap:10px;padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)}
.sa-side-foot .av{width:34px;height:34px;border-radius:50%;background:#1E4EAF;color:#fff;display:grid;place-items:center;font-weight:700;font-size:12px;flex:none}
.sa-side-foot .me{min-width:0;flex:1}
.sa-side-foot .me b{display:block;color:#fff;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-side-foot .me span{display:block;font-size:11.5px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-side-foot .out{all:unset;cursor:pointer;width:34px;height:34px;border-radius:8px;display:grid;place-items:center;color:#94A3B8}
.sa-side-foot .out:hover{background:rgba(255,255,255,.07);color:#fff}
.sa-body{min-width:0}
.sa-head{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;padding:12px clamp(16px,2.4vw,28px);background:rgba(242,245,251,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--rule)}
.sa-head .ttl{flex:1;min-width:0}
.sa-head .crumb{font-size:11.5px;color:var(--faint);font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.sa-head h1{margin:0;font-size:20px;letter-spacing:-.02em;font-weight:700;line-height:1.25}
.sa-head .clock{display:flex;align-items:baseline;gap:8px;font-size:12.5px;color:var(--muted);background:var(--paper);border:1px solid var(--rule);border-radius:10px;padding:7px 12px;white-space:nowrap}
.sa-head .clock b{color:var(--ink);font-weight:500;font-size:13px}
.sa-head-sub{margin:0 0 14px;color:var(--muted);font-size:13px}
.sa-content{padding:16px clamp(16px,2.4vw,28px) 56px;max-width:1520px}
.sa-burger{all:unset;cursor:pointer;display:none;width:38px;height:38px;border-radius:10px;place-items:center;background:var(--paper);border:1px solid var(--rule)}
.sa-scrim{position:fixed;inset:0;background:rgba(10,29,58,.5);z-index:39}
@media (max-width:980px){.sa-app{grid-template-columns:1fr}.sa-side{position:fixed;left:0;top:0;bottom:0;width:270px;transform:translateX(-100%);transition:transform .22s}.sa-side.open{transform:none}.sa-burger{display:grid}.sa-hide-sm{display:none}}
`;
