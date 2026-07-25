import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser, Visitor } from "@/types";
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
  addMemberOpen: boolean;
  lateNoteOpen: boolean;
  /** ISO timestamp set right after a successful login punch — triggers late-note auto prompt. */
  justLoggedInAt: string | null;
  /** Visitor being converted — seeds Add Member wizard identity fields. */
  convertVisitor: Visitor | null;
  favorites: string[];
  recentPages: string[];
  toggleSidebar: () => void;
  setMobileNavOpen: (v: boolean) => void;
  setCommandOpen: (v: boolean) => void;
  setAddMemberOpen: (v: boolean) => void;
  setLateNoteOpen: (v: boolean) => void;
  setJustLoggedInAt: (v: string | null) => void;
  setConvertVisitor: (v: Visitor | null) => void;
  openConvertVisitor: (v: Visitor) => void;
  toggleFavorite: (href: string) => void;
  pushRecent: (href: string) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandOpen: false,
      addMemberOpen: false,
      lateNoteOpen: false,
      justLoggedInAt: null,
      convertVisitor: null,
      favorites: [],
      recentPages: [],
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setAddMemberOpen: (addMemberOpen) => set({ addMemberOpen }),
      setLateNoteOpen: (lateNoteOpen) => set({ lateNoteOpen }),
      setJustLoggedInAt: (justLoggedInAt) => set({ justLoggedInAt }),
      setConvertVisitor: (convertVisitor) => set({ convertVisitor }),
      openConvertVisitor: (visitor) =>
        set({ convertVisitor: visitor, addMemberOpen: true }),
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
    {
      name: "apg.ui.v2",
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        favorites: s.favorites,
        recentPages: s.recentPages,
      }),
    },
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
