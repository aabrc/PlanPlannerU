# PlanPlannerU — evolución multiplataforma

Rama de trabajo: `feature/pwa-native-cloud-sync`

## Estado
Esta rama prepara la base técnica para PWA, autenticación por email, sincronización cloud y empaquetado nativo. No es todavía una versión lista para producción: la conexión real requiere crear/configurar un proyecto Supabase y validar el flujo de sincronización con datos de prueba.

## Diseño
- La aplicación conserva su almacenamiento local actual para poder trabajar offline.
- Supabase Auth permite iniciar sesión con código de un solo uso enviado al correo.
- PostgreSQL guarda una copia del estado académico por usuario, protegida con Row Level Security.
- Service Worker almacena el shell de la web.
- Capacitor es la ruta propuesta para Android e iOS.

## Configuración cloud
1. Crear un proyecto en Supabase.
2. Ejecutar `supabase/schema.sql` en SQL Editor.
3. En Authentication → URL Configuration, registrar la URL pública de PlanPlannerU y las URL de prueba.
4. Configurar el proveedor Email y un SMTP de producción antes de abrir registros al público.
5. Copiar `cloud-config.example.js` como `cloud-config.js`, rellenar la URL y la clave publicable.
6. No publicar nunca una clave `service_role`. La clave publicable se puede usar en cliente porque las tablas quedan protegidas por RLS.

## PWA
`manifest.webmanifest`, `sw.js` y `assets/icon.svg` son los archivos base. El service worker almacena los archivos locales de la aplicación. Para que la apariencia sea totalmente offline todavía hay que alojar localmente las fuentes y Font Awesome que hoy se cargan desde CDN.

## Aplicación nativa
Capacitor requiere Node.js 22+, dependencias instaladas y proyectos nativos:
```bash
npm install
npx cap add android
npx cap add ios
```
Android puede compilarse desde Android Studio. Para iOS se necesita macOS con Xcode. GitHub Pages seguirá sirviendo la versión web/PWA.

## Antes de producción
- Añadir interfaz de login (email + OTP) conectada a `window.PlanPlannerUCloud`.
- Revisar estrategia de conflictos entre dispositivos: el prototipo de sincronización usa confirmación al detectar una copia remota más reciente; no es todavía una fusión automática de cambios concurrentes.
- Añadir IndexedDB y una cola durable de operaciones, en lugar de depender solamente de localStorage.
- Alojar fuentes e iconos localmente.
- Probar exportación/importación, restauración, pérdida de red y dos dispositivos editando a la vez.
- Añadir pruebas y un pipeline de build/release.

## Seguridad y privacidad
Cada usuario debe ver exclusivamente su propio registro. No usar el correo como identificador de autorización: se usa el UUID interno de Supabase Auth. La cuenta requiere verificación del correo.
