"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ConfirmProvider>{children}</ConfirmProvider>
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}
