export type AppConfig = {
  coredaemon: {
    port: number;
    host: string;
    enabled: boolean;
    password: string;
  },
  llm: {
    provider_name: string
    base_url: string
    api_key: string
    model_name: string,
    reasoning_intensity: string,
    temperature: number
  }
  logging: {
    logfile: {
      enabled: boolean
      path: string
    }
    console: {
      enabled: boolean
    }
  },
  functions: {
    websearch: {
      enabled: boolean;
      provider: "exa-ai";
      api_key: string;
    },
    terminal: {
      enabled: boolean;
    },
    http: {
      enabled: boolean;
    }
  }
}

export type ChatMessage =
  | {
    role: "system" | "developer" | "user" | "assistant";
    content: string;
    name?: string
  }
  | {
    type: "function_call_output";
    call_id: string;
    output: string;
  }

export type Event = {
  name: "llm.response";
  data: {
    delta: string;
    item_id: string;
    output_index: number;
  };
} | {
  name: "llm.request";
  data: {
    messages: ChatMessage[];
  };
} | {
  name: "llm.function_call";
  data: {
    delta?: string;
    item_id: string;
    output_index: number;
    call_id: string;
    name: string;
    arguments: string;
  };
} | {
  name: "llm.error";
  data: {
    error: unknown;
  };
} | {
  name: "llm.think";
  data: {
    delta: string;
    item_id: string;
    output_index: number;
    content_index: number;
  };
} | {
  name: "llm.finish";
  data: {
    response: Record<string, any>;
  };
} | {
  name: "function.ok" | "function.error",
  data: Record<string, any>;
}

export type Function = {
  name: string;
  description: string;
  parameters: Record<string, {
    description: string;
    type: "string" | "number" | "boolean" | "object";
  }>;
  requiredParams: string[];
  enabled: () => boolean;
  exec: (args: Record<string, any>) => Promise<Event>;
}

export type SearchResult = {
  title: string
  url: string
  snippet?: string
  published_at?: string
}