import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { AgentRecord, AgentRole, ConfirmationMode } from './agent-types';
import { getDatabase, saveDatabase, findAgentByToken, updateAgentLastUsed } from './agent-db';

export interface AuthValidationResult {
  isAuthenticated: boolean;
  agent: AgentRecord | null;
  error?: string;
  statusCode?: number;
}

export function extractTokenFromRequest(req: NextRequest): string | null {
  // 1. Authorization header: "Bearer <token>"
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader) {
    const parts = authHeader.trim().split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
    if (parts.length === 1 && !parts[0].includes(' ')) {
      return parts[0];
    }
  }

  // 2. Custom headers: X-Agent-Key or X-API-Key
  const agentKeyHeader = req.headers.get('x-agent-key') || req.headers.get('x-api-key');
  if (agentKeyHeader) {
    return agentKeyHeader.trim();
  }

  // 3. Query string parameter: ?apiKey=... or ?agentKey=... or ?token=...
  const url = new URL(req.url);
  const queryKey = url.searchParams.get('apiKey') || url.searchParams.get('agentKey') || url.searchParams.get('token');
  if (queryKey) {
    return queryKey.trim();
  }

  return null;
}

export function validateAgentAuth(req: NextRequest, requiredScope?: string): AuthValidationResult {
  const token = extractTokenFromRequest(req);

  if (!token) {
    return {
      isAuthenticated: false,
      agent: null,
      error: 'Autenticación requerida. Proporciona un token válido vía cabecera Authorization: Bearer <token> o X-Agent-Key.',
      statusCode: 401,
    };
  }

  const agent = findAgentByToken(token);

  if (!agent) {
    return {
      isAuthenticated: false,
      agent: null,
      error: 'Token de agente inválido, desconocido o revocado.',
      statusCode: 401,
    };
  }

  if (agent.status !== 'active') {
    return {
      isAuthenticated: false,
      agent: null,
      error: `El agente está ${agent.status === 'suspended' ? 'suspendido' : 'revocado'}.`,
      statusCode: 403,
    };
  }

  if (agent.expires_at && agent.expires_at < Date.now()) {
    return {
      isAuthenticated: false,
      agent: null,
      error: 'El token del agente ha expirado.',
      statusCode: 401,
    };
  }

  // Update last used timestamp
  updateAgentLastUsed(agent.agent_id);

  // Check required scope
  if (requiredScope && !hasPermission(agent, requiredScope)) {
    return {
      isAuthenticated: true,
      agent,
      error: `Permiso denegado. El agente no posee el alcance necesario: '${requiredScope}'. Alcances actuales: [${agent.scopes.join(', ')}]`,
      statusCode: 403,
    };
  }

  return {
    isAuthenticated: true,
    agent,
  };
}

export function hasPermission(agent: AgentRecord, requiredScope: string): boolean {
  if (!agent || !agent.scopes) return false;

  // Super admin / Root wildcards
  if (
    agent.role === 'SUPER_ADMIN_AGENT' ||
    agent.scopes.includes('*') ||
    agent.scopes.includes('FULL_PLATFORM_ACCESS') ||
    agent.scopes.includes('root') ||
    agent.scopes.includes('admin')
  ) {
    return true;
  }

  // Direct match
  if (agent.scopes.includes(requiredScope)) {
    return true;
  }

  // Wildcard categories: e.g. "code:*" grants "code:read", "code:write", "code:edit"
  const [category] = requiredScope.split(':');
  if (category && agent.scopes.includes(`${category}:*`)) {
    return true;
  }

  return false;
}

export function generateAgentCredentials(params: {
  name: string;
  description?: string;
  role: AgentRole;
  scopes?: string[];
  clientId?: string;
  expiresInDays?: number;
  confirmationMode?: ConfirmationMode;
}): { agent: AgentRecord; rawToken: string } {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const prefix = params.role === 'SUPER_ADMIN_AGENT' ? 'ag_super_' : 'ag_live_';
  const rawToken = `${prefix}${randomBytes}`;

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const tokenPreview = `${rawToken.slice(0, 10)}...${rawToken.slice(-6)}`;

  let defaultScopes: string[] = [];
  if (params.role === 'SUPER_ADMIN_AGENT') {
    defaultScopes = ['*', 'FULL_PLATFORM_ACCESS', 'platform:*', 'code:*', 'database:*', 'files:*', 'settings:*', 'users:*', 'tests:*', 'deployment:*'];
  } else if (params.role === 'DEVELOPER_AGENT') {
    defaultScopes = ['code:*', 'files:*', 'tests:*', 'platform:read', 'database:read', 'database:query'];
  } else if (params.role === 'OPERATOR_AGENT') {
    defaultScopes = ['platform:*', 'database:*', 'tests:run', 'settings:read'];
  } else if (params.role === 'READONLY_AGENT') {
    defaultScopes = ['platform:read', 'code:read', 'database:read', 'files:read', 'settings:read'];
  } else {
    defaultScopes = params.scopes || ['platform:read'];
  }

  const agentId = `agent_${crypto.randomBytes(6).toString('hex')}`;
  const clientId = params.clientId || `client_${crypto.randomBytes(4).toString('hex')}`;

  const agent: AgentRecord = {
    agent_id: agentId,
    client_id: clientId,
    name: params.name,
    description: params.description || `AI Agent created with role ${params.role}`,
    role: params.role,
    scopes: params.scopes && params.scopes.length > 0 ? params.scopes : defaultScopes,
    status: 'active',
    token_hash: tokenHash,
    token_preview: tokenPreview,
    created_at: Date.now(),
    expires_at: params.expiresInDays ? Date.now() + params.expiresInDays * 86400000 : undefined,
    confirmation_mode: params.confirmationMode || 'AUTO_APPROVE',
  };

  const db = getDatabase();
  db.agents.push(agent);
  saveDatabase(db);

  return { agent, rawToken };
}

// Sanitizes secrets and sensitive tokens from responses and logs
export function sanitizeSecrets(obj: any): any {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    // Redact Bearer tokens and sensitive keys if found in strings
    return obj
      .replace(/ag_(live|super|dev)_[a-zA-Z0-9_]+/g, 'ag_***_REDACTED')
      .replace(/AIza[0-9A-Za-z-_]{35}/g, 'AIza***_REDACTED')
      .replace(/sk-[a-zA-Z0-9]{32,}/g, 'sk-***_REDACTED');
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeSecrets);
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token_hash') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key')
      ) {
        cleaned[key] = '***_REDACTED_***';
      } else {
        cleaned[key] = sanitizeSecrets(val);
      }
    }
    return cleaned;
  }

  return obj;
}
