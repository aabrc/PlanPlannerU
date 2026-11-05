/*
 * PlanPlannerU Cloud Sync — base de integración.
 * La aplicación conserva el guardado local existente; la nube es una copia sincronizada.
 * Configurar cloud-config.js y ejecutar supabase/schema.sql antes de activar.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.PLANPLANNERU_CLOUD_CONFIG || {};
const configured = /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || "") &&
  config.supabaseAnonKey && !String(config.supabaseAnonKey).includes("TU_CLAVE");

let client = null;
let currentUser = null;
let syncTimer = null;
let isApplyingRemote = false;
const STORAGE_KEY = "itt2020_pensum_tracker_v2";
const DEVICE_KEY = "planplanneru_device_id";

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
function localState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
  catch { return null; }
}
function notify(message) {
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3200);
  } else console.info("[PlanPlannerU]", message);
}
function setStatus(message) {
  const el = document.getElementById("cloudSyncStatus");
  if (el) el.textContent = message;
}
async function getSnapshot() {
  if (!client || !currentUser) return null;
  const { data, error } = await client.from("user_planner_data")
    .select("state,updated_at,device_id")
    .eq("user_id", currentUser.id).maybeSingle();
  if (error) throw error;
  return data;
}
async function pushSnapshot() {
  if (!client || !currentUser || isApplyingRemote) return;
  const state = localState();
  if (!state) return;
  setStatus("Sincronizando…");
  const payload = {
    user_id: currentUser.id,
    state,
    device_id: deviceId(),
    updated_at: new Date().toISOString()
  };
  const { error } = await client.from("user_planner_data").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
  setStatus("Sincronizado");
}
async function pullSnapshot() {
  const remote = await getSnapshot();
  if (!remote) {
    await pushSnapshot();
    return;
  }
  const local = localState();
  const localUpdated = Number(local?._syncUpdatedAt || 0);
  const remoteUpdated = Date.parse(remote.updated_at || 0) || 0;
  if (!local || remoteUpdated > localUpdated) {
    const accept = !local || confirm("Hay una versión más reciente de PlanPlannerU guardada en la nube. ¿Quieres cargarla en este dispositivo? Se reemplazará el avance local actual.");
    if (accept) {
      isApplyingRemote = true;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remote.state));
        location.reload();
      } finally { isApplyingRemote = false; }
      return;
    }
    notify("Se conservó el avance local. Sincroniza manualmente cuando quieras subirlo.");
  }
  await pushSnapshot();
}
async function refreshSession() {
  if (!client) return;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  currentUser = data.session?.user || null;
  updateAccount();
  if (currentUser) await pullSnapshot();
}
function updateAccount() {
  const button = document.getElementById("cloudAccountButton");
  if (button) button.textContent = currentUser ? currentUser.email : "Iniciar sesión";
  setStatus(currentUser ? "Cuenta conectada" : "Solo en este dispositivo");
}
async function init() {
  if (!configured) {
    setStatus("Nube sin configurar");
    return;
  }
  client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAccount();
    if (currentUser) setTimeout(() => pullSnapshot().catch(err => notify("Error de sincronización: " + err.message)), 0);
  });
  await refreshSession();
  window.addEventListener("online", () => {
    if (currentUser) pullSnapshot().catch(err => notify("No se pudo sincronizar: " + err.message));
  });
}
async function sendEmailCode(email) {
  if (!client) throw new Error("La sincronización todavía no está configurada.");
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}
async function verifyEmailCode(email, token) {
  const { error } = await client.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  await refreshSession();
}
async function signOut() {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
  currentUser = null;
  updateAccount();
}
function scheduleSync() {
  if (!client || !currentUser || isApplyingRemote) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushSnapshot().catch(err => {
    setStatus("Pendiente de sincronizar");
    console.warn("PlanPlannerU cloud sync:", err);
  }), 1200);
}
window.PlanPlannerUCloud = {
  configured: () => configured,
  getUser: () => currentUser,
  sendEmailCode,
  verifyEmailCode,
  signOut,
  syncNow: () => pushSnapshot(),
  scheduleSync,
  init
};
window.addEventListener("DOMContentLoaded", () => init().catch(err => {
  console.error(err);
  setStatus("Error de conexión");
}));
