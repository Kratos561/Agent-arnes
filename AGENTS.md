# Agent Instructions

## Project Overview
This is an AI-Agent Ready Platform built with Next.js 15, React 19, and TypeScript. It provides a universal chat workspace with support for multiple AI providers and includes complete backend infrastructure for AI agents.

## Architecture
- **Frontend**: Next.js 15 App Router with React 19
- **Styling**: Tailwind CSS v4
- **State Management**: Custom useSyncExternalStore pattern with localStorage
- **API Routes**: REST API and MCP server
- **AI Integration**: Google GenAI SDK with streaming support

## Development Commands

- npm install
- npm run dev
- npm run build
- npm run start
- npm run lint
- npm run clean

## Key Files

- app/page.tsx - Main chat interface
- lib/api-client.ts - Streaming chat client with automatic fallback
- lib/storage.ts - Reactive state management
- lib/agent-*.ts - Agent infrastructure
- app/api/* - API routes

## Important Notes

### Harness Context
This project includes a built-in harness system that provides:
1. Markdown rendering with syntax highlighting
2. LaTeX/KaTeX support for mathematical notation
3. Reasoning panels for chain-of-thought display
4. Code blocks with language detection and copy buttons
5. System prompts with runtime context injection

### Agent Safety
- Always commit changes before large modifications
- Use the provided backup system (lib/agent-backup.ts)
- Check audit logs (lib/agent-audit.ts) before destructive operations
- Verify API responses before executing agent actions

### Testing
When testing changes:
1. Test chat functionality with different providers
2. Verify session persistence across page reloads
3. Check dark mode toggle behavior
4. Test export functionality
5. Verify API endpoints respond correctly
