import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-slate-200 bg-white p-4 flex flex-col gap-2">
        <p className="text-xs font-bold tracking-wide text-slate-400">ACTION PLUS GYM</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{user?.name || user?.id}</p>
        <nav className="flex flex-col gap-1 mt-4">
          <Link to="/visitors" className="rounded-xl px-3 py-2 text-sm font-medium hover:bg-blue-50 text-slate-700">
            Visitors
          </Link>
          <a
            href="/index.html"
            className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            Main dashboard
          </a>
        </nav>
        <button
          type="button"
          onClick={logout}
          className="mt-auto rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          Logout
        </button>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
