import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateAgentAuth } from '@/lib/agent-auth';
import { executeToolCall } from '@/lib/agent-tools';

export async function GET(req: NextRequest) {
  const auth = validateAgentAuth(req, 'settings:read');
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  const requestId = req.headers.get('x-request-id') || `req_${crypto.randomBytes(6).toString('hex')}`;
  const result = await executeToolCall('settings_read', {}, {
    agent: auth.agent,
    request_id: requestId,
    dry_run: false,
  });

  return NextResponse.json(result.data);
}

export async function POST(req: NextRequest) {
  const auth = validateAgentAuth(req, 'settings:write');
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  try {
    const body = await req.json();
    const requestId = req.headers.get('x-request-id') || `req_${crypto.randomBytes(6).toString('hex')}`;
    const result = await executeToolCall('settings_update', body, {
      agent: auth.agent,
      request_id: requestId,
      dry_run: false,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
