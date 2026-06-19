import * as fs from "fs";
import * as path from "path";
import type { PhaseDependencyInfo, DependencyGraphResult, AllDependenciesResult } from "../types";

function getProjectRoot(): string {
  const envVal = process.env.PROJECT_MEMORY_DIR;
  const GARBAGE = new Set(["undefined", "null", ""]);
  const raw = envVal !== undefined && !GARBAGE.has(envVal) ? envVal : null;
  if (raw && !path.isAbsolute(raw)) {
    throw new Error(`PROJECT_MEMORY_DIR must be an absolute path; got: "${raw}"`);
  }
  return raw ?? process.cwd();
}

function parsePhaseYml(content: string): PhaseDependencyInfo {
  const result: PhaseDependencyInfo = {
    phaseId: "",
    title: "",
    status: "",
    dependsOn: [],
    enables: [],
    conflictsWith: [],
  };

  const idM = content.match(/^id:\s*(\S+)\s*$/m);
  if (idM) result.phaseId = idM[1];

  const titleM = content.match(/^title:\s*"?(.+?)"?\s*$/m);
  if (titleM) result.title = titleM[1].trim();

  const statusM = content.match(/^status:\s*(\S+)\s*$/m);
  if (statusM) result.status = statusM[1];

  for (const field of ["depends_on", "enables", "conflicts_with"] as const) {
    const key = field === "depends_on" ? "dependsOn" : field === "conflicts_with" ? "conflictsWith" : field;
    const section = content.match(new RegExp(`^${field}:\\s*(\\[.*?\\]|\\n(\\s+-.+\\n?)*)`, "m"));
    if (section) {
      const hashRe = /^\s*-\s+(\S+)\s*$/gm;
      let hm: RegExpExecArray | null;
      while ((hm = hashRe.exec(section[0])) !== null) {
        result[key].push(hm[1]);
      }
    }
  }

  return result;
}

function loadAllPhases(pmDir: string): Map<string, PhaseDependencyInfo> {
  const phases = new Map<string, PhaseDependencyInfo>();
  const phasesDir = path.join(pmDir, "phases");
  if (!fs.existsSync(phasesDir)) return phases;

  for (const entry of fs.readdirSync(phasesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const ymlPath = path.join(phasesDir, entry.name, "phase.yml");
    if (!fs.existsSync(ymlPath)) continue;
    try {
      const content = fs.readFileSync(ymlPath, "utf-8");
      const info = parsePhaseYml(content);
      if (!info.phaseId) info.phaseId = entry.name;
      phases.set(info.phaseId, info);
    } catch { /* skip */ }
  }
  return phases;
}

function bfsUpstream(phaseId: string, phases: Map<string, PhaseDependencyInfo>): string[] {
  const visited = new Set<string>();
  const queue = [phaseId];
  visited.add(phaseId);
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const info = phases.get(current);
    if (!info) continue;
    for (const dep of info.dependsOn) {
      if (!visited.has(dep)) {
        visited.add(dep);
        queue.push(dep);
        result.push(dep);
      }
    }
  }
  return result;
}

function bfsDownstream(phaseId: string, phases: Map<string, PhaseDependencyInfo>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  for (const [id, info] of phases) {
    if (info.dependsOn.includes(phaseId) && !visited.has(id)) {
      visited.add(id);
      result.push(id);
      const sub = bfsDownstream(id, phases);
      for (const s of sub) {
        if (!visited.has(s)) {
          visited.add(s);
          result.push(s);
        }
      }
    }
  }
  return result;
}

function detectCycles(phases: Map<string, PhaseDependencyInfo>): string[][] {
  const cycles: string[][] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();

  for (const id of phases.keys()) color.set(id, WHITE);

  function dfs(node: string, path: string[]): void {
    color.set(node, GRAY);
    path.push(node);
    const info = phases.get(node);
    if (info) {
      for (const dep of info.dependsOn) {
        const c = color.get(dep) ?? WHITE;
        if (c === GRAY) {
          const cycleStart = path.indexOf(dep);
          if (cycleStart >= 0) {
            cycles.push([...path.slice(cycleStart), dep]);
          }
        } else if (c === WHITE) {
          dfs(dep, [...path]);
        }
      }
    }
    color.set(node, BLACK);
  }

  for (const id of phases.keys()) {
    if (color.get(id) === WHITE) dfs(id, []);
  }
  return cycles;
}

export async function findPhaseDependencies(phaseId: string): Promise<DependencyGraphResult> {
  try {
    const root = getProjectRoot();
    const pmDir = path.join(root, ".project-memory");
    const phases = loadAllPhases(pmDir);

    const phase = phases.get(phaseId);
    if (!phase) {
      return {
        phase: { phaseId, title: "", status: "", dependsOn: [], enables: [], conflictsWith: [] },
        upstream: [],
        downstream: [],
        conflicts: [],
        transitiveUpstream: [],
        transitiveDownstream: [],
      };
    }

    const upstreamIds = bfsUpstream(phaseId, phases);
    const downstreamIds = bfsDownstream(phaseId, phases);
    const transitiveUpstreamIds = bfsUpstream(phaseId, phases).filter(id => id !== phaseId);
    const transitiveDownstreamIds = bfsDownstream(phaseId, phases);

    const resolve = (ids: string[]) => ids.map(id => phases.get(id)).filter(Boolean) as PhaseDependencyInfo[];

    return {
      phase,
      upstream: phase.dependsOn.map(id => phases.get(id)).filter(Boolean) as PhaseDependencyInfo[],
      downstream: resolve(downstreamIds),
      conflicts: phase.conflictsWith.map(id => phases.get(id)).filter(Boolean) as PhaseDependencyInfo[],
      transitiveUpstream: resolve(upstreamIds),
      transitiveDownstream: resolve(transitiveDownstreamIds),
    };
  } catch {
    return {
      phase: { phaseId, title: "", status: "", dependsOn: [], enables: [], conflictsWith: [] },
      upstream: [], downstream: [], conflicts: [], transitiveUpstream: [], transitiveDownstream: [],
    };
  }
}

export async function getAllDependencies(): Promise<AllDependenciesResult> {
  try {
    const root = getProjectRoot();
    const pmDir = path.join(root, ".project-memory");
    const phases = loadAllPhases(pmDir);

    const allPhases = Array.from(phases.values());
    const blocked: string[] = [];
    const unblocked: string[] = [];

    for (const p of allPhases) {
      if (p.status === "completed") continue;
      const allDone = p.dependsOn.length === 0 || p.dependsOn.every(dep => {
        const depPhase = phases.get(dep);
        return depPhase && depPhase.status === "completed";
      });
      if (p.dependsOn.length > 0 && allDone) unblocked.push(p.phaseId);
      if (p.dependsOn.some(dep => {
        const dp = phases.get(dep);
        return !dp || dp.status !== "completed";
      })) blocked.push(p.phaseId);
    }

    const cycles = detectCycles(phases);

    return { phases: allPhases, blocked, unblocked, cycles };
  } catch {
    return { phases: [], blocked: [], unblocked: [], cycles: [] };
  }
}
