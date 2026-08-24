import { NextResponse } from 'next/server';
import { generateOpenAPISpec } from '@/lib/agent-openapi';

export async function GET() {
  const spec = generateOpenAPISpec();
  return NextResponse.json(spec);
}
