// Cloudflare Worker — Proxy CORS universal para Agent Arnes
// Permite usar CUALQUIER proveedor de IA desde GitHub Pages aunque tu red
// bloquee las conexiones directas (VPN, firewall, AdGuard de Windows, etc).
//
// DESPLIEUE (gratis, 5 minutos):
// 1. Crea una cuenta en https://dash.cloudflare.com (gratis).
// 2. Workers & Pages → Create → Create Worker → ponle nombre (ej. "agent-arnes-proxy").
// 3. Reemplaza el código del worker con este archivo completo.
// 4. Deploy. Copia la URL que te da (ej. https://agent-arnes-proxy.tu-cuenta.workers.dev).
// 5. En Agent Arnes → Ajustes → Proveedor → "Proxy propio (CORS)" pega esa URL.
//
// El worker reenvía cualquier petición (GET/POST, headers, body, streaming SSE)
// y añade los headers CORS para que el navegador la acepte.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Respuesta a la raíz: confirmación de que el worker está vivo.
    if (url.pathname === '/' || !url.searchParams.get('url')) {
      return new Response(
        JSON.stringify({ ok: true, message: 'Agent Arnes CORS proxy is running.' }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Preflight CORS (peticiones con Authorization/Content-Type disparan OPTIONS).
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Expose-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const target = url.searchParams.get('url');
    const headers = {};
    const skip = [
      'host', 'connection', 'cf-connecting-ip', 'cf-ray', 'cf-visitor',
      'x-forwarded-for', 'x-real-ip', 'forwarded', 'content-length',
    ];

    for (const [k, v] of request.headers) {
      const lk = k.toLowerCase();
      if (skip.some((s) => lk === s || lk.startsWith(s + '-'))) continue;
      headers[k] = v;
    }

    const init = {
      method: request.method,
      headers,
      redirect: 'follow',
    };

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      init.body = request.body;
      // Necesario para reenviar el cuerpo de forma streaming en Workers.
      init.duplex = 'half';
    }

    try {
      const resp = await fetch(target, init);
      const newHeaders = new Headers(resp.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Expose-Headers', '*');
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Proxy upstream failed', detail: String(err) }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};
