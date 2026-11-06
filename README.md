# PlanPlannerU — migración React + Vite

## Rama
`feature/react-vite-migration`

La rama `main` se mantiene intacta. La aplicación anterior se conserva en `legacy/index.html`.

## Stack
- React 19 + TypeScript
- Vite 6
- Supabase JS (cliente preparado; autenticación aún no conectada)
- Capacitor 7 (configuración inicial)
- GitHub Pages

## Requisitos locales
Node.js 20.19+ recomendado (Node 22 LTS).

## Ejecutar
```bash
npm install
npm run dev
```

## Compilar
```bash
npm run build
npm run preview
```

## Primera fase migrada
- Se extrajo el pensum original: 12 períodos, 69 materias obligatorias, 14 grupos electivos, 91 opciones y 212 créditos.
- Se conservan MAT311 e ILE203 como requisitos cumplidos por admisión.
- Se mantiene la clave local `itt2020_pensum_tracker_v2` y compatibilidad con la migración antigua `pensum_states`.
- Se creó una interfaz React inicial con resumen, pensum, búsqueda, filtros, estados, electivas, requisitos externos, meta y respaldos.
- La aplicación original se preserva en `legacy/index.html`.

## Pendiente antes de publicar
1. Migrar completamente el calendario semanal y las actividades personales.
2. Migrar el asesor académico, la proyección de graduación y detalles de la app anterior.
3. Trasladar el almacenamiento progresivamente a IndexedDB y separar datos por UUID de cuenta.
4. Implementar autorización de correos, OTP y revocación de sesiones en servidor.
5. Crear sincronización offline-first, cola durable y resolución de conflictos.
6. Integrar un service worker sobre el build de Vite y probar la PWA.
7. Añadir pruebas automatizadas y validar en dos dispositivos.
8. Compilar y probar Android/iOS con Capacitor.

## Supabase
Cliente preparado en `src/lib/supabase.ts`. Copia `.env.example` a `.env.local` y añade la URL del proyecto y la clave publicable cuando se implemente autenticación. Nunca incluyas claves secretas ni `service_role` en frontend o GitHub.

La tabla `public.user_planner_data` que ya creaste se conserva; no vuelvas a ejecutar migraciones destructivas.

## GitHub Pages
Vite usa `/PlanPlannerU/` durante GitHub Actions. El workflow se ejecutará en `main` cuando se decida publicar la migración. Antes, cambia GitHub Pages a **GitHub Actions** en Settings → Pages.
