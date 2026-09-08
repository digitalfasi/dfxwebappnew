import { useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { promotionService, promotionStatus } from "../services/promotionService";

const STATUS_TONE = { Active: "success", Scheduled: "info", Expired: "neutral", Disabled: "neutral" };

export default function PromotionBanners({ onNavigate, setEditingPromo }) {
  const scope = useRef(null);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  usePageMotion(scope, [loading]);
  usePressFeedback(scope);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setPromotions(await promotionService.getAdminPromotions());
    } catch (err) {
      setLoadError(err?.message || "Could not load promotions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Only Image-Only banners are supported now. Create goes straight to the form.
  const openCreate = () => { setEditingPromo(null); onNavigate("promotion-create"); };
  const handleEdit = (p) => { setEditingPromo(p); onNavigate("promotion-create"); };

  const toggleEnabled = async (p) => {
    if (busyId) return;
    setBusyId(p.id);
    try {
      await promotionService.updatePromotion(p.id, { isActive: !p.isActive });
      toast(p.isActive ? "Promotion disabled" : "Promotion enabled");
      await load();
    } catch (err) {
      toast(err?.message || "Could not update promotion");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (p) => {
    if (busyId) return;
    setBusyId(p.id);
    try {
      await promotionService.deletePromotion(p.id);
      toast("Promotion deleted");
      await load();
    } catch (err) {
      toast(err?.message || "Could not delete promotion");
    } finally {
      setBusyId(null);
    }
  };

  // Highest priority first (backend already sorts; keep stable client-side too).
  const rows = [...promotions].sort((a, b) => b.priority - a.priority);

  return (
    <div ref={scope} className="mx-auto max-w-[1100px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Promotion Banners</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">Create and manage promotional banners shown to customers on app and web.</p>
        </div>
        <Button size="sm" className="bg-accent hover:bg-accent-strong shrink-0" onClick={openCreate}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Create Banner
        </Button>
      </div>

      <Card data-motion="reveal" className="mt-6 overflow-hidden">
        <div className="border-b border-line px-6 py-4"><h3 className="text-sm font-extrabold">Promotion list</h3></div>
        <CardContent className="auto-fade-scroll overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-3">
                <th className="!pl-6">Title</th><th>Priority</th><th>Active Window</th><th>Status</th><th className="!pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const status = promotionStatus(p);
                return (
                  <tr key={p.id} className="border-b border-line-soft align-middle last:border-0 hover:bg-canvas/60 transition-colors [&>td]:px-3 [&>td]:py-3.5">
                    <td className="!pl-6">
                      <div className="font-bold">{p.title}</div>
                      {p.subtitle && <div className="text-xs text-muted">{p.subtitle}</div>}
                    </td>
                    <td className="num font-mono text-xs">{p.priority}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-muted">{p.startDate || "—"} → {p.endDate || "—"}</td>
                    <td><Badge tone={STATUS_TONE[status]} dot>{status}</Badge></td>
                    <td className="!pr-6 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(p)}>Edit</Button>
                        <Button size="sm" variant={p.isActive ? "outline" : "default"} className={p.isActive ? "" : "bg-accent hover:bg-accent-strong"} disabled={busyId === p.id} onClick={() => toggleEnabled(p)}>{p.isActive ? "Disable" : "Enable"}</Button>
                        <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => handleDelete(p)} className="text-danger hover:bg-danger-soft">Delete</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && <div className="px-6 py-12 text-center text-sm font-semibold text-muted">Loading promotions…</div>}
          {!loading && loadError && (
            <div className="px-6 py-12 text-center">
              <div className="font-bold text-danger">Couldn’t load promotions</div>
              <p className="mt-1 text-sm text-muted">{loadError}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button>
            </div>
          )}
          {!loading && !loadError && rows.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted">No promotions yet. Create your first banner.</div>
          )}
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted">Separate features: WhatsApp campaigns · SMS campaigns · Email campaigns</p>
    </div>
  );
}
