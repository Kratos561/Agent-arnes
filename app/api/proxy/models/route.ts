import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { baseUrl, apiKey, customHeaders } = await req.json();

    if (!baseUrl) {
      return NextResponse.json(
        { error: 'El Base URL es requerido para consultar los modelos.' },
        { status: 400 }
      );
    }

    // Clean and normalize base URL
    const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    
    // Determine the models endpoint:
    // If user provided a URL ending in /models, use it.
    // Otherwise append /models (e.g. https://api.openai.com/v1 -> https://api.openai.com/v1/models)
    let modelsUrl: string;
    if (cleanUrl.endsWith('/models')) {
      modelsUrl = cleanUrl;
    } else {
      modelsUrl = `${cleanUrl}/models`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...customHeaders,
    };

    if (apiKey && apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    let response: Response;
    try {
      response = await fetch(modelsUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      // If it failed and didn't have /v1 in the path, try fallback with /v1/models
      if (!cleanUrl.includes('/v1') && !cleanUrl.endsWith('/models')) {
        try {
          const fallbackUrl = `${cleanUrl}/v1/models`;
          const fallbackResp = await fetch(fallbackUrl, {
            method: 'GET',
            headers,
          });
          response = fallbackResp;
          modelsUrl = fallbackUrl;
        } catch {
          return NextResponse.json(
            { 
              error: `No se pudo conectar al endpoint (${fetchErr.message || 'Error de red'}). Verifica que la URL sea accesible.` 
            },
            { status: 502 }
          );
        }
      } else {
        return NextResponse.json(
          { 
            error: `Error de conexión con ${cleanUrl}: ${fetchErr.message || 'Servidor inaccesible'}.` 
          },
          { status: 502 }
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }

    // Read the response body safely as text ONCE to avoid "Body has already been read" error
    const rawBody = await response.text();

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errJson = JSON.parse(rawBody);
        errorDetails = errJson.error?.message || errJson.message || errJson.detail || JSON.stringify(errJson);
      } catch {
        errorDetails = rawBody;
      }

      return NextResponse.json(
        { 
          error: `El proveedor respondió con error ${response.status} (${response.statusText}): ${errorDetails || 'Solicitud no autorizada o no encontrada'}` 
        },
        { status: response.status }
      );
    }

    let data: any;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          error: `La respuesta del servidor no es un JSON válido: ${rawBody.slice(0, 300)}`,
        },
        { status: 502 }
      );
    }

    // Standard OpenAI format has data: [{ id: "...", ... }]
    // Some providers might return an array directly, or { models: [...] }, or Ollama format { models: [...] }
    let rawModels: any[] = [];
    if (Array.isArray(data)) {
      rawModels = data;
    } else if (Array.isArray(data.data)) {
      rawModels = data.data;
    } else if (Array.isArray(data.models)) {
      rawModels = data.models;
    } else if (data.data && typeof data.data === 'object') {
      rawModels = Object.values(data.data);
    }

    const models = rawModels.map((m: any) => {
      // Model id might be m.id, m.name, or m.model
      const id = m.id || m.name || m.model || String(m);
      const name = m.name || m.id || id;
      const owned_by = m.owned_by || m.owner || (m.details?.family ? m.details.family : undefined);
      const context_length = m.context_length || m.context_window || m.max_context_length;
      
      return {
        id,
        name,
        description: m.description || (context_length ? `Context: ${context_length.toLocaleString()} tokens` : undefined),
        context_length,
        owned_by,
        pricing: m.pricing,
        created: m.created,
      };
    });

    // Sort models by name or id
    models.sort((a: any, b: any) => a.id.localeCompare(b.id));

    return NextResponse.json({
      success: true,
      total: models.length,
      models,
      rawEndpoint: modelsUrl,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Error en el servidor al obtener modelos: ${err.message || 'Error inesperado'}` },
      { status: 500 }
    );
  }
}

