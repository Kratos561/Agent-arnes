import { NextRequest, NextResponse } from 'next/server';
import { validateAgentAuth } from '@/lib/agent-auth';
import { getDatabase, saveDatabase } from '@/lib/agent-db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateAgentAuth(req, 'users:read');
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  const { id } = await params;
  const db = getDatabase();
  const target = db.agents.find((a) => a.agent_id === id);

  if (!target) {
    return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });
  }

  return NextResponse.json({
    agent: {
      agent_id: target.agent_id,
      client_id: target.client_id,
      name: target.name,
      description: target.description,
      role: target.role,
      scopes: target.scopes,
      status: target.status,
      token_preview: target.token_preview,
      created_at: target.created_at,
      last_used_at: target.last_used_at,
      expires_at: target.expires_at,
      confirmation_mode: target.confirmation_mode,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateAgentAuth(req, 'users:write');
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  const { id } = await params;
  const db = getDatabase();
  const target = db.agents.find((a) => a.agent_id === id);

  if (!target) {
    return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });
  }

  try {
    const body = await req.json();
    if (body.name) target.name = body.name;
    if (body.description) target.description = body.description;
    if (body.role) target.role = body.role;
    if (body.scopes) target.scopes = body.scopes;
    if (body.status) target.status = body.status;
    if (body.confirmation_mode) target.confirmation_mode = body.confirmation_mode;

    saveDatabase(db);
    return NextResponse.json({ status: 'success', agent: target });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateAgentAuth(req, 'users:write');
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  const { id } = await params;
  const db = getDatabase();
  const targetIndex = db.agents.findIndex((a) => a.agent_id === id);

  if (targetIndex === -1) {
    return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });
  }

  db.agents[targetIndex].status = 'revoked';
  saveDatabase(db);

  return NextResponse.json({ status: 'success', message: 'Agente revocado exitosamente' });
}
