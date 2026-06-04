import { describe, it, expect } from "vitest";
import { agentStatusColor, agentStatusLabel, AGENT_STATUS_COLORS } from "../utils/agentStatus";

describe("agentStatus utils", () => {
  describe("agentStatusColor", () => {
    it("returns green for running", () => {
      expect(agentStatusColor("running")).toBe("#4caf50");
    });
    it("returns orange for idle", () => {
      expect(agentStatusColor("idle")).toBe("#ff9800");
    });
    it("returns red for error", () => {
      expect(agentStatusColor("error")).toBe("#f44336");
    });
    it("returns red for failed", () => {
      expect(agentStatusColor("failed")).toBe("#f44336");
    });
    it("returns blue for completed", () => {
      expect(agentStatusColor("completed")).toBe("#4fc3f7");
    });
    it("handles uppercase input", () => {
      expect(agentStatusColor("Running")).toBe("#4caf50");
    });
    it("returns fallback for unknown state", () => {
      expect(agentStatusColor("unknown_state")).toBe("#a0a0b0");
    });
  });

  describe("agentStatusLabel", () => {
    it("maps running", () => {
      expect(agentStatusLabel("running")).toBe("running");
    });
    it("maps completed to done", () => {
      expect(agentStatusLabel("completed")).toBe("done");
    });
    it("maps failed to error", () => {
      expect(agentStatusLabel("failed")).toBe("error");
    });
    it("maps archived", () => {
      expect(agentStatusLabel("archived")).toBe("archived");
    });
    it("maps created to idle", () => {
      expect(agentStatusLabel("created")).toBe("idle");
    });
    it("handles uppercase input", () => {
      expect(agentStatusLabel("Running")).toBe("running");
    });
    it("falls back to idle for unknown", () => {
      expect(agentStatusLabel("mystery")).toBe("idle");
    });
  });

  describe("AGENT_STATUS_COLORS map", () => {
    it("has all expected keys", () => {
      const expected = ["idle","created","running","done","completed","error","failed","paused","archived"];
      expected.forEach(key => {
        expect(AGENT_STATUS_COLORS).toHaveProperty(key);
      });
    });
  });
});
