# PlanPlannerU — React + Vite

## Rama de desarrollo

`feature/react-vite-migration-clean`

La rama `main` se mantiene separada mientras se completa y valida la migración. La aplicación HTML anterior se conserva en `legacy/index.html` como referencia funcional.

## Stack

- React 19 + TypeScript
- Vite 6
- Supabase JS 2: autenticación por enlace mágico implementada; sincronización académica pendiente
- Capacitor 7: configuración inicial para Android/iOS

## Requisitos

- Node.js 22.12 o superior (Node 22 LTS recomendado).
- npm 10 o superior.

## Ejecutar en tu PC

```bash
npm ci
npm run dev
```

El repositorio incluye `package-lock.json`. Usa `npm ci` para instalar exactamente el árbol versionado. Cuando agregues o actualices dependencias, utiliza `npm install` y confirma en el mismo cambio tanto `package.json` como `package-lock.json`.

## Validar y compilar

```bash
npm test
npm run build
npm run preview
```

GitHub Actions ejecuta `npm ci`, las pruebas automatizadas y la compilación en cada actualización de la rama y en las solicitudes de integración hacia `main`.

## Funcionalidades migradas

- Pensum ITT-2020 completo: 12 períodos, 69 asignaturas obligatorias, 14 grupos electivos, 91 opciones y 212 créditos.
- Registro de asignaturas pendientes, en curso y aprobadas; búsqueda y filtros.
- Selección de electivas y validación de incompatibilidades configuradas.
- Requisitos externos, incluidos MAT311 e ILE203 reconocidos como cumplidos por admisión.
- Asesor académico con orden por año y período, materias rezagadas, requisitos pendientes y criterios de desbloqueo.
- Perfil personal de dificultad y experiencia por asignatura, conservado localmente.
- Horario semanal, materias en curso por organizar, actividades personales, 16 colores, detección de conflictos y exportación a PDF.
- Registro de calificaciones e índice por período y acumulado.
- Meta académica, requisitos de graduación y proyección orientativa de finalización.
- Respaldo JSON e importación.
- Inicio de sesión por correo mediante enlace mágico, sesión persistente y cierre local de sesión.
- Compatibilidad con la clave local `itt2020_pensum_tracker_v2` y migración del formato antiguo `pensum_states`.

## Persistencia local

El progreso académico se guarda automáticamente en el navegador mediante `localStorage`. Los estados, electivas, horario, calificaciones y perfiles del asesor todavía no se sincronizan con una cuenta. Iniciar sesión solo identifica al usuario: no copia ni reemplaza datos académicos en Supabase. Exporta respaldos JSON antes de cambiar de navegador o limpiar los datos del sitio.

La versión original se conserva en `legacy/index.html`; no se elimina durante esta fase de migración.

## Supabase

El cliente se configura en `src/lib/supabase.ts`. Copia `.env.example` a `.env.local` y coloca la URL del proyecto y su clave publicable:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Nunca agregues `service_role`, `sb_secret` ni otros secretos al frontend, a archivos versionados o a GitHub.

### Autenticación actual

La aplicación utiliza `signInWithOtp` con un enlace mágico y `emailRedirectTo` adaptado a la ruta de Vite. Supabase restaura la sesión en el navegador y la interfaz permite cerrar la sesión de este dispositivo. Para que el retorno funcione, agrega estas direcciones a **Authentication → URL Configuration → Redirect URLs**:

- Desarrollo local: `http://localhost:5173/**`
- GitHub Pages: `https://aabrc.github.io/PlanPlannerU/**`

Si se utiliza otro dominio o puerto, añádelo explícitamente a la lista de redirecciones permitidas.

**Limitaciones del correo en el plan actual:** la organización del proyecto está en Free y el proyecto se creó el 5 de noviembre de 2026. El SMTP predeterminado de Supabase solo permite enviar a direcciones registradas como miembros del equipo, tiene un límite reducido (actualmente 2 mensajes por hora) y funciona sin garantía de entrega. Además, los proyectos Free nuevos no pueden personalizar las plantillas de correo con el SMTP predeterminado. Por eso esta versión utiliza enlace mágico, no un código numérico de seis dígitos. Para permitir cuentas de otros usuarios o personalizar el correo para enviar códigos OTP, configura un proveedor SMTP propio en Supabase Auth.

### Base de datos existente

El proyecto ya contiene `public.user_planner_data`. La auditoría confirmó:

- `user_id uuid`: clave primaria y referencia a `auth.users(id)` con eliminación en cascada.
- `state jsonb NOT NULL`, `device_id text NOT NULL` y `updated_at timestamptz NOT NULL DEFAULT now()`.
- RLS habilitado. Las políticas de lectura, inserción y actualización se limitan a `authenticated` y comprueban que `user_id` coincida con `auth.uid()`.
- `authenticated` tiene `SELECT`, `INSERT` y `UPDATE`; no tiene acceso anónimo ni política de eliminación.
- La tabla tenía cero filas en la auditoría.

Se optimizaron las tres políticas para evaluar `(select auth.uid())` sin cambiar la regla de propiedad. La migración `20261107025049_optimize_user_planner_data_rls.sql` está aplicada y versionada. Después de la corrección, los asesores de seguridad, rendimiento y salud no reportaron hallazgos.

**Importante:** la tabla y su esquema inicial son anteriores al historial de migraciones del repositorio. La migración registrada solo optimiza las políticas existentes; no crea ni recrea la tabla. No ejecutes un reinicio de la base de datos ni una migración que intente recrearla. Antes de activar la sincronización, hay que registrar el esquema preexistente de forma no destructiva e incorporar control de concurrencia para impedir que un dispositivo sobrescriba silenciosamente cambios recientes de otro.

La aplicación todavía no implementa lectura, guardado ni sincronización del pensum con esa tabla.

## Pendiente antes de producción

1. Documentar y registrar de forma no destructiva el esquema Supabase preexistente.
2. Configurar SMTP propio para permitir registros fuera del equipo y, si se desea, usar OTP numérico.
3. Implementar sincronización local-first por usuario, con detección y resolución de conflictos entre dispositivos y funcionamiento sin conexión.
4. Decidir y probar la estrategia de almacenamiento local (`localStorage` o IndexedDB) antes de migrar datos.
5. Añadir Service Worker, instalación PWA y pruebas de actualización/caché.
6. Ampliar las pruebas automatizadas y realizar validación manual en navegadores y dispositivos móviles.
7. Compilar y probar Android/iOS con Capacitor.

## GitHub Pages

Vite configura la ruta base `/PlanPlannerU/` durante GitHub Actions. Antes de publicar esta migración, configura GitHub Pages en **Settings → Pages → Build and deployment → GitHub Actions**.
