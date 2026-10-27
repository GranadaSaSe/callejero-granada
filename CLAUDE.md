# Callejero Granada

App web instalable (PWA) para preparar la prueba de callejero de la oposición de Bomberos de Granada.

## Cómo trabajar en este proyecto

- Quien usa este proyecto no sabe programar. Claude escribe todo el código; la persona decide, prueba en el móvil y revisa los datos.
- Hablar siempre en español, paso a paso y sin jerga. Si hace falta una palabra técnica, explicarla.
- Al empezar cada sesión, leer el plan y decir en qué paso estamos.
- Plan completo (Claude Docs): https://claude.ai/artifact/VhxfqZUrVR3QZAtypDEZng — marcar ahí los pasos terminados.
- Mensajes de commit en español.

## Estado

- Paso 0 terminado salvo el 0.8: "Hola Granada" publicada en https://granadasase.github.io/callejero-granada/ e instalada y probada en modo avión en Android e iPhone. El material de estudio irá a `material/` (no se sube a GitHub).
- Siguiente: Fase 1, empezando por el paso 1.1 (descargar los datos de Granada).
- Para subir cambios (`git push`) se usa el inicio de sesión guardado por Git Credential Manager; si pide credenciales, lanzar el push en el panel de Terminal para que se abra el navegador.

## Datos del examen que usa la app

- Test de 50 preguntas + 5 de reserva, 60 minutos.
- Cada fallo resta 1/3 (puede ser 1/2): la penalización debe ser configurable.
- Callejero: todo el municipio de Granada, sus 8 distritos (Albaicín, Beiro, Centro, Chana, Genil, Norte, Ronda, Zaidín) y sus barrios.
- Área metropolitana: solo carreteras y salidas de autovía.
- Trayectos con sentidos de circulación normales (no como vehículo de emergencia).
- Examen previsto hacia octubre de 2027.

## Técnica

- Vite + vite-plugin-pwa, JavaScript sin framework por ahora. Mapas con MapLibre GL JS a partir de la Fase 1.
- Datos: OpenStreetMap (licencia ODbL: mostrar "© colaboradores de OpenStreetMap") y Callejero Digital de Andalucía (CDAU). Si chocan con el material oficial, manda el material oficial.
- El progreso de estudio se guarda solo en el dispositivo; no hay servidor.
- Publicación: GitHub Pages con GitHub Actions (`.github/workflows/deploy.yml`) en cada push a `main`. La app vive en `/callejero-granada/` (ver `base` en `vite.config.js`).
- Repositorio: `GranadaSaSe/callejero-granada`.
- Iconos: se generan desde `public/icon.svg` con `npm run iconos` (configuración en `pwa-assets.config.js`).

## Comandos

- `npm install` — instala las dependencias.
- `npm run dev` — servidor de desarrollo (sin modo sin conexión).
- `npm run build` y `npm run preview` — versión final en local, con modo sin conexión.

## Reglas de seguridad

- Nunca subir `material/` ni documentos personales: están en `.gitignore`.
- Añadir archivos a Git por su nombre y revisar `git status` antes de cada commit; nunca `git add -A` a ciegas.
- En la raíz de la carpeta puede haber documentos personales (por ejemplo, con contraseñas): no abrirlos nunca.
