/**
 * AgentHUDApp — Entry point for the Agent HUD floating window.
 * Mounted from agent-hud.html as a separate Tauri WebView window.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AgentHUD from "./components/AgentHUD";
import "./styles/theme.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AgentHUD />
      </QueryClientProvider>
    </StrictMode>
  );
}
