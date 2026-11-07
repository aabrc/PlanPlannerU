import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlannerState } from "../types";
import type { Database, Json } from "../types/database";

type PlannerSupabaseClient = SupabaseClient<Database>;
import { normalizePlannerState } from "./storage";

export interface CloudPlannerRecord {
  state: PlannerState;
  deviceId: string;
  updatedAt: string;
  revision: number;
}

export type SyncConflictReason = "first-login" | "version-mismatch" | "concurrent-update";

export type PlannerSyncResult =
  | { status: "idle" }
  | { status: "uploaded"; state: PlannerState; revision: number; updatedAt: string }
  | { status: "downloaded"; state: PlannerState; revision: number; updatedAt: string }
  | { status: "synced"; state: PlannerState; revision: number; updatedAt: string }
  | {
      status: "conflict";
      reason: SyncConflictReason;
      remoteState: PlannerState;
      remoteRevision: number;
      remoteUpdatedAt: string;
    };

export type SyncDecision = "upload" | "download" | "conflict" | "synced";

const DEVICE_ID_STORAGE_KEY = "planplanneru_device_id_v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloudState(state: PlannerState): Json {
  const persisted: Record<string, unknown> = { ...state };
  delete persisted._syncUpdatedAt;
  delete persisted._syncRevision;
  return persisted as unknown as Json;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  );
}

export function arePlannerStatesEqual(first: PlannerState, second: PlannerState): boolean {
  return JSON.stringify(stableValue(cloudState(first))) ===
    JSON.stringify(stableValue(cloudState(second)));
}

export function hasPlannerData(state: PlannerState): boolean {
  const hasCourseStatus = Object.values(state.courseStates).some((status) => status !== "pending");
  const hasManualExternal = Object.entries(state.externalDone)
    .some(([code, done]) => done && code !== "MAT311" && code !== "ILE203");
  const hasMeta = Boolean(
    state.meta.currentPeriod ||
    state.meta.loadPerTerm !== "15" ||
    state.meta.gpa ||
    Number(state.meta.internship) > 0
  );
  const hasCustomScheduleView =
    state.scheduleView.start !== 360 ||
    state.scheduleView.end !== 1200 ||
    state.scheduleView.lastVisibleDay !== 6;

  return hasCourseStatus ||
    Object.keys(state.selections).length > 0 ||
    state.scheduleEvents.length > 0 ||
    state.gradeAttempts.length > 0 ||
    Object.keys(state.advisorCourseProfiles || {}).length > 0 ||
    hasManualExternal ||
    hasMeta ||
    hasCustomScheduleView;
}

export function decideSyncAction(local: PlannerState, remote: PlannerState): SyncDecision {
  const localHasData = hasPlannerData(local);
  const remoteHasData = hasPlannerData(remote);

  // A known local revision means this device has previously synchronized.
  // Any mismatch must be resolved explicitly, even when one side is now empty.
  if (local._syncRevision !== undefined &&
      local._syncRevision !== remote._syncRevision) {
    return "conflict";
  }

  if (!localHasData && !remoteHasData) return "synced";

  // A new device with no saved revision may safely take the existing cloud copy.
  if (!localHasData && remoteHasData && local._syncRevision === undefined) {
    return "download";
  }

  // An existing cloud row with only one populated side is ambiguous. Require
  // an explicit choice instead of silently replacing an empty or populated copy.
  if (!localHasData || !remoteHasData) return "conflict";

  // Two populated states on a first login have no common baseline.
  if (local._syncRevision === undefined) return "conflict";

  return arePlannerStatesEqual(local, remote) ? "synced" : "upload";
}

export function getOrCreateDeviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (saved && saved.length >= 8 && saved.length <= 120) return saved;

    const id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "device-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);

    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return "temporary-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }
}

async function readRemote(
  client: PlannerSupabaseClient,
  userId: string,
  externalCodes: string[]
): Promise<CloudPlannerRecord | null> {
  const { data, error } = await client
    .from("user_planner_data")
    .select("state, device_id, updated_at, revision")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const revision = Number(data.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("La revisión guardada en la nube no es válida. No se modificó ningún dato.");
  }

  const state = normalizePlannerState(
    isRecord(data.state) ? data.state as Partial<PlannerState> : {},
    externalCodes
  );
  state._syncRevision = revision;

  return {
    state,
    deviceId: typeof data.device_id === "string" ? data.device_id : "",
    updatedAt: typeof data.updated_at === "string" ? data.updated_at : "",
    revision
  };
}

