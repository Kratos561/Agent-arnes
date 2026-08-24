import { spawn } from 'child_process';
import path from 'path';

async function testMcpBridge() {
  console.log('🤖 Probando MCP Stdio Bridge vía stdin/stdout...');

  const scriptPath = path.resolve(process.cwd(), 'scripts/mcp-agent-bridge.js');
  const child = spawn('node', [scriptPath], {
    env: {
      ...process.env,
      AGENT_API_KEY: 'ag_super_master_live_key_999',
      PLATFORM_BASE_URL: 'http://localhost:3000',
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  let outputBuffer = '';

  child.stdout.on('data', (data) => {
    outputBuffer += data.toString();
  });

  function sendRpc(msg: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = msg.id;
      const jsonStr = JSON.stringify(msg) + '\n';
      
      const checkInterval = setInterval(() => {
        const lines = outputBuffer.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === id) {
              clearInterval(checkInterval);
              resolve(parsed);
              return;
            }
          } catch {
            // Not a complete JSON yet
          }
        }
      }, 50);

      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Timeout esperando respuesta para RPC id ${id}`));
      }, 5000);

      child.stdin.write(jsonStr);
    });
  }

  // TEST 1: initialize
  const initRes = await sendRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'claude-desktop', version: '0.1.0' },
    },
  });
  console.log('✅ 1. Handshake initialize:', initRes?.result?.serverInfo?.name);

  // TEST 2: tools/list
  const toolsRes = await sendRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });
  console.log(`✅ 2. tools/list: ${toolsRes?.result?.tools?.length} herramientas expuestas`);

  // TEST 3: ping
  const pingRes = await sendRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'ping',
    params: {},
  });
  console.log('✅ 3. ping response recibida:', JSON.stringify(pingRes));

  child.kill();
  console.log('🎉 MCP Stdio Bridge funciona perfectamente!');
}

testMcpBridge().catch((err) => {
  console.error('Error testing MCP Bridge:', err);
  process.exit(1);
});
