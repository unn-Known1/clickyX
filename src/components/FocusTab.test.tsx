import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FocusTab from "../components/FocusTab";
import { AppProvider } from "../context/AppContext";

function renderFocus() {
  return render(
    <AppProvider>
      <FocusTab />
    </AppProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("FocusTab", () => {
  it("shows the default focus timer", () => {
    renderFocus();
    expect(screen.getByText("Focus Mode")).toBeInTheDocument();
    expect(screen.getByText("25:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
  });

  it("starts and pauses a session", async () => {
    const user = userEvent.setup();
    renderFocus();
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
  });

  it("parks and removes a distraction", async () => {
    const user = userEvent.setup();
    renderFocus();
    await user.type(screen.getByLabelText("A thought you'll handle later…"), "Email the client");
    await user.click(screen.getByRole("button", { name: "Park thought" }));
    expect(screen.getByText("Email the client")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove parked thought" }));
    expect(screen.queryByText("Email the client")).not.toBeInTheDocument();
  });

  it("switches preset durations", async () => {
    const user = userEvent.setup();
    renderFocus();
    await user.click(screen.getByRole("button", { name: "50m" }));
    expect(screen.getByText("50:00")).toBeInTheDocument();
  });
});
