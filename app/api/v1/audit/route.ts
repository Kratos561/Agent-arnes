import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateAgentAuth } from '@/lib/agent-auth';
import { executeToolCall } from '@/lib/agent-tools';

export async function GET(req: NextRequest) {
  const auth = validateAgentAuth(req, 'platform:read');
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  const url = new URL(req.url);
  const agentId = url.searchParams.get('agent_id') || undefined;
  const tool = url.searchParams.get('tool') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 50;

  const requestId = req.headers.get('x-request-id') || `req_${crypto.randomBytes(6).toString('hex')}`;
  const result = await executeToolCall('audit_query', { agent_id: agentId, tool, status, limit }, {
    agent: auth.agent,
    request_id: requestId,
    dry_run: false,
  });

  return NextResponse.json(result.data);
}
