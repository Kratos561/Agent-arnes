import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateAgentAuth } from '@/lib/agent-auth';
import { getDatabase, saveDatabase } from '@/lib/agent-db';
import { executeToolCall } from '@/lib/agent-tools';

export async function GET(req: NextRequest) {
  const auth = validateAgentAuth(req, 'settings:read');
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  const db = getDatabase();
  return NextResponse.json({
    pending: db.pending_confirmations.filter((p) => p.status === 'pending'),
    all: db.pending_confirmations.slice(0, 30),
  });
}

export async function POST(req: NextRequest) {
  const auth = validateAgentAuth(req, 'settings:write');
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  try {
    const body = await req.json();
    const { confirmation_id, action } = body; // action: 'approve' | 'reject'

    if (!confirmation_id) {
      return NextResponse.json({ error: 'confirmation_id es requerido' }, { status: 400 });
    }

    const db = getDatabase();
    const item = db.pending_confirmations.find((p) => p.id === confirmation_id);

    if (!item) {
      return NextResponse.json({ error: 'Confirmación pendiente no encontrada' }, { status: 404 });
    }

    if (item.status !== 'pending') {
      return NextResponse.json({ error: `La confirmación ya fue resuelta como: ${item.status}` }, { status: 400 });
    }

    if (action === 'reject') {
      item.status = 'rejected';
      item.resolved_at = Date.now();
      item.resolved_by = auth.agent.name;
      saveDatabase(db);
      return NextResponse.json({ status: 'rejected', message: 'Acción rechazada por el administrador.' });
    }

    if (action === 'approve') {
      item.status = 'approved';
      item.resolved_at = Date.now();
      item.resolved_by = auth.agent.name;
      saveDatabase(db);

      // Now execute the tool with approval
      const requestId = `req_approved_${crypto.randomBytes(4).toString('hex')}`;
      const result = await executeToolCall(item.tool, item.parameters, {
        agent: auth.agent, // execute under authorizer or original context
        request_id: requestId,
        dry_run: false,
      });

      return NextResponse.json({
        status: 'approved_and_executed',
        result,
      });
    }

    return NextResponse.json({ error: 'Acción inválida. Usa "approve" o "reject"' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
