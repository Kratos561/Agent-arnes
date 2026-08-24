import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateAgentAuth } from '@/lib/agent-auth';
import { executeToolCall } from '@/lib/agent-tools';

export async function POST(req: NextRequest) {
  const auth = validateAgentAuth(req);
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  try {
    const body = await req.json();
    const { tool, parameters, dry_run } = body;

    if (!tool || typeof tool !== 'string') {
      return NextResponse.json({ error: 'El campo "tool" es obligatorio.' }, { status: 400 });
    }

    const requestId = req.headers.get('x-request-id') || `req_${crypto.randomBytes(6).toString('hex')}`;
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

    const result = await executeToolCall(tool, parameters || {}, {
      agent: auth.agent,
      request_id: requestId,
      dry_run: Boolean(dry_run),
      ip,
    });

    if (!result.success && result.pending_confirmation_id) {
      return NextResponse.json(
        {
          status: 'pending_confirmation',
          message: result.message,
          pending_confirmation_id: result.pending_confirmation_id,
        },
        { status: 202 }
      );
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Error al ejecutar herramienta' }, { status: 400 });
    }

    return NextResponse.json({
      status: 'success',
      dry_run: result.dry_run || false,
      message: result.message,
      backup_id: result.backup_id,
      diff: result.diff,
      data: result.data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Error interno de ejecución: ${err.message}` }, { status: 500 });
  }
}
