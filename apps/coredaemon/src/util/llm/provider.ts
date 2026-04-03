import { LLMMessage, Event } from "@symbiote/types";
import { OpenAIProvider } from "./openai/provider.js";

export type LLMFunctionParam = {
  description: string;
  type: "string" | "number" | "boolean" | "object";
}

export type LLMFunction = {
  name: string;
  description: string;
  parameters: Record<string, LLMFunctionParam>;
  requiredParams: string[];
}

export type LLMProvider = {
  friendlyName: string;
  processChatCompletion:
  (messages: LLMMessage[], functions?: LLMFunction[]) => AsyncGenerator<Event>;
}

export type LLMProviderConfig = {
  functions: LLMFunction[];
}

export function getLLMProvider(
  providerName: string,
  functions: LLMFunction[] = []): LLMProvider {
  switch (providerName) {
    case "openai":
      return new OpenAIProvider({
        functions,
      });
    default:
      throw new Error(`Unknown LLM provider: ${providerName}`)
  }
}