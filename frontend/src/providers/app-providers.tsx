"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { ClassicToaster } from "@/components/ui/classic-toaster";
import { HistoryAutoCapture } from "@/components/layout/history-auto-capture";
import {
  PERSIST_MAX_AGE,
  appQueryPersistBuster,
  createAppQueryClient,
  createAppQueryPersister,
  shouldPersistQuery,
} from "@/lib/query-cache";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => createAppQueryClient());
  const [persister] = useState(() => createAppQueryPersister());

  const tree = persister ? (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: appQueryPersistBuster(),
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistQuery,
        },
      }}
    >
      <HistoryAutoCapture />
      {children}
      <ClassicToaster />
    </PersistQueryClientProvider>
  ) : (
    <QueryClientProvider client={client}>
      <HistoryAutoCapture />
      {children}
      <ClassicToaster />
    </QueryClientProvider>
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {tree}
    </ThemeProvider>
  );
}
