# PlanPlannerU — migración React + Vite

## Rama de desarrollo

`feature/react-vite-migration-clean`

La rama `main` se mantiene separada mientras se completa y valida la migración. La aplicación HTML anterior se conserva en `legacy/index.html` como referencia funcional.

## Stack

- React 19 + TypeScript
- Vite 6
- Supabase JS (cliente preparado; autenticación y sincronización aún no conectadas)
- Capacitor 7 (configuración inicial para Android/iOS)

## Requisitos

- Node.js 22.12 o superior (Node 22 LTS recomendado).
- npm 10 o superior.

## Ejecutar en tu PC

```bash
npm install
npm run dev
```

## Validar y compilar

```bash
npm test
npm run build
npm run preview
```

El workflow de GitHub Actions ejecuta instalación, pruebas automatizadas y compilación en cada actualización de la rama y en las solicitudes de integración hacia `main`.

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
- Compatibilidad con la clave local `itt2020_pensum_tracker_v2` y migración del formato antiguo `pensum_states`.

## Persistencia local

El progreso se guarda en el navegador mediante `localStorage`. Los datos personales del asesor, estados, electivas, horario y calificaciones todavía no se sincronizan con una cuenta. Exporta respaldos JSON antes de cambiar de navegador o limpiar los datos del sitio.

La versión original se conserva en `legacy/index.html`; no se elimina durante esta fase de migración.

## Supabase

El cliente base está preparado en `src/lib/supabase.ts`. Para configurarlo localmente, copia `.env.example` a `.env.local` y proporciona la URL del proyecto y su clave publicable.

No agregues claves `service_role`, `sb_secret` ni otros secretos al frontend, a archivos versionados o a GitHub.

El proyecto Supabase ya contiene `public.user_planner_data`, con RLS y políticas que limitan las operaciones al usuario autenticado propietario del registro. La aplicación React aún no implementa inicio de sesión, lectura, guardado ni sincronización con esa tabla. El historial de migraciones del proyecto está vacío; antes de cambiar el esquema hay que registrar y verificar su estado actual sin recrear ni eliminar la tabla existente.

## Pendiente antes de producción

1. Registrar y verificar el esquema Supabase existente mediante migraciones versionadas.
2. Implementar autenticación por correo y OTP, recuperación de sesión y cierre de sesión.
3. Implementar almacenamiento local-first y sincronización segura por usuario, con tratamiento de conflictos entre dispositivos y funcionamiento sin conexión.
4. Decidir y probar la estrategia de almacenamiento local (localStorage o IndexedDB) antes de migrar datos.
5. Añadir Service Worker, instalación PWA y pruebas de actualización/caché.
6. Ampliar las pruebas automatizadas y realizar validación manual en navegadores y dispositivos móviles.
7. Crear y versionar `package-lock.json`; después cambiar la instalación de CI a `npm ci`.
8. Compilar y probar Android/iOS con Capacitor.

## GitHub Pages

Vite configura la ruta base `/PlanPlannerU/` durante GitHub Actions. Antes de publicar esta migración, configura GitHub Pages en **Settings → Pages → Build and deployment → GitHub Actions**.
