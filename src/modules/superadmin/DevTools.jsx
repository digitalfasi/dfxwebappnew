"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/_shared/apiClient";
import { bytes, fmtDateTime } from "@/modules/superadmin/saService";
import { Card, Pill, Icon, Empty, Skel, Pager, usePoll } from "@/modules/superadmin/saUi";

const api = async (path) => (await apiClient.get(`/superadmin/monitor${path}`, { auth: true })).data;

// ── Database explorer (read-only) ───────────────────────────────────────
export function DataExplorer() {
  const list = usePoll(() => api("/data/tables"), [], { live: false });
  const [filter, setFilter] = useState("");
  const [table, setTable] = useState("");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [sort, setSort] = useState({ col: "", desc: true });
  const [open, setOpen] = useState(null);
  useEffect(() => { const t = setTimeout(() => setQd(q), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); setOpen(null); }, [table, qd, sort.col, sort.desc]);
  useEffect(() => { if (!table && list.data?.tables?.length) setTable(list.data.tables.find((t) => t.name === "users")?.name || list.data.tables[0].name); }, [list.data, table]);
  const rows = usePoll(() => (table ? api(`/data/tables/${encodeURIComponent(table)}?page=${page}&limit=50${qd ? `&q=${encodeURIComponent(qd)}` : ""}${sort.col ? `&sort=${encodeURIComponent(sort.col)}&desc=${sort.desc}` : ""}`) : Promise.resolve(null)),
    [table, page, qd, sort.col, sort.desc], { live: false });
  const tables = (list.data?.tables || []).filter((t) => !filter || t.name.includes(filter.toLowerCase()));
  const d = rows.data;

  return (
    <div className="sa-dev">
      <Card title="Tables" icon="db" hue="teal" pad={false} right={<small>{list.data?.tables?.length ?? "…"}</small>}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--rule2)" }}>
          <input className="sa-in" style={{ maxWidth: "none", width: "100%", minWidth: 0 }} placeholder="Find a table" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a table" />
        </div>
        <div className="sa-dev-list">
          {tables.map((t) => (
            <button key={t.name} aria-current={t.name === table ? "true" : undefined} onClick={() => setTable(t.name)}>
              <span className="mono">{t.name}</span><em>{Number(t.rows).toLocaleString("en-IN")}</em>
            </button>
          ))}
        </div>
      </Card>

      <Card title={table || "Pick a table"} icon="list" hue="web" pad={false}
        right={d && <small>{d.total.toLocaleString("en-IN")} rows · {d.columns.length} columns · read-only{d.columns.some((c) => c.hidden) ? " · secrets hidden" : ""}</small>}>
        <div className="sa-filters">
          <input className="sa-in" placeholder="Search every column" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rows" />
          {d && <span className="sa-dim" style={{ fontSize: 12.5 }}>sorted by <b className="mono">{d.sort}</b> {d.desc ? "newest first" : "oldest first"} · click a header to sort</span>}
        </div>
        {rows.error ? <div className="sa-card-b"><div className="sa-alert bad"><Icon name="alert" />{rows.error}</div></div>
          : !d ? <div className="sa-card-b"><Skel h={200} /></div>
          : !d.rows.length ? <Empty title="No rows">{qd ? "Nothing matches that search." : "This table is empty."}</Empty> : (
          <div className="sa-tbl sa-grid-tbl"><table>
            <thead><tr>{d.columns.map((c) => (
              <th key={c.name} onClick={() => setSort((s) => ({ col: c.name, desc: s.col === c.name ? !s.desc : true }))} style={{ cursor: "pointer" }} title={c.type}>
                {c.name}{d.sort === c.name ? (d.desc ? " ↓" : " ↑") : ""}{c.hidden ? " · hidden" : ""}
              </th>))}</tr></thead>
            <tbody>{d.rows.map((r, i) => (
              <tr key={i} className="click" onClick={() => setOpen(open === i ? null : i)}>
                {d.columns.map((c) => <Cell key={c.name} v={r[c.name]} hidden={c.hidden} full={open === i} />)}
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {d && <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}
      </Card>
    </div>
  );
}

function Cell({ v, hidden, full }) {
  if (hidden && v != null) return <td><Pill tone="mute">hidden</Pill></td>;
  if (v == null) return <td className="sa-dim mono">null</td>;
  if (typeof v === "boolean") return <td><Pill tone={v ? "live" : "mute"}>{String(v)}</Pill></td>;
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  const iso = /^\d{4}-\d{2}-\d{2}T/.test(s);
  return <td className={`mono${full ? " wrap" : ""}`} title={s} style={{ fontSize: 12, maxWidth: full ? 420 : 260, overflow: "hidden", textOverflow: "ellipsis" }}>
    {iso ? fmtDateTime(s) : s}</td>;
}

