import { NextRequest, NextResponse } from 'next/server';
import { validateAgentAuth, generateAgentCredentials } from '@/lib/agent-auth';
import { getDatabase, saveDatabase } from '@/lib/agent-db';

export async function GET(req: NextRequest) {
  const auth = validateAgentAuth(req, 'users:read');
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  const db = getDatabase();
  const agentsList = db.agents.map((a) => ({
    agent_id: a.agent_id,
    client_id: a.client_id,
    name: a.name,
    description: a.description,
    role: a.role,
    scopes: a.scopes,
    status: a.status,
    token_preview: a.token_preview,
    created_at: a.created_at,
    last_used_at: a.last_used_at,
    expires_at: a.expires_at,
    confirmation_mode: a.confirmation_mode,
  }));

  return NextResponse.json({
    total: agentsList.length,
    agents: agentsList,
  });
}

export async function POST(req: NextRequest) {
  const auth = validateAgentAuth(req, 'users:write');
  if (!auth.isAuthenticated || !auth.agent) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.statusCode || 401 });
  }

  try {
    const body = await req.json();
    const { name, role, scopes, description, expires_in_days, confirmation_mode, client_id } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'El nombre del agente es obligatorio.' }, { status: 400 });
    }

    const { agent, rawToken } = generateAgentCredentials({
      name,
      description,
      role: role || 'DEVELOPER_AGENT',
      scopes,
      clientId: client_id,
      expiresInDays: expires_in_days,
      confirmationMode: confirmation_mode || 'AUTO_APPROVE',
    });

    return NextResponse.json({
      status: 'success',
      message: 'Agente creado y credenciales generadas exitosamente.',
      agent: {
        agent_id: agent.agent_id,
        client_id: agent.client_id,
        name: agent.name,
        role: agent.role,
        scopes: agent.scopes,
        status: agent.status,
        confirmation_mode: agent.confirmation_mode,
        token_preview: agent.token_preview,
      },
      token: rawToken,
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Error creando agente: ${err.message}` }, { status: 500 });
  }
}
