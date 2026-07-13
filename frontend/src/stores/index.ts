import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@/types";
import { sectionsWithRoleDefaults } from "@/lib/domain/permissions";

type AuthState = {
  user: AuthUser | null;
  hydrated: boolean;
  setUser: (user: AuthUser | null) => void;
  setHydrated: (v: boolean) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  hydrated: false,
  setUser: (user) => set({ user: sectionsWithRoleDefaults(user) }),
  setHydrated: (hydrated) => set({ hydrated }),
  clear: () => set({ user: null }),
}));

type UiState = {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;
  favorites: string[];
  recentPages: string[];
  toggleSidebar: () => void;
  setMobileNavOpen: (v: boolean) => void;
  setCommandOpen: (v: boolean) => void;
  toggleFavorite: (href: string) => void;
  pushRecent: (href: string) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandOpen: false,
      favorites: [],
      recentPages: [],
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      toggleFavorite: (href) => {
        const favs = get().favorites;
        set({
          favorites: favs.includes(href) ? favs.filter((f) => f !== href) : [...favs, href].slice(0, 12),
        });
      },
      pushRecent: (href) => {
        const next = [href, ...get().recentPages.filter((p) => p !== href)].slice(0, 8);
        set({ recentPages: next });
      },
    }),
    { name: "apg.ui.v2" },
  ),
);

type BranchState = {
  activeBranchId: string | null;
  setActiveBranchId: (id: string | null) => void;
};

export const useBranchStore = create<BranchState>((set) => ({
  activeBranchId: null,
  setActiveBranchId: (activeBranchId) => set({ activeBranchId }),
}));
