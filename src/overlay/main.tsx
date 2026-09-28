import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../i18n"; // shared locale bundles (overlay uses t() too)
import { AppProvider } from "../context/AppContext";
import OverlayApp from "./OverlayApp";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,       // 10s before re-fetch
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <OverlayApp />
      </AppProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
