export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
  customHeaders?: Record<string, string>;
  isCustom?: boolean;
  useProxy?: boolean;
  /** Proxy CORS propio (worker/server propio). Se prueba antes que los proxies públicos. */
  customProxy?: string;
}

export interface ModelInfo {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  owned_by?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  created?: number;
}

export interface AskPayload {
  id: string;
  question: string;
  options?: string[];
  multiple?: boolean;
  placeholder?: string;
  hideOptions?: boolean;
}

export interface ToolTranscriptEvent {
  toolName: string;
  callId: string;
  status: 'started' | 'completed' | 'blocked' | 'failed';
  ms?: number;
  note?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning_content?: string; // For DeepSeek-R1 / o1 models with thinking process
  /** Transcript estructurado de herramientas usadas en este turno (estilo Claude Code). */
  toolTranscript?: ToolTranscriptEvent[];
  timestamp: number;
  model?: string;
  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  finish_reason?: string; // 'length' | 'stop' | 'content_filter'
  isError?: boolean;
  asks?: AskPayload[];
  askAnswered?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  parameters: ModelParameters;
  isPinned?: boolean;
}

export interface ModelParameters {
  temperature: number;
  top_p: number;
  max_tokens: number; // 0 = Auto / Ilimitado (usa el máximo nativo del modelo)
  presence_penalty: number;
  frequency_penalty: number;
  stream: boolean;
  auto_continue?: boolean;
  reasoning_effort?: 'low' | 'medium' | 'high' | 'auto';
}

export const DEFAULT_PARAMETERS: ModelParameters = {
  temperature: 0.7,
  top_p: 1.0,
  max_tokens: 0, // 0 = Sin límite artificial; máxima libertad de tokens para razonamiento y respuesta completa
  presence_penalty: 0,
  frequency_penalty: 0,
  stream: true,
  auto_continue: true,
};

export const PRESET_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter (CORS compatible)',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    defaultModel: 'openai/gpt-4o-mini',
    customHeaders: {
      'X-Title': 'Agent Arnes',
    },
  },
  {
    id: 'groq',
    name: 'Groq (Ultra Rápido)',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: '',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek (Oficial)',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: '',
    defaultModel: 'mistral-large-latest',
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    apiKey: '',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    baseUrl: 'https://api.perplexity.ai',
    apiKey: '',
    defaultModel: 'sonar-pro',
  },
  {
    id: 'ollama',
    name: 'Ollama (Localhost)',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    defaultModel: 'llama3:latest',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio / Servidor Local',
    baseUrl: 'http://localhost:1234/v1',
    apiKey: 'lm-studio',
    defaultModel: 'local-model',
  },
  {
    id: 'custom',
    name: 'Proveedor Personalizado / Base URL',
    baseUrl: '',
    apiKey: '',
    isCustom: true,
  },
];

export const VERIFIED_DEFAULT_MODELS: Record<string, ModelInfo[]> = {
  openrouter: [
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o mini',
      description: 'Modelo rápido para tareas generales. Consulta el catálogo en vivo para opciones actuales.',
      context_length: 128000,
      owned_by: 'OpenAI',
    },
    {
      id: 'qwen/qwen-2.5-coder-32b-instruct:free',
      name: 'Qwen 2.5 Coder 32B (⚡ Gratis)',
      description: 'Especializado en generación y refactorización de código limpio.',
      context_length: 131072,
      owned_by: 'Alibaba',
    },
    {
      id: 'deepseek/deepseek-r1:free',
      name: 'DeepSeek R1 Reasoning (⚡ Gratis)',
      description: 'Razonamiento profundo con cadena de pensamiento paso a paso.',
      context_length: 65536,
      owned_by: 'DeepSeek',
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct:free',
      name: 'Llama 3.3 70B Instruct (⚡ Gratis)',
      description: 'El modelo open-weights de última generación de Meta.',
      context_length: 131072,
      owned_by: 'Meta',
    },
    {
      id: 'google/gemini-2.0-flash-exp:free',
      name: 'Gemini 2.0 Flash Exp (⚡ Gratis)',
      description: 'Excelente velocidad y visión multimodal.',
      context_length: 1048576,
      owned_by: 'Google',
    },
    {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet',
      description: 'Líder de la industria en programación y escritura matizada.',
      context_length: 200000,
      owned_by: 'Anthropic',
    },
    {
      id: 'openai/gpt-4o',
      name: 'OpenAI GPT-4o',
      description: 'Modelo multimodal de alta fidelidad.',
      context_length: 128000,
      owned_by: 'OpenAI',
    },
    {
      id: 'deepseek/deepseek-chat',
      name: 'DeepSeek V3 (Chat)',
      description: 'Excelente relación costo/rendimiento para todo tipo de tareas.',
      context_length: 64000,
      owned_by: 'DeepSeek',
    },
  ],
  groq: [
    {
      id: 'llama-3.3-70b-versatile',
      name: 'Llama 3.3 70B Versatile',
      description: 'Inferencia ultra rápida (~300 tokens/s) en hardware LPUs.',
      context_length: 128000,
      owned_by: 'Meta',
    },
    {
      id: 'mixtral-8x7b-32768',
      name: 'Mixtral 8x7B Instruct',
      description: 'Modelo de mezcla de expertos de alta velocidad.',
      context_length: 32768,
      owned_by: 'Mistral',
    },
    {
      id: 'deepseek-r1-distill-llama-70b',
      name: 'DeepSeek R1 Distill Llama 70B',
      description: 'Razonamiento rápido en Groq.',
      context_length: 128000,
      owned_by: 'DeepSeek / Meta',
    },
  ],
  deepseek: [
    {
      id: 'deepseek-chat',
      name: 'DeepSeek-V3',
      description: 'Modelo general de alta capacidad y bajo costo.',
      context_length: 64000,
      owned_by: 'DeepSeek',
    },
    {
      id: 'deepseek-reasoner',
      name: 'DeepSeek-R1 (Reasoner)',
      description: 'Modelo especializado en razonamiento y pensamiento lógico.',
      context_length: 64000,
      owned_by: 'DeepSeek',
    },
  ],
  openai: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      description: 'Modelo insignia de OpenAI para texto, visión y código.',
      context_length: 128000,
      owned_by: 'OpenAI',
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      description: 'Rápido, económico y altamente capaz para tareas cotidianas.',
      context_length: 128000,
      owned_by: 'OpenAI',
    },
    {
      id: 'o1',
      name: 'o1 (Razonamiento Complejo)',
      description: 'Modelo de razonamiento avanzado de OpenAI.',
      context_length: 200000,
      owned_by: 'OpenAI',
    },
    {
      id: 'o3-mini',
      name: 'o3-mini',
      description: 'Razonamiento STEM y código a alta velocidad.',
      context_length: 200000,
      owned_by: 'OpenAI',
    },
  ],
};
