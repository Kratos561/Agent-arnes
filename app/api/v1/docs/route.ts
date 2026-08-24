import { NextResponse } from 'next/server';

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>API Universal para Agentes de IA - Documentación OpenAPI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; background: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
    .swagger-ui .highlight-code { filter: invert(100%) hue-rotate(180deg); }
    .header-banner { background: #1e293b; padding: 18px 24px; border-b: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
    .header-banner h1 { margin: 0; font-size: 18px; font-weight: 600; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .header-banner p { margin: 4px 0 0 0; font-size: 13px; color: #94a3b8; }
    .badge { background: #0284c7; color: white; padding: 3px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header-banner">
    <div>
      <h1><span>🤖</span> API Universal & Servidor MCP para Agentes de IA <span class="badge">v1.0.0</span></h1>
      <p>Control Total de Plataforma: SUPER_ADMIN_AGENT y FULL_PLATFORM_ACCESS</p>
    </div>
    <div>
      <a href="/api/v1/openapi.json" target="_blank" style="color:#38bdf8; font-size:13px; text-decoration:none; border:1px solid #0284c7; padding:6px 12px; border-radius:6px;">Ver OpenAPI JSON</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "/api/v1/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
