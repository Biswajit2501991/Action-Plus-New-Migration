import { AppShell } from "@/components/layout/app-shell";
import { AuthGuard } from "@/components/layout/auth-guard";
import { DesktopAccessGuard } from "@/components/layout/desktop-access-guard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DesktopAccessGuard>
        <AppShell>{children}</AppShell>
      </DesktopAccessGuard>
    </AuthGuard>
  );
}
