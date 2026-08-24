# Agent-arnes

Plataforma lista para Agentes de IA (AI-Agent Ready Platform) con interfaz de chat universal y backend completo para ejecución de agentes.

## Características

- Chat Universal: Soporte para múltiples proveedores de IA (Gemini, OpenRouter, Ollama, LMStudio)
- Streaming en Tiempo Real: Respuestas en streaming con Server-Sent Events (SSE)
- Backend de Agentes: Infraestructura completa para ejecutar y gestionar agentes de IA
- API REST & MCP: Endpoints REST universales y servidor Model Context Protocol
- Interfaz Moderna: UI construida con Next.js 15, React 19 y Tailwind CSS v4
- Persistencia Local: Gestión de sesiones con localStorage y sincronización reactiva
- Modo Oscuro: Soporte completo para temas claro y oscuro
- Exportación: Exporta conversaciones a Markdown o JSON

## Stack Tecnológico

- Framework: Next.js 15 (App Router)
- Lenguaje: TypeScript
- UI: React 19 + Tailwind CSS v4
- IA: Google GenAI SDK
- Estado: useSyncExternalStore + localStorage
- Streaming: Server-Sent Events (SSE)

## Instalación

1. Clonar el repositorio
2. Instalar dependencias: npm install
3. Configurar variables de entorno: cp .env.example .env.local
4. Iniciar servidor: npm run dev

## Uso

### Desarrollo Local

npm run dev

Abre http://localhost:3000 en tu navegador.

### Construcción para Producción

npm run build
npm run start

### Despliegue en GitHub Pages

Este proyecto está configurado para desplegarse automáticamente en GitHub Pages mediante GitHub Actions.

1. Haz push a la rama main
2. GitHub Actions construirá y desplegará automáticamente
3. Accede a: https://kratos561.github.io/Agent-arnes/

## Para Agentes de IA

Este repositorio incluye un archivo AGENTS.md con instrucciones específicas para agentes de IA. El harness proporciona:

- Contexto de ejecución en tiempo real
- Renderizado de Markdown con resaltado de sintaxis
- Soporte para notación matemática (LaTeX/KaTeX)
- Paneles de razonamiento para chain-of-thought
- Sistema de backup y auditoría

## Documentación

### API Endpoints

- GET/POST /api/v1/* - API REST universal
- GET/POST /api/mcp - Servidor Model Context Protocol
- POST /api/agent - Ejecución de agentes de IA
- POST /api/proxy/* - Proxy para APIs externas

## Configuración

### Variables de Entorno

Copia .env.example a .env.local y configura:

- GEMINI_API_KEY=tu_api_key_de_gemini
- OPENROUTER_API_KEY=tu_api_key_de_openrouter
- APP_URL=http://localhost:3000

### Proveedores Soportados

- Google Gemini: Sin configuración adicional
- OpenRouter: Requiere API key
- Ollama: Para modelos locales
- LMStudio: Para modelos locales

## Licencia

Este proyecto fue generado desde Google AI Studio.
