# PlanPlannerU — migración React + Vite

## Rama
`feature/react-vite-migration-clean`

La rama `main` permanece intacta durante la migración. La versión HTML original se conserva en `legacy/index.html`.

## Stack
- React 19 + TypeScript
- Vite 6
- Supabase JS (cliente preparado; login todavía no conectado)
- Capacitor 7 (configuración inicial)
- GitHub Pages

## Requisitos
Node.js 20.19+ (Node 22 LTS recomendado).

## Ejecutar en tu PC
```bash
npm install
npm run dev
```

## Compilar
```bash
npm run build
npm run preview
```

## Migración inicial incluida
- Plan académico extraído de la app original: 12 períodos, 69 asignaturas obligatorias, 14 grupos electivos, 91 opciones y 212 créditos.
- MAT311 e ILE203 siguen reconocidos como requisitos cumplidos por admisión.
- Se mantiene la clave local `itt2020_pensum_tracker_v2` y la compatibilidad de migración con `pensum_states`.
- Primera interfaz React: resumen, pensum, búsqueda, filtros, estados, selección de electivas, requisitos externos, meta y respaldo JSON.
- Copia de la aplicación anterior en `legacy/index.html`.

## Pendiente antes de publicar
1. Completar el calendario semanal y las actividades personales.
2. Migrar el asesor académico y la proyección de graduación.
3. Trasladar progresivamente el almacenamiento a IndexedDB y separar datos por UUID de cuenta.
4. Implementar autorización de correos, OTP y revocación de sesiones del lado del servidor.
5. Implementar sincronización offline-first, cola durable y resolución de conflictos.
6. Integrar un Service Worker sobre el build de Vite y probar la PWA.
7. Añadir pruebas automatizadas y validar en dos dispositivos.
8. Compilar y probar Android/iOS con Capacitor.

## Supabase
Cliente preparado en `src/lib/supabase.ts`. Copia `.env.example` a `.env.local` y agrega URL y clave publicable al implementar autenticación. Nunca incluyas claves secretas ni `service_role` en el frontend o GitHub.

La tabla existente `public.user_planner_data` se conserva. No vuelvas a ejecutar migraciones destructivas.

## GitHub Pages
Vite configura `/PlanPlannerU/` durante GitHub Actions. Antes de publicar la migración, configura GitHub Pages en Settings → Pages → Build and deployment → GitHub Actions.
