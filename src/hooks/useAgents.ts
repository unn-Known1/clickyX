import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface AgentInfo {
  id: string;
  name: string;
  slug: string;
  state: string;
  skills: string[];
  created_at: string;
  updated_at: string;
  transcript: { role: string; content: string }[];
}

export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  permission_class: string;
  entry_point: string;
}

export function useAgents() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const result = await invoke<AgentInfo[]>("list_agents");
      setAgents(result);
    } catch (e) {
      setAgents([]);
      setError(String(e));
    }
  }, []);

  const fetchSkills = useCallback(async () => {
    try {
      const result = await invoke<SkillInfo[]>("list_skills");
      setSkills(result);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAgents(), fetchSkills()]).finally(() => setLoading(false));
  }, [fetchAgents, fetchSkills]);

  const createAgent = useCallback(
    async (name: string, slug: string, agentSkills: string[]) => {
      try {
        await invoke<AgentInfo>("create_agent", {
          name,
          slug,
          skills: agentSkills,
        });
        await fetchAgents();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [fetchAgents],
  );

  const runAgent = useCallback(
    async (slug: string, prompt: string) => {
      try {
        await invoke("run_agent", { slug, prompt });
        await fetchAgents();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [fetchAgents],
  );

  const stopAgent = useCallback(
    async (slug: string) => {
      try {
        await invoke("stop_agent", { slug });
        await fetchAgents();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [fetchAgents],
  );

  const archiveAgent = useCallback(
    async (slug: string) => {
      try {
        await invoke("archive_agent", { slug });
        await fetchAgents();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [fetchAgents],
  );

  const getAgentStatus = useCallback(
    async (slug: string): Promise<AgentInfo> => {
      return await invoke("get_agent_status", { slug });
    },
    [],
  );

  const getAgentTranscript = useCallback(
    async (slug: string): Promise<{ role: string; content: string }[]> => {
      return await invoke("get_agent_transcript", { slug });
    },
    [],
  );

  const enableSkill = useCallback(
    async (slug: string, skillName: string) => {
      try {
        await invoke("enable_skill", { slug, skillName });
        await fetchAgents();
      } catch (e) {
        setError(String(e));
      }
    },
    [fetchAgents],
  );

  const disableSkill = useCallback(
    async (slug: string, skillName: string) => {
      try {
        await invoke("disable_skill", { slug, skillName });
        await fetchAgents();
      } catch (e) {
        setError(String(e));
      }
    },
    [fetchAgents],
  );

  return {
    agents,
    skills,
    loading,
    error,
    fetchAgents,
    createAgent,
    runAgent,
    stopAgent,
    archiveAgent,
    getAgentStatus,
    getAgentTranscript,
    enableSkill,
    disableSkill,
  };
}
