import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateAgentAuth } from '@/lib/agent-auth';
import { executeToolCall } from '@/lib/agent-tools';

export async function POST(req: NextRequest) {
  const auth = validateAgentAuth(req, 'code:write');
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  try {
    const body = await req.json();
    const requestId = req.headers.get('x-request-id') || `req_${crypto.randomBytes(6).toString('hex')}`;
    const result = await executeToolCall('file_edit', body, {
      agent: auth.agent,
      request_id: requestId,
      dry_run: Boolean(body.dry_run),
    });

    if (!result.success && result.pending_confirmation_id) {
      return NextResponse.json({ status: 'pending_confirmation', pending_confirmation_id: result.pending_confirmation_id }, { status: 202 });
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
