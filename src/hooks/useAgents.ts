import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { commands } from "../bindings";
import type { AgentInfo, SkillInfo } from "../bindings";

export type { AgentInfo, SkillInfo };

const AGENTS_KEY = ["agents"];
const SKILLS_KEY = ["skills"];

export function useAgents() {
  const queryClient = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────────
  const {
    data: agents = [],
    isLoading: agentsLoading,
    error: agentsError,
  } = useQuery<AgentInfo[], Error>({
    queryKey: AGENTS_KEY,
    queryFn: () => commands.listAgents(),
    refetchInterval: 5000,
    staleTime: 4000,
    retry: 2,
  });

  const { data: skills = [], isLoading: skillsLoading } = useQuery<SkillInfo[], Error>({
    queryKey: SKILLS_KEY,
    queryFn: () => commands.listSkills(),
    staleTime: 60_000,
    retry: 2,
  });

  // ── Tauri event listener: invalidate agents on state-changed events ─────────
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen("agent-state-changed", () => {
      queryClient.invalidateQueries({ queryKey: AGENTS_KEY });
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [queryClient]);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createMutation = useMutation<AgentInfo, Error, { name: string; slug: string; skills: string[] }>({
    mutationFn: ({ name, slug, skills: agentSkills }) =>
      commands.createAgent(name, slug, agentSkills),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });

  const runMutation = useMutation<void, Error, { slug: string; prompt: string }>({
    mutationFn: ({ slug, prompt }) => commands.runAgent(slug, prompt),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });

  const stopMutation = useMutation<void, Error, string>({
    mutationFn: (slug) => commands.stopAgent(slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });

  const archiveMutation = useMutation<void, Error, string>({
    mutationFn: (slug) => commands.archiveAgent(slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });

  const enableSkillMutation = useMutation<void, Error, { slug: string; skillName: string }>({
    mutationFn: ({ slug, skillName }) => commands.enableSkill(slug, skillName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });

  const disableSkillMutation = useMutation<void, Error, { slug: string; skillName: string }>({
    mutationFn: ({ slug, skillName }) => commands.disableSkill(slug, skillName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });

  const attachFilesMutation = useMutation<void, Error, { slug: string; paths: string[] }>({
    mutationFn: ({ slug, paths }) => commands.agentAttachFiles(slug, paths),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });

  // ── Convenience wrappers ──────────────────────────────────────────────────────
  const createAgent = (name: string, slug: string, agentSkills: string[]) =>
    createMutation.mutateAsync({ name, slug, skills: agentSkills });

  const runAgent = (slug: string, prompt: string) =>
    runMutation.mutateAsync({ slug, prompt });

  const stopAgent = (slug: string) => stopMutation.mutateAsync(slug);

  const archiveAgent = (slug: string) => archiveMutation.mutateAsync(slug);

  const enableSkill = (slug: string, skillName: string) =>
    enableSkillMutation.mutateAsync({ slug, skillName });

  const disableSkill = (slug: string, skillName: string) =>
    disableSkillMutation.mutateAsync({ slug, skillName });

  const attachFiles = (slug: string, paths: string[]) =>
    attachFilesMutation.mutateAsync({ slug, paths });

  const fetchAgents = () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY });

  return {
    agents,
    skills,
    loading: agentsLoading || skillsLoading,
    error: agentsError?.message ?? null,
    fetchAgents,
    createAgent,
    runAgent,
    stopAgent,
    archiveAgent,
    enableSkill,
    disableSkill,
    attachFiles,
  };
}
