import { NextRequest, NextResponse } from 'next/server';
import { validateAgentAuth } from '@/lib/agent-auth';
import { PLATFORM_TOOLS } from '@/lib/agent-tools';

export async function GET(req: NextRequest) {
  const auth = validateAgentAuth(req);
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  // Filter tools accessible by the agent based on scopes
  const accessibleTools = PLATFORM_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    category: tool.category,
    required_scope: tool.required_scope,
    dangerous: tool.dangerous || false,
    parameters: tool.parameters,
  }));

  return NextResponse.json({
    total_tools: accessibleTools.length,
    agent: {
      name: auth.agent.name,
      role: auth.agent.role,
      scopes: auth.agent.scopes,
    },
    tools: accessibleTools,
  });
}
