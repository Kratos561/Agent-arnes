# Agent Instructions

## Project Overview
This is a static AI chat workspace built with Next.js 15, React 19, and TypeScript. It can be exported safely to GitHub Pages and connects directly to OpenAI-compatible providers that permit browser CORS requests.

## Architecture
- **Frontend**: Next.js 15 App Router with React 19
- **Styling**: Tailwind CSS v4
- **State Management**: Custom useSyncExternalStore pattern with localStorage
- **Deployment**: Static export to GitHub Pages
- **AI Integration**: Direct OpenAI-compatible streaming with user-supplied browser-local keys

## Development Commands

- npm install
- npm run dev
- npm run build
- npm run start
- npm run lint
- npm run clean

## Key Files

- app/page.tsx - Main chat interface
- lib/api-client.ts - Direct streaming chat client and honest harness context
- lib/storage.ts - Reactive state management
- components/ToolsModal.tsx - Browser-only local tools

## Important Notes

### Harness Context
This project includes a browser-only harness system that provides:
1. Markdown rendering with syntax highlighting
2. LaTeX/KaTeX support for mathematical notation
3. Reasoning panels for chain-of-thought display
4. Code blocks with language detection and copy buttons
5. System prompts with runtime context injection
6. Local JSON, Base64, URL, SHA-256, token-estimation and timestamp tools

### Agent Safety
- Do not add Next API routes: GitHub Pages serves only static files.
- Do not claim server, filesystem, shell, MCP or web-browsing powers from the static client.
- Provider API keys remain in localStorage and must never be committed.

### Testing
When testing changes:
1. Test chat functionality with different providers
2. Verify session persistence across page reloads
3. Check dark mode toggle behavior
4. Test export functionality
5. Verify provider connection failures present a useful CORS/key message