export async function getCloudPlannerRecord(
  client: PlannerSupabaseClient,
  userId: string,
  externalCodes: string[]
): Promise<CloudPlannerRecord | null> {
  return readRemote(client, userId, externalCodes);
}

function conflict(remote: CloudPlannerRecord, reason: SyncConflictReason): PlannerSyncResult {
  return {
    status: "conflict",
    reason,
    remoteState: remote.state,
    remoteRevision: remote.revision,
    remoteUpdatedAt: remote.updatedAt
  };
}

async function insertLocal(
  client: PlannerSupabaseClient,
  userId: string,
  local: PlannerState,
  deviceId: string,
  externalCodes: string[]
): Promise<PlannerSyncResult> {
  const { data, error } = await client
    .from("user_planner_data")
    .insert({
      user_id: userId,
      state: cloudState(local),
      device_id: deviceId
    })
    .select("revision, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      const latest = await readRemote(client, userId, externalCodes);
      if (latest) return conflict(latest, "concurrent-update");
    }
    throw error;
  }

  const revision = Number(data.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Supabase no devolvió una revisión válida después de guardar.");
  }

  return {
    status: "uploaded",
    state: { ...local, _syncRevision: revision },
    revision,
    updatedAt: typeof data.updated_at === "string" ? data.updated_at : ""
  };
}

async function updateLocal(
  client: PlannerSupabaseClient,
  userId: string,
  local: PlannerState,
  deviceId: string,
  expectedRevision: number,
  externalCodes: string[]
): Promise<PlannerSyncResult> {
  const nextRevision = expectedRevision + 1;
  const { data, error } = await client
    .from("user_planner_data")
    .update({
      state: cloudState(local),
      device_id: deviceId,
      revision: nextRevision,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId)
    .eq("revision", expectedRevision)
    .select("revision, updated_at")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const latest = await readRemote(client, userId, externalCodes);
    if (latest) return conflict(latest, "concurrent-update");
    throw new Error("La fila en la nube dejó de existir. No se sobrescribió el progreso local.");
  }

  const revision = Number(data.revision);
  if (!Number.isSafeInteger(revision) || revision !== nextRevision) {
    throw new Error("Supabase devolvió una revisión inesperada. Vuelve a consultar antes de sincronizar.");
  }

  return {
    status: "uploaded",
    state: { ...local, _syncRevision: revision },
    revision,
    updatedAt: typeof data.updated_at === "string" ? data.updated_at : ""
  };
}

/**
 * Performs one explicit local-first sync attempt.
 * It never overwrites a non-empty remote state on first sign-in without user choice.
 */
export async function syncPlannerState(
  client: PlannerSupabaseClient,
  userId: string,
  localState: PlannerState,
  externalCodes: string[],
  deviceId = getOrCreateDeviceId()
): Promise<PlannerSyncResult> {
  const local = normalizePlannerState(localState, externalCodes);
  const remote = await readRemote(client, userId, externalCodes);

  if (!remote) {
    if (!hasPlannerData(local)) return { status: "idle" };
    return insertLocal(client, userId, local, deviceId, externalCodes);
  }

  const decision = decideSyncAction(local, remote.state);

  if (decision === "download") {
    return {
      status: "downloaded",
      state: remote.state,
      revision: remote.revision,
      updatedAt: remote.updatedAt
    };
  }

  if (decision === "synced") {
    return {
      status: "synced",
      state: { ...local, _syncRevision: remote.revision },
      revision: remote.revision,
      updatedAt: remote.updatedAt
    };
  }

  if (decision === "conflict") {
    return conflict(
      remote,
      local._syncRevision === undefined ? "first-login" : "version-mismatch"
    );
  }

  return updateLocal(client, userId, local, deviceId, remote.revision, externalCodes);
}

/** Overwrites the cloud copy only when the revision shown in the conflict dialog is still current. */
export async function overwriteCloudWithLocal(
  client: PlannerSupabaseClient,
  userId: string,
  localState: PlannerState,
  expectedRemoteRevision: number,
  externalCodes: string[],
  deviceId = getOrCreateDeviceId()
): Promise<PlannerSyncResult> {
  const remote = await readRemote(client, userId, externalCodes);

  if (!remote) {
    if (!hasPlannerData(localState)) return { status: "idle" };
    return insertLocal(client, userId, normalizePlannerState(localState, externalCodes), deviceId, externalCodes);
  }

  if (remote.revision !== expectedRemoteRevision) {
    return conflict(remote, "concurrent-update");
  }

  return updateLocal(
    client,
    userId,
    normalizePlannerState(localState, externalCodes),
    deviceId,
    expectedRemoteRevision,
    externalCodes
  );
}
