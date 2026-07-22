import type { ReactNode } from "react";

export type NavItem = "painel" | "lista" | "clientes" | "nova" | "referencia" | "usuarios";

const NAV_BASE: { id: NavItem; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: "painel", label: "Painel", icon: "◉" },
  { id: "lista", label: "Cotações", icon: "☰" },
  { id: "clientes", label: "Clientes", icon: "◎" },
  { id: "referencia", label: "FOB/kg ref.", icon: "📊" },
  { id: "nova", label: "Nova cotação", icon: "+" },
  { id: "usuarios", label: "Usuários", icon: "👤", adminOnly: true },
];

export function AppShell({
  nav,
  onNav,
  userEmail,
  isAdmin = false,
  usuariosPendentes = 0,
  usuariosAlertaBloqueados = 0,
  totalHoje,
  busca,
  onBuscaChange,
  onBuscaSubmit,
  onLogout,
  children,
}: {
  nav: NavItem;
  onNav: (n: NavItem) => void;
  userEmail?: string;
  isAdmin?: boolean;
  usuariosPendentes?: number;
  usuariosAlertaBloqueados?: number;
  totalHoje: number;
  busca: string;
  onBuscaChange: (v: string) => void;
  onBuscaSubmit: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const navItems = NAV_BASE.filter((item) => !item.adminOnly || isAdmin);

  function labelNav(item: (typeof NAV_BASE)[number]) {
    if (item.id === "usuarios" && usuariosAlertaBloqueados > 0) {
      return `${item.label} (!)`;
    }
    if (item.id === "usuarios" && usuariosPendentes > 0) {
      return `${item.label} (${usuariosPendentes})`;
    }
    return item.label;
  }
  return (
    <div className="flex min-h-full bg-ink-900">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/5 bg-ink-950/80 md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-white/5 px-4">
          <img
            src="/logo-innove888.jpeg"
            alt="INNOVE 888"
            className="h-9 w-auto max-w-[72px] object-contain"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">INNOVE 888</p>
            <p className="text-[10px] text-slate-500">Gestão de trade</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNav(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                nav === item.id
                  ? "bg-brand-500/20 font-medium text-brand-200"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              <span className="flex-1">{labelNav(item)}</span>
              {item.id === "usuarios" && usuariosPendentes > 0 && (
                <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                  {usuariosPendentes}
                </span>
              )}
              {item.id === "usuarios" && usuariosAlertaBloqueados > 0 && (
                <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-[10px] font-bold text-red-200">
                  !
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/5 p-4 text-xs text-slate-500">
          <p className="truncate">{userEmail}</p>
          <button type="button" className="mt-2 text-slate-400 hover:text-white" onClick={onLogout}>
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 px-4 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <img
              src="/logo-innove888.jpeg"
              alt="INNOVE 888"
              className="h-8 w-auto max-w-[64px] object-contain"
            />
            <span className="text-sm font-bold text-white">INNOVE 888</span>
          </div>
          <div className="flex gap-1 md:hidden">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rounded-lg px-2 py-1 text-xs ${nav === item.id ? "bg-white/10 text-white" : "text-slate-500"}`}
                onClick={() => onNav(item.id)}
              >
                {labelNav(item)}
              </button>
            ))}
          </div>
          <form
            className="hidden flex-1 sm:block sm:max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              onBuscaSubmit();
            }}
          >
            <input
              className="input py-2 text-sm"
              placeholder="Buscar cliente ou processo…"
              value={busca}
              onChange={(e) => onBuscaChange(e.target.value)}
            />
          </form>
          <div className="ml-auto flex items-center gap-3">
            {totalHoje > 0 && (
              <span className="rounded-full bg-brand-500/20 px-3 py-1 text-xs font-medium text-brand-300">
                {totalHoje} hoje
              </span>
            )}
            <button type="button" className="btn-primary py-1.5 text-sm md:hidden" onClick={() => onNav("nova")}>
              + Nova
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
