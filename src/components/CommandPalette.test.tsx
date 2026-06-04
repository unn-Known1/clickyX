import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandPalette from "../components/CommandPalette";

describe("CommandPalette", () => {
  const mockClose = vi.fn();
  const mockNavigate = vi.fn();

  function renderPalette() {
    return render(
      <CommandPalette onClose={mockClose} onNavigate={mockNavigate} />,
    );
  }

  it("renders with search input focused", () => {
    renderPalette();
    expect(screen.getByPlaceholderText("Search commands…")).toBeInTheDocument();
  });

  it("shows all navigation items by default", () => {
    renderPalette();
    expect(screen.getByText("Go to Home")).toBeInTheDocument();
    expect(screen.getByText("Go to Agents")).toBeInTheDocument();
    expect(screen.getByText("Go to Connections")).toBeInTheDocument();
    expect(screen.getByText("Go to Settings")).toBeInTheDocument();
  });

  it("filters items by query", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByPlaceholderText("Search commands…"), "agent");
    expect(screen.getByText("Go to Agents")).toBeInTheDocument();
    expect(screen.queryByText("Go to Home")).not.toBeInTheDocument();
  });

  it("shows empty state for unknown query", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByPlaceholderText("Search commands…"), "xyznonexistent");
    expect(screen.getByText(/No results for/)).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderPalette();
    fireEvent.keyDown(screen.getByPlaceholderText("Search commands…"), { key: "Escape" });
    expect(mockClose).toHaveBeenCalled();
  });

  it("navigates on Enter", () => {
    renderPalette();
    fireEvent.keyDown(screen.getByPlaceholderText("Search commands…"), { key: "Enter" });
    expect(mockNavigate).toHaveBeenCalledWith("home");
    expect(mockClose).toHaveBeenCalled();
  });

  it("navigates on item click", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(screen.getByText("Go to Agents"));
    expect(mockNavigate).toHaveBeenCalledWith("agents");
  });

  it("closes on backdrop click", async () => {
    const user = userEvent.setup();
    renderPalette();
    // Click the backdrop div
    await user.click(document.querySelector(".palette-backdrop")!);
    expect(mockClose).toHaveBeenCalled();
  });
});
