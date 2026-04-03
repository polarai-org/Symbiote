export type AppConfig = {
  coredaemon: {
    port: number
    host: string
  },
  llm: {
    name: string
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
  }
}

export type LLMMessage =
  | {
    role: "system" | "developer" | "user";
    content: string;
    name?: string
  }

export type LLMResponseEventData = {
  delta: string;
  item_id: string;
  output_index: number;
}

export type LLMThinkEventData = LLMResponseEventData & {
  content_index: number;
}

export type LLMFunctionCallEventData = LLMResponseEventData

export type LLMFinishEventData = {
  response: Record<string, any>;
}

export type LLMErrorEventData = {
  error: unknown;
}

export type Event = {
  name: "llm.response";
  data: LLMResponseEventData;
} | {
  name: "llm.function_call";
  data: LLMFunctionCallEventData;
} | {
  name: "llm.error";
  data: LLMErrorEventData;
} | {
  name: "llm.think";
  data: LLMThinkEventData;
} | {
  name: "llm.finish";
  data: LLMFinishEventData;
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
  exec: (args: Record<string, any>) => Promise<Event>;
}