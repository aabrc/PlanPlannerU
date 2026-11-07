import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { buildAuthRedirectUrl, isValidEmailAddress } from "../lib/auth";
import type { PlannerSyncResult } from "../lib/cloudSync";

type SyncConflict = Extract<PlannerSyncResult, { status: "conflict" }>;

interface AccountDialogProps {
  open: boolean;
  configured: boolean;
  session: Session | null;
  supabaseClient: SupabaseClient | null;
  syncBusy: boolean;
  syncMessage: string;
  syncConflict: SyncConflict | null;
  onSyncNow: () => void;
  onUseCloud: () => void;
  onKeepLocal: () => void;
  onClose: () => void;
}

function friendlyAuthError(message: string, status?: number): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("email_address_not_authorized") ||
      normalized.includes("email address not authorized")) {
    return "El correo predeterminado de Supabase solo permite enviar mensajes a direcciones que pertenezcan al equipo de tu organización. Para habilitar otros correos, tendrás que configurar un servidor SMTP propio.";
  }

  if (status === 429 || normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "Se alcanzó el límite de envíos de correo de Supabase. Espera antes de volver a intentarlo.";
  }

  return "No se pudo enviar el enlace de acceso. Comprueba tu conexión y la configuración de Auth en Supabase. " + message;
}

export default function AccountDialog({
  open,
  configured,
  session,
  supabaseClient,
  syncBusy,
  syncMessage,
  syncConflict,
  onSyncNow,
  onUseCloud,
  onKeepLocal,
  onClose
}: AccountDialogProps) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setEmail("");
      setSending(false);
      setSigningOut(false);
      setSent(false);
      setMessage("");
    }
  }, [open]);

  useEffect(() => {
    if (session && open) {
      setSent(false);
      setMessage("");
    }
  }, [session, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const sendMagicLink = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!configured || !supabaseClient) {
      setMessage("Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en el entorno de esta aplicación.");
      return;
    }

    if (!isValidEmailAddress(normalizedEmail)) {
      setMessage("Escribe una dirección de correo válida.");
      return;
    }

    setSending(true);
    setMessage("");

    try {
      const redirectTo = buildAuthRedirectUrl(import.meta.env.BASE_URL, window.location.origin);
      const { error } = await supabaseClient.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectTo
        }
      });

      if (error) throw error;

      setEmail(normalizedEmail);
      setSent(true);
      setMessage("Solicitud enviada. Revisa tu bandeja de entrada y abre el enlace de acceso desde este mismo navegador.");
    } catch (error) {
      const authError = error instanceof Error ? error : new Error("Error desconocido");
      const status = typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status?: unknown }).status)
        : undefined;
      setMessage(friendlyAuthError(authError.message, Number.isFinite(status) ? status : undefined));
      setSent(false);
    } finally {
      setSending(false);
    }
  };

  const signOut = async () => {
    if (!supabaseClient) return;

    setSigningOut(true);
    setMessage("");

    try {
      const { error } = await supabaseClient.auth.signOut({ scope: "local" });
      if (error) throw error;
      setMessage("Se cerró la sesión de este dispositivo.");
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cerrar la sesión.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="account-backdrop" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="account-dialog-head">
          <div>
            <span className="eyebrow">PLANPLANNERU · CUENTA</span>
            <h2 id="account-title">Tu espacio académico</h2>
          </div>
          <button className="account-close" type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="account-dialog-body">
          {session ? (
            <>
              <div className="account-session-state">
                <span className="cloud-dot connected" aria-hidden="true" />
                Sesión iniciada
              </div>
              <strong className="account-email">{session.user.email || "Cuenta autenticada"}</strong>
              <p>Tu cuenta está identificada. Tu progreso sigue guardándose primero en este dispositivo; la sincronización se inicia manualmente desde aquí.</p>
              <section className="account-sync-panel" aria-label="Sincronización académica">
                <div className="account-sync-heading">
                  <strong>Respaldo en la nube</strong>
                  <span className="account-sync-state">{syncBusy ? "Comprobando…" : "Manual"}</span>
                </div>
                <p>Compara tu pensum local con la última revisión de tu cuenta. Si ambos tienen cambios, podrás elegir cuál conservar.</p>
                <button className="primary-button account-action" type="button" onClick={onSyncNow} disabled={syncBusy}>
                  {syncBusy ? "Sincronizando…" : "Sincronizar ahora"}
                </button>
                {syncMessage && <p className="account-sync-message" role="status">{syncMessage}</p>}
                {syncConflict && (
                  <div className="account-conflict">
                    <strong>Se detectaron dos versiones diferentes</strong>
                    <p>
                      La nube tiene la revisión {syncConflict.remoteRevision}
                      {syncConflict.remoteUpdatedAt && !Number.isNaN(Date.parse(syncConflict.remoteUpdatedAt))
                        ? " · actualizada " + new Date(syncConflict.remoteUpdatedAt).toLocaleString("es-DO")
                        : ""}.
                      No se ha sobrescrito ningún progreso.
                    </p>
                    <div className="account-conflict-actions">
                      <button className="secondary-button" type="button" onClick={onUseCloud} disabled={syncBusy}>
                        Usar versión de la nube
                      </button>
                      <button className="secondary-button" type="button" onClick={onKeepLocal} disabled={syncBusy}>
                        Conservar este dispositivo
                      </button>
                    </div>
                    <small>La opción local reemplaza la copia de la nube solo si su revisión no ha cambiado desde esta comprobación y descarga antes un respaldo de la versión remota. La opción de nube genera primero un respaldo JSON cuando este dispositivo ya tiene progreso.</small>
                  </div>
                )}
              </section>
              <button className="secondary-button account-action" type="button" onClick={signOut} disabled={signingOut || syncBusy}>
                {signingOut ? "Cerrando sesión…" : "Cerrar sesión en este dispositivo"}
              </button>
            </>
          ) : !configured || !supabaseClient ? (
            <div className="account-notice" role="status">
              <strong>La cuenta aún no está configurada.</strong>
              <p>Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY. Cuando estén configuradas, podrás identificarte con tu correo.</p>
            </div>
          ) : (
            <>
              <p>Escribe tu correo y te enviaremos un enlace seguro de acceso. No necesitas crear ni recordar una contraseña.</p>
              <form className="account-form" onSubmit={(event) => {
                event.preventDefault();
                void sendMagicLink();
              }}>
                <label htmlFor="account-email">Correo electrónico</label>
                <input
                  id="account-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setSent(false);
                    setMessage("");
                  }}
                  placeholder="tu.correo@ejemplo.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  disabled={sending}
                />
                <button className="primary-button account-action" type="submit" disabled={sending || !email.trim()}>
                  {sending ? "Enviando enlace…" : sent ? "Enviar otro enlace" : "Enviar enlace de acceso"}
                </button>
              </form>
              <div className="account-notice">
                <strong>Nota sobre el correo gratuito de Supabase</strong>
                <p>El proveedor predeterminado solo envía a miembros del equipo y tiene un límite bajo de mensajes. Para permitir registros de otras personas tendrás que configurar SMTP propio. El proyecto actual usa enlace mágico porque el plan gratuito no permite personalizar la plantilla para enviar códigos numéricos.</p>
              </div>
            </>
          )}

          {message && <p className={sent ? "account-message success" : "account-message"} role="status">{message}</p>}
          <p className="account-data-note">La sincronización solo ocurre cuando pulsas «Sincronizar ahora». En caso de conflicto, no se sobrescribe ningún progreso sin que elijas una versión.</p>
        </div>
      </section>
    </div>
  );
}
