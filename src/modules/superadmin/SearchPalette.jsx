"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { saService } from "@/modules/superadmin/saService";
import { Icon } from "@/modules/superadmin/saUi";
import { openShop } from "@/modules/superadmin/decisions";

// Ctrl+K search across every shop: shops, people and bills (read-only).
const GROUPS = [
  { k: "shops", label: "Shops", icon: "store" },
  { k: "people", label: "People", icon: "users" },
  { k: "bills", label: "Bills", icon: "doc" },
];

function openHit(h) {
  if (h.kind === "person") window.location.hash = `#/control/monitor/people?person=${encodeURIComponent(h.id)}`;
  else openShop(h.tenant_id || h.id);
}

export default function SearchPalette({ onClose }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(0);
  const input = useRef(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); setErr(null); return undefined; }
    let alive = true;
    setBusy(true);
    const t = setTimeout(async () => {
      try { const r = await saService.search(term); if (alive) { setRes(r); setErr(null); setSel(0); } }
      catch (e) { if (alive) setErr(e?.message || "Search failed."); }
      finally { if (alive) setBusy(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const flat = useMemo(() => (res ? GROUPS.flatMap((g) => res[g.k] || []) : []), [res]);
  const pick = (h) => { onClose(); openHit(h); };
  const onKey = (e) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter" && flat[sel]) pick(flat[sel]);
  };

  let i = -1;
  return (
    <>
      <div className="sa-cmd-bg" onClick={onClose} />
      <div className="sa-cmd" role="dialog" aria-modal="true" aria-label="Search DFX">
        <div className="sa-cmd-in">
          <Icon name="search" size={18} style={{ color: "var(--muted)" }} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search shops, people, phone numbers or bill numbers…" aria-label="Search"
            role="combobox" aria-expanded={!!flat.length} aria-controls="sa-cmd-list" />
          <span className="sa-kbd"><kbd>Esc</kbd></span>
        </div>
        <div className="sa-cmd-res" id="sa-cmd-list" role="listbox">
          {q.trim().length < 2 ? <div className="sa-empty" style={{ margin: 12 }}><b>Type at least 2 letters</b>A shop name, a person&apos;s name, email or phone, or a bill number.</div>
            : err ? <div className="sa-alert bad" style={{ margin: 12 }}><Icon name="alert" />{err}</div>
            : !res ? <div className="sa-empty" style={{ margin: 12 }}>{busy ? "Searching…" : ""}</div>
            : !flat.length ? <div className="sa-empty" style={{ margin: 12 }}><b>Nothing found</b>No shop, person or bill matches &ldquo;{res.query}&rdquo;.</div>
            : GROUPS.map((g) => (res[g.k] || []).length ? (
              <div key={g.k}>
                <div className="sa-cmd-grp">{g.label}</div>
                {res[g.k].map((h) => {
                  i += 1;
                  const idx = i;
                  return (
                    <button key={`${h.kind}-${h.id}`} role="option" aria-selected={sel === idx}
                      onMouseEnter={() => setSel(idx)} onClick={() => pick(h)}>
                      <Icon name={g.icon} size={16} style={{ color: "var(--muted)" }} />
                      <div style={{ minWidth: 0 }}><b>{h.title}</b><span>{h.subtitle}</span></div>
                      <Icon name="arrow" size={15} style={{ color: "var(--faint)" }} />
                    </button>
                  );
                })}
              </div>
            ) : null)}
        </div>
        <div className="sa-cmd-foot"><span>↑ ↓ to move</span><span>Enter to open</span><span>Esc to close</span></div>
      </div>
    </>
  );
}
