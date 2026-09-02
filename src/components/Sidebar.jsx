import { useState } from "react";
import { cn } from "../lib/utils";
import { useAuth } from "../context/AuthContext";

const ROLE_LABEL = { admin: "Admin", superadmin: "Super Admin", customer: "Customer" };
function roleText(u) {
  return u?.backendRole || ROLE_LABEL[u?.role] || (u?.role ? u.role : "");
}
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
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
    label: "People",
    items: [
      { id: "customers", name: "Customers", icon: <Icon d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>} /> },
    ],
  },
  {
    label: "Schemes",
    collapsible: true,
    items: [
      { id: "schemes", name: "Schemes", icon: <Icon d={<><circle cx="8" cy="8" r="5" /><circle cx="15" cy="12" r="3" /><path d="M8 13c1.5 1.5 3.5 1.5 5 0" /></>} /> },
      { id: "enrollments", name: "Enrollments", icon: <Icon d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="3" /><path d="M18 8a2.5 2.5 0 0 1 2.5 2.5V12" /><circle cx="18" cy="5" r="1.5" /></>} /> },
      { id: "collections", name: "Collections", icon: <Icon d={<><circle cx="12" cy="6" r="4" /><path d="M12 10v4" /><path d="M8 14h8l-1 5H9l-1-5z" /></>} /> },
    ],
  },
  {
    label: "Billing",
    collapsible: true,
    items: [
      { id: "inventory", name: "Inventory", icon: <Icon d={<><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /></>} /> },
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
    label: "Growth",
    items: [
      { id: "catalogue", name: "Catalogue Studio", icon: <Icon d={<><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /></>} /> },
      { id: "marketing", name: "Marketing", icon: <Icon d={<><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>} /> },
      { id: "reports", name: "Reports & Analytics", icon: <Icon d={<><path d="M3 17L9 11l4 4 8-8" /><path d="M14 7h7v7" /></>} /> },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "branches", name: "Branches", icon: <Icon d={<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>} /> },
      { id: "staff-users", name: "Staff Users", icon: <Icon d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 11a3 3 0 0 0-3 3 3 3 0 0 0-3-3 3 3 0 0 1 3-3 3 3 0 0 1 3 3z" /></>} /> },
    ],
  },
  {
    label: "System",
    items: [
      { id: "support", name: "Support", icon: <Icon d={<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10A15 15 0 0 1 12 2z" /></>} /> },
      { id: "notifications", name: "Notifications", icon: <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>} /> },
      { id: "settings", name: "Settings", icon: <Icon d={<><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></>} /> },
    ],
  },
];

export default function Sidebar({ page, onNavigate, open, onClose }) {
  const { user, tenantName } = useAuth();
  const storeName = tenantName || "DFX Solution";
  const [openMap, setOpenMap] = useState({ Schemes: true, Billing: true });
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
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-accent-line/45 bg-[#efe7d3] transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
          "lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 lg:overflow-hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Primary navigation"
      >
        <div className="flex items-center gap-3 border-b border-line-soft px-5 py-[18px]">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-sm font-extrabold text-white">
            {storeName[0]?.toUpperCase() ?? "D"}
          </div>
          <div className="leading-tight">
            <div className="text-sm font-extrabold tracking-tight">{storeName}</div>
            <div className="text-[11px] font-medium text-muted">{roleText(user) || "Admin"}</div>
          </div>
        </div>

        <nav className="auto-fade-scroll flex-1 overflow-y-auto overscroll-contain px-3 py-3" onScroll={(e) => { const el = e.currentTarget; el.classList.add("is-scrolling"); clearTimeout(el._fadeT); el._fadeT = setTimeout(() => el.classList.remove("is-scrolling"), 1000); }}>
          {(() => {
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
              const headerIcon = section.label === "Schemes"
                ? <Icon d={<><circle cx="8" cy="8" r="5" /><circle cx="15" cy="12" r="3" /><path d="M8 13c1.5 1.5 3.5 1.5 5 0" /></>} />
                : <Icon d={<><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /></>} />;
              const headerLabel = section.label === "Schemes" ? "Scheme" : section.label;
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

        <div className="flex items-center gap-3 border-t border-line-soft px-5 py-4">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs font-bold text-white">{initials(user?.name)}</div>
          <div className="text-xs leading-tight">
            <div className="font-bold">{user?.name || "—"}</div>
            <div className="text-muted">{roleText(user) || "—"}</div>
          </div>
        </div>
      </aside>
    </>
  );
}
