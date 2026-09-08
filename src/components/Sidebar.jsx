import { useState } from "react";
import { cn } from "../lib/utils";
import { useAuth } from "../context/AuthContext";

const ROLE_LABEL = { admin: "Admin", superadmin: "Super Admin", customer: "Customer" };
function roleText(u) {
  return u?.backendRole || ROLE_LABEL[u?.role] || (u?.role ? u.role : "");
}
const Icon = ({ d, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className={cn("h-[18px] w-[18px] shrink-0", p.className)}>
    {d}
  </svg>
);

export const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", name: "Dashboard", icon: <Icon d={<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>} /> },
      { id: "gold-rate", name: "Gold Rate", icon: <Icon d={<><path d="M6 3h12l4 6-10 12L2 9l4-6z" /><path d="M2 9h20" /></>} /> },
    ],
  },
  {
    label: "",
    items: [
      { id: "customers", name: "Customers", icon: <Icon d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>} /> },
    ],
  },
  {
    label: "Plans",
    collapsible: true,
    headerIcon: <Icon d={<><circle cx="8" cy="8" r="5" /><circle cx="15" cy="12" r="3" /><path d="M8 13c1.5 1.5 3.5 1.5 5 0" /></>} />,
    items: [
      { id: "schemes", name: "Schemes", icon: <Icon d={<><circle cx="8" cy="8" r="5" /><circle cx="15" cy="12" r="3" /><path d="M8 13c1.5 1.5 3.5 1.5 5 0" /></>} /> },
      { id: "scheme-management", name: "Enrollment Management", icon: <Icon d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="3" /><path d="M18 8a2.5 2.5 0 0 1 2.5 2.5V12" /><circle cx="18" cy="5" r="1.5" /></>} /> },
    ],
  },
  {
    label: "Procurement",
    collapsible: true,
    headerIcon: <Icon d={<><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /></>} />,
    items: [
      { id: "inventory", name: "Inventory", icon: <Icon d={<><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /></>} /> },
      { id: "vendors", name: "Purchase History", icon: <Icon d={<><path d="M8 2v4M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /></>} /> },
    ],
  },
  {
    label: "Billing",
    collapsible: true,
    headerIcon: <Icon d={<><path d="M4 4h16v16l-3-2-3 2-3-2-3 2z" /><path d="M8 9h8M8 13h5" /></>} />,
    items: [
      { id: "new-sale", name: "New Sale", icon: <Icon d={<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 12h8M12 8v8" /><path d="M3 10h18" /></>} /> },
      { id: "sales-history", name: "Sales History", icon: <Icon d={<><path d="M8 2v4M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /></>} /> },
    ],
  },
  {
    label: "",
    items: [
      { id: "payments", name: "Payments", icon: <Icon d={<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 13a2 2 0 1 0 2 2 2 2 0 0 0-2-2z" /></>} /> },
    ],
  },
  {
    label: "",
    items: [
      { id: "catalogue", name: "Catalogue Studio", icon: <Icon d={<><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /></>} /> },
      { id: "marketing", name: "Marketing", icon: <Icon d={<><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>} /> },
      { id: "reports", name: "Reports & Analytics", icon: <Icon d={<><path d="M3 17L9 11l4 4 8-8" /><path d="M14 7h7v7" /></>} /> },
    ],
  },
  {
    label: "",
    items: [
      { id: "branches", name: "Branches", icon: <Icon d={<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>} /> },
      { id: "staff-users", name: "Staff Users", icon: <Icon d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 11a3 3 0 0 0-3 3 3 3 0 0 0-3-3 3 3 0 0 1 3-3 3 3 0 0 1 3 3z" /></>} /> },
    ],
  },
  {
    label: "",
    items: [
      { id: "support", name: "Support", icon: <Icon d={<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10A15 15 0 0 1 12 2z" /></>} /> },
      { id: "notifications", name: "Notifications", icon: <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>} /> },
      { id: "settings", name: "Settings", icon: <Icon d={<><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></>} /> },
    ],
  },
];

export default function Sidebar({ page, onNavigate, open, onClose, collapsed = false, onToggleCollapse }) {
  const { user, tenantName } = useAuth();
  const storeName = tenantName || "DFX Solution";
  const [openMap, setOpenMap] = useState({ Plans: true, Procurement: true, Billing: true });
  // Sidebar search removed; nav renders unfiltered (query stays empty).
  const query = "";
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-accent-line/45 bg-[#efe7d3] transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
          "lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 lg:overflow-hidden",
          collapsed && "lg:w-[76px]",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Primary navigation"
      >
        {/* Store identity — visually separated from the nav by its own surface
            and a stronger divider, so the header reads as a distinct band. */}
        {collapsed ? (
          <div className="flex justify-center border-b border-accent-line/50 bg-white/50 px-2 py-4">
            <div
              className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#e7c96b] via-accent to-[#b8963f] text-sm font-extrabold text-[#1b2030] shadow-sm"
              title={`${storeName} · ${roleText(user) || "Admin"}`}
            >
              {storeName[0]?.toUpperCase() ?? "D"}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 border-b border-accent-line/50 bg-white/50 px-4 py-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#e7c96b] via-accent to-[#b8963f] text-sm font-extrabold text-[#1b2030] shadow-sm">
              {storeName[0]?.toUpperCase() ?? "D"}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-extrabold tracking-tight text-ink" title={storeName}>{storeName}</div>
              <span className="mt-1 inline-flex items-center rounded-full border border-accent-line/60 bg-accent-soft/70 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-accent-strong">
                {roleText(user) || "Admin"}
              </span>
            </div>
          </div>
        )}

        <nav className={cn("auto-fade-scroll flex-1 overflow-y-auto overscroll-contain py-3", collapsed ? "px-2" : "px-3")} onScroll={(e) => { const el = e.currentTarget; el.classList.add("is-scrolling"); clearTimeout(el._fadeT); el._fadeT = setTimeout(() => el.classList.remove("is-scrolling"), 1000); }}>
          {collapsed ? (
            /* Icon rail — every module as a single tooltipped icon. */
            <div className="flex flex-col items-center gap-1">
              {NAV_SECTIONS.flatMap((s) => s.items).map((item) => {
                const active = page === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id); onClose(); }}
                    title={item.name}
                    aria-label={item.name}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "grid h-10 w-10 place-items-center rounded-xl transition-colors",
                      active ? "border border-accent-line/40 bg-white text-accent-strong shadow-sm" : "text-ink-soft hover:bg-white hover:text-ink"
                    )}
                  >
                    {item.icon}
                  </button>
                );
              })}
            </div>
          ) : (() => {
            const q = query.trim().toLowerCase();
            const filtered = q
              ? NAV_SECTIONS.map(sec => ({ ...sec, items: sec.items.filter(it => it.name.toLowerCase().includes(q)) })).filter(sec => sec.items.length > 0)
              : NAV_SECTIONS;
            if (q && filtered.length === 0) {
              return <div className="px-3 py-6 text-center text-xs text-muted">No results for “{query}”</div>;
            }
            return filtered.map((section) => {
            if (section.collapsible) {
              const isActive = section.items.some((i) => i.id === page);
              const qActive = query.trim().length > 0;
              const isOpen = qActive ? true : (openMap[section.label] ?? true);
              const headerIcon = section.headerIcon;
              const headerLabel = section.label;
              return (
                <div key={section.label} className="mb-1">
                  <button
                    onClick={() => setOpenMap((m) => ({ ...m, [section.label]: !isOpen }))}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors",
                      isActive ? "text-ink" : "text-ink-soft hover:bg-white"
                    )}
                  >
                    {headerIcon}
                    {headerLabel}
                    <svg viewBox="0 0 24 24" className={cn("ml-auto h-4 w-4 transition-transform", isOpen && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {isOpen && (
                    <div className="ml-3 mt-0.5 border-l border-line-soft pl-3">
                      {section.items.map((item) => {
                        const active = page === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => { onNavigate(item.id); onClose(); }}
                            className={cn(
                              "mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-semibold transition-colors",
                              active ? "bg-white text-accent-strong shadow-sm border border-accent-line/40" : "text-ink-soft hover:bg-white hover:text-ink"
                            )}
                            aria-current={active ? "page" : undefined}
                          >
                            {item.icon}
                            {item.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            if (!section.label) {
              return (
                <div key={`empty-${section.items[0].id}`} className="mb-1">
                  {section.items.map((item) => {
                    const active = page === item.id;
                    return (
                       <button key={item.id} onClick={() => { onNavigate(item.id); onClose(); }} className={cn("mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors", active ? "bg-white text-accent-strong shadow-sm border border-accent-line/40" : "text-ink-soft hover:bg-white hover:text-ink")} aria-current={active ? "page" : undefined}>
                        {item.icon}
                        {item.name}
                        {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
                      </button>
                    );
                  })}
                </div>
              );
            }
            return (
              <div key={section.label} className="mb-1">
                <div className="px-3 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">{section.label}</div>
                {section.items.map((item) => {
                  const active = page === item.id;
                  return (
                    <button key={item.id} onClick={() => { onNavigate(item.id); onClose(); }} className={cn("mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors", active ? "bg-white text-accent-strong shadow-sm border border-accent-line/40" : "text-ink-soft hover:bg-white hover:text-ink")} aria-current={active ? "page" : undefined}>
                      {item.icon}
                      {item.name}
                      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
                    </button>
                  );
                })}
              </div>
            );
          });
          })()}
        </nav>

        {/* Collapse control — centered in its own bottom band. The signed-in user
            block used to live here, but the header already shows the store and
            role, so it was duplicate information. Desktop only (mobile uses the
            slide-over drawer, which has no collapsed state). */}
        <div className="hidden justify-center border-t border-accent-line/50 bg-white/50 px-2 py-3 lg:flex">
          <button
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-muted transition-colors hover:border-accent-line hover:text-accent-strong"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}
