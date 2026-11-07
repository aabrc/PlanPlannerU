import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { buildAuthRedirectUrl, isValidEmailAddress } from "../lib/auth";

interface AccountDialogProps {
  open: boolean;
  configured: boolean;
  session: Session | null;
  supabaseClient: SupabaseClient | null;
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
    <div className="account-backdrop" role="presentation" onMouseDown={(event) => {
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
              <p>Tu cuenta está identificada en este dispositivo. Tu pensum, horario y calificaciones siguen guardándose localmente; la sincronización con la nube se incorporará en la siguiente etapa.</p>
              <button className="secondary-button account-action" type="button" onClick={signOut} disabled={signingOut}>
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
          <p className="account-data-note">Iniciar sesión no copia, reemplaza ni elimina tu progreso local. No se enviará ningún dato académico a la nube hasta activar la sincronización con sus controles de seguridad.</p>
        </div>
      </section>
    </div>
  );
}
