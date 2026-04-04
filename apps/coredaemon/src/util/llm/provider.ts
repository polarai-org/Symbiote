import { ChatMessage, Event, Function } from "@symbiote/types";
import { OpenAIProvider } from "./openai/provider.js";

export type LLMProvider = {
  friendlyName: string;
  processChatCompletion:
  (messages: ChatMessage[]) => AsyncGenerator<Event>;
}

export type LLMProviderConfig = {
  functions: Function[];
}

export function getLLMProvider(providerName: string, functions: Function[] = []): Promise<LLMProvider> {
  return new Promise((resolve, reject) => {
    switch (providerName) {
      case "openai":
        return resolve(new OpenAIProvider({
          functions,
        }))
      default:
        reject(new Error(`Unknown LLM provider: ${providerName}`))
    }
  })
}