/**
 * Cliente SSE Resiliente con Exponential Backoff, gestión de Last-Event-ID y desduplicación.
 */

export interface ResilientEventSourceOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  headers?: Record<string, string>;
  body?: any;
  method?: string;
  signal?: AbortSignal;
}

export class ResilientEventSource {
  private url: string;
  private options: ResilientEventSourceOptions;
  private lastEventId: string | null = null;
  private retryDelay: number;
  private retryCount = 0;
  private isAborted = false;

  constructor(url: string, options: ResilientEventSourceOptions = {}) {
    this.url = url;
    this.options = options;
    this.retryDelay = options.initialDelayMs || 1000;

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        this.isAborted = true;
      });
    }
  }

  public async connect(
    onMessage: (chunk: string, eventId?: string) => void,
    onError: (err: Error) => void,
    onComplete: () => void
  ): Promise<void> {
    if (this.isAborted) return;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.options.headers || {}),
    };

    if (this.lastEventId) {
      headers['Last-Event-ID'] = this.lastEventId;
    }

    try {
      const response = await fetch(this.url, {
        method: this.options.method || 'POST',
        headers,
        body: this.options.body ? JSON.stringify(this.options.body) : undefined,
        signal: this.options.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No readable stream body returned');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      // Reset retry counter on successful stream initiation
      this.retryCount = 0;
      this.retryDelay = this.options.initialDelayMs || 1000;

      while (!this.isAborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('id:')) {
            this.lastEventId = trimmed.substring(3).trim();
          } else if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.substring(5).trim();
            if (dataStr === '[DONE]') {
              onComplete();
              return;
            }
            onMessage(dataStr, this.lastEventId || undefined);
          }
        }
      }

      onComplete();
    } catch (err: any) {
      if (this.isAborted || (this.options.signal && this.options.signal.aborted)) {
        return;
      }

      const maxRetries = this.options.maxRetries ?? 3;
      if (this.retryCount < maxRetries) {
        this.retryCount++;
        const nextDelay = Math.min(this.retryDelay * 1.5, this.options.maxDelayMs || 10000);
        this.retryDelay = nextDelay;

        setTimeout(() => {
          this.connect(onMessage, onError, onComplete);
        }, this.retryDelay);
      } else {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}
