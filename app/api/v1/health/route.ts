import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/agent-db';

export async function GET() {
  const db = getDatabase();
  return NextResponse.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime_seconds: Math.floor(process.uptime()),
    node_version: process.version,
    platform: process.platform,
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    active_agents: db.agents.filter((a) => a.status === 'active').length,
    registered_tables: Object.keys(db.tables).length,
    audit_entries_recorded: db.audit_logs.length,
    capabilities: [
      'Universal REST API /api/v1/*',
      'Model Context Protocol (MCP) Server /api/v1/mcp',
      'Super Admin Root Controls (SUPER_ADMIN_AGENT)',
      'Full Platform Access (FULL_PLATFORM_ACCESS)',
      'Human-in-the-loop Pending Action Review',
      'Atomic Rollback & Pre-action Backups',
      'Dry-run Simulation Engine',
    ],
  });
}
