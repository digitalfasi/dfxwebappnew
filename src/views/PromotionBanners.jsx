import { useRef } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";

export default function PromotionBanners({ onNavigate, promotions, setPromotions, setEditingPromo }) {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const openCreate = () => {
    setEditingPromo(null);
    onNavigate("promotion-create");
  };

  const handleEdit = (p) => {
    setEditingPromo(p);
    onNavigate("promotion-create");
  };

  const toggleEnabled = (id) => {
    setPromotions(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled, status: !p.enabled ? "Active" : "Disabled" } : p));
  };

  const handleDelete = (id) => {
    setPromotions(prev => prev.filter(p => p.id !== id));
    toast("Promotion deleted");
  };

  return (
    <div ref={scope} className="mx-auto max-w-[1100px]">
      {/* Header */}
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

      {/* Promotion list — next page is for creation, list stays here */}
      <Card data-motion="reveal" className="mt-6 overflow-hidden">
        <div className="border-b border-line px-6 py-4"><h3 className="text-sm font-extrabold">Promotion list</h3></div>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Title</th><th className="py-3">Priority</th><th className="py-3">Active Window</th><th className="py-3">Status</th><th className="py-3 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {promotions.sort((a,b)=>a.priority-b.priority).map(p => (
                <tr key={p.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                  <td className="px-6 py-3.5 font-bold">{p.title}</td>
                  <td className="py-3.5 font-mono text-xs">{p.priority}</td>
                  <td className="py-3.5 font-mono text-xs text-muted">{p.start} → {p.end}</td>
                  <td className="py-3.5"><Badge tone={p.enabled ? "success" : "neutral"} dot>{p.status}</Badge></td>
                  <td className="py-3.5 pr-6 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(p)}>Edit</Button>
                      <Button size="sm" variant={p.enabled ? "outline" : "default"} className={p.enabled ? "" : "bg-accent hover:bg-accent-strong"} onClick={() => toggleEnabled(p.id)}>{p.enabled ? "Disable" : "Enable"}</Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(p.id)} className="text-danger hover:bg-danger-soft">Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {promotions.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-muted">No promotions yet</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted">Separate features: WhatsApp campaigns · SMS campaigns · Email campaigns</p>
    </div>
  );
}
