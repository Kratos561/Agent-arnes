# Agent Arnes

Cliente de chat estático, pensado para GitHub Pages. Incluye streaming con APIs compatibles con OpenAI, conversaciones persistentes en el navegador, Markdown/LaTex y un pequeño banco de herramientas locales.

## Uso

1. Abre la aplicación publicada.
2. En **Ajustes**, introduce una API key y el endpoint de un proveedor que permita solicitudes CORS desde el navegador. OpenRouter es la opción preconfigurada.
3. Pulsa **Probar conexión** para cargar modelos y selecciona uno.

La clave y el historial se almacenan solamente en `localStorage` del navegador. No los publiques, no los incluyas en el repositorio y no uses claves con permisos excesivos.

## Herramientas locales

El botón **Herramientas** ofrece validación/formato JSON, Base64, codificación URL, SHA-256, contador aproximado de tokens y marcas de tiempo. Todas se ejecutan dentro del navegador, sin rutas API ni ejecución de shell.

## Desarrollo

```bash
bun install
bun run dev
bun run build
```

También puedes usar `npm install` y `npm run dev` si prefieres npm.

## GitHub Pages

El workflow `.github/workflows/deploy.yml` ejecuta una exportación estática y publica `out/`. En el repositorio, ve a **Settings → Pages** y selecciona **GitHub Actions** como fuente. Tras hacer push a `main`, la página queda disponible en:

`https://kratos561.github.io/Agent-arnes/`

## Límites intencionales

GitHub Pages no ejecuta servidor. Por ello este proyecto no incorpora rutas `/api`, proxy de claves, MCP, acceso a archivos o comandos. Un proveedor que no permita CORS no podrá usarse desde Pages; para ello se necesita un backend separado y seguro, fuera de este repositorio estático.
