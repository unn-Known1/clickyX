import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider, useAppContext } from "../context/AppContext";

// Simple consumer component to test context
function ToastConsumer() {
  const { showToast, toasts, dismissToast } = useAppContext();
  return (
    <div>
      <button onClick={() => showToast("Hello", "success")}>Add toast</button>
      <button onClick={() => showToast("Error!", "error")}>Add error</button>
      {toasts.map(t => (
        <div key={t.id} data-testid="toast" data-type={t.type}>
          {t.text}
          <button onClick={() => dismissToast(t.id)}>Dismiss</button>
        </div>
      ))}
    </div>
  );
}

function NavConsumer() {
  const { activeTab, setActiveTab, tabTransition } = useAppContext();
  return (
    <div>
      <span data-testid="active-tab">{activeTab}</span>
      <span data-testid="transitioning">{String(tabTransition)}</span>
      <button onClick={() => setActiveTab("agents")}>Go agents</button>
      <button onClick={() => setActiveTab("settings")}>Go settings</button>
    </div>
  );
}

describe("AppContext", () => {
  describe("toast system", () => {
    it("adds a success toast", async () => {
      const user = userEvent.setup();
      render(<AppProvider><ToastConsumer /></AppProvider>);
      await user.click(screen.getByText("Add toast"));
      expect(screen.getAllByTestId("toast")).toHaveLength(1);
      expect(screen.getByTestId("toast")).toHaveTextContent("Hello");
      expect(screen.getByTestId("toast")).toHaveAttribute("data-type", "success");
    });

    it("adds multiple toasts", async () => {
      const user = userEvent.setup();
      render(<AppProvider><ToastConsumer /></AppProvider>);
      await user.click(screen.getByText("Add toast"));
      await user.click(screen.getByText("Add error"));
      expect(screen.getAllByTestId("toast")).toHaveLength(2);
    });

    it("dismisses a toast", async () => {
      const user = userEvent.setup();
      render(<AppProvider><ToastConsumer /></AppProvider>);
      await user.click(screen.getByText("Add toast"));
      expect(screen.getAllByTestId("toast")).toHaveLength(1);
      await user.click(screen.getByText("Dismiss"));
      expect(screen.queryAllByTestId("toast")).toHaveLength(0);
    });

    it("throws if used outside provider", () => {
      // Suppress console.error for this test
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => render(<ToastConsumer />)).toThrow("useAppContext must be used inside AppProvider");
      spy.mockRestore();
    });
  });

  describe("navigation", () => {
    it("starts on home tab", () => {
      render(<AppProvider><NavConsumer /></AppProvider>);
      expect(screen.getByTestId("active-tab")).toHaveTextContent("home");
    });

    it("switches tabs with animation", { timeout: 10000 }, async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<AppProvider><NavConsumer /></AppProvider>);
      await user.click(screen.getByText("Go agents"));
      // During transition
      expect(screen.getByTestId("transitioning")).toHaveTextContent("true");
      act(() => { vi.advanceTimersByTime(150); });
      expect(screen.getByTestId("active-tab")).toHaveTextContent("agents");
      expect(screen.getByTestId("transitioning")).toHaveTextContent("false");
      vi.useRealTimers();
    });

    it("allows switching to settings", { timeout: 10000 }, async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<AppProvider><NavConsumer /></AppProvider>);
      await user.click(screen.getByText("Go settings"));
      act(() => { vi.advanceTimersByTime(150); });
      expect(screen.getByTestId("active-tab")).toHaveTextContent("settings");
      vi.useRealTimers();
    });
  });
});
