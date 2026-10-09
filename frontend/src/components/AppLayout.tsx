import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { CloseIcon, MenuIcon } from "./Icons";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/trials/upload", label: "Upload protocol" },
  { to: "/patients/new", label: "New patient" },
];

function navClass({ isActive }: { isActive: boolean }): string {
  return `block rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? "bg-accent-50 text-accent-800" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
  }`;
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [location.pathname]);

  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to="/dashboard" className="flex items-center gap-2 font-semibold text-slate-900">
            <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-600 text-sm font-bold text-white">
              CT
            </span>
            <span className="truncate">Trial Eligibility Support</span>
          </NavLink>
          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={navClass} end>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            {user ? <span className="max-w-[14rem] truncate text-sm text-slate-600" title={user.email}>{user.full_name || user.email}</span> : null}
            <button type="button" onClick={onLogout} className="btn-secondary py-1.5">
              Log out
            </button>
          </div>
          <button
            type="button"
            className="btn-ghost p-2 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <CloseIcon className="text-xl" /> : <MenuIcon className="text-xl" />}
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
        {open ? (
          <nav id="mobile-nav" aria-label="Primary mobile" className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={navClass} end>
                  {n.label}
                </NavLink>
              ))}
              {user ? <p className="px-3 pt-2 text-xs text-slate-600">Signed in as {user.email}</p> : null}
              <button type="button" onClick={onLogout} className="btn-secondary mt-2">
                Log out
              </button>
            </div>
          </nav>
        ) : null}
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-4">
        <p className="mx-auto max-w-7xl px-4 text-xs text-slate-600 sm:px-6">
          Prototype clinical decision support. Supports, but does not replace, qualified clinical review.
        </p>
      </footer>
    </div>
  );
}
