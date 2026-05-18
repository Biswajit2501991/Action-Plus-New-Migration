import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/shared/AppShell';
import { LoginPage } from '@/features/auth/LoginPage';
import { VisitorsPage } from '@/features/visitors/VisitorsPage';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  useRealtimeSync(Boolean(session?.token));

  if (loading) return <p className="p-8 text-slate-500">Loading…</p>;
  if (!session?.token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const base = import.meta.env.VITE_BASE_PATH || '/';

  return (
    <AuthProvider>
      <BrowserRouter basename={base === '/' ? undefined : base.replace(/\/$/, '')}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <Protected>
                <AppShell />
              </Protected>
            }
          >
            <Route index element={<Navigate to="/visitors" replace />} />
            <Route path="visitors" element={<VisitorsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/visitors" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
