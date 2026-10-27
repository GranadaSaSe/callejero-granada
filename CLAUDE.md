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
- Fase 1 en curso en la rama `fase1-datos` (se une a `main` cuando la app tenga algo nuevo que enseñar). Pasos 1.1, 1.2 y 1.4 hechos. Paso 1.3: el mapa de revisión está hecho y la persona va revisando los tramos dudosos poco a poco (207 a 27-10-2026). Siguiente: 1.5 (ejes principales).

## App

- Sin framework: `src/main.js` hace de enrutador por `#/ruta` y carga cada vista de `src/vistas/` la primera vez. `src/crear.js` crea elementos sin usar HTML (los textos nunca se insertan como HTML).
- Mapa de estudio (`src/vistas/mapa.js`): MapLibre empaquetado por Vite (`setWorkerUrl` con `?url`), dibujado solo con `public/datos/` y las letras de `public/fuentes/` (Noto Sans, glifos de demotiles.maplibre.org), así que funciona sin internet. La regla CSS del contenedor del mapa necesita más especificidad que `.maplibregl-map`.
- El service worker guarda todo (datos, letras, librería): ~6,5 MB. Al probar en el navegador integrado, borrar el service worker y las cachés y añadir `?r=N` a la dirección para no ver una versión vieja.
- Cifras y pendientes de los datos: `datos/informe-datos.md` (se regenera con `npm run datos:procesar`).

## Datos

- Flujo: `npm run datos:descargar` (a `datos/crudos/`, no se sube) → `npm run datos:procesar` (a `public/datos/` y `datos/informe-datos.md`, sí se suben).
- Calles y tramos: del CDAU (oficial). Se muestra el nombre como lo escribe OSM si es equivalente (el CDAU a veces quita tildes y artículos); el oficial queda en `nombreOficial`.
- Sentido de circulación: del CDAU y, si no lo trae, de OSM. Códigos del campo `circulacion` del CDAU, deducidos comparando con OSM: 311/331 único en el sentido del dibujo, 322/332 único al revés, 333 doble, 330 peatonal. Si las dos fuentes no coinciden, el tramo es "dudoso" y se revisa a mano.
- Inicio y fin de cada calle: donde empieza la numeración (portales del CDAU); sin portales, el extremo más cercano al Ayuntamiento.
- Mapa de revisión (paso 1.3): doble clic en `Revisar datos.bat` (o `npm run revisar`) abre http://localhost:4321/ con los tramos de `datos/dudosos.json`, de las calles principales a las secundarias. Cada decisión se guarda en `datos/revisiones.json`. Cuando la persona diga que ha revisado, ejecutar `npm run datos:procesar` (aplica las decisiones y rehace `dudosos.json`) y hacer commit de `datos/` y `public/datos/`. Para probarlo desde Claude: configuración `revision` de `.claude/launch.json` (apagarla después, usa el mismo puerto).
- Distritos y barrios: OSM, 8 distritos y 32 barrios. Confirmado que el Zaidín tiene un solo barrio (Zaidín - Vergeles).
- Lugares de interés y carreteras: OSM. Parques de Bomberos Norte (Av. Juan Pablo II) y Sur (C/ Antonio Dalmases) son los probables orígenes de los trayectos.
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
