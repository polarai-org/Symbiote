import { ChatMessage, Event, Function } from "@symbiote/types";
import { LLMProvider, LLMProviderConfig } from "../provider.js";
import OpenAI from "openai";
import { appConfig } from "@symbiote/config";

function toOAIResponsesInput(messages: ChatMessage[]) {
  return messages.map((message) => {
    if ((message as { type?: string }).type === "function_call_output") {
      return message
    }

    const chatMessage = message as Extract<ChatMessage, {
      role: "system" | "developer" | "user" | "assistant"
    }>

    const role = chatMessage.role === "system" ? "developer" as const : chatMessage.role

    return {
      type: "message" as const,
      role,
      content: chatMessage.content,
    }
  });
}

function toOAIResponsesTools(functions: Function[]) {
  return functions.map((func) => ({
    type: "function" as const,
    name: func.name,
    description: func.description,
    parameters: {
      type: "object",
      properties: func.parameters,
      required: func.requiredParams,
      additionalProperties: false,
    },
    strict: true,
  }));
}

export class OpenAIProvider implements LLMProvider {
  friendlyName: string;
  private client: OpenAI;
  private model: string;
  private functions: Function[];
  private temperature: number;

  constructor({
    functions,
  }: LLMProviderConfig) {
    this.friendlyName = "OpenAI (Compatible)";
    this.model = appConfig.llm.model_name;
    this.functions = functions;
    this.temperature = appConfig.llm.temperature;
    this.client = new OpenAI({
      apiKey: appConfig.llm.api_key,
      baseURL: appConfig.llm.base_url,
    })
  }

  async *processChatCompletion(
    messages: ChatMessage[],
  ): AsyncGenerator<Event> {
    const input = toOAIResponsesInput(messages);
    const oaiFunctions = toOAIResponsesTools(this.functions);

    const stream = this.client.responses.stream({
      model: this.model,
      input,
      ...(oaiFunctions.length ? { tools: oaiFunctions } : {}),
      stream: true,
      temperature: (this.temperature || undefined),
    });

    for await (const part of stream) {
      if (part.type === "response.output_text.delta") {
        yield {
          name: "llm.response",
          data: {
            delta: part.delta,
            item_id: part.item_id,
            output_index: part.output_index,
          },
        };
        continue;
      }

      if (part.type === "response.reasoning_text.delta") {
        yield {
          name: "llm.think",
          data: {
            delta: part.delta,
            item_id: part.item_id,
            output_index: part.output_index,
            content_index: part.content_index,
          },
        };
        continue;
      }

      if (part.type === "response.output_item.done" && part.item.type === "function_call") {
        yield {
          name: "llm.function_call",
          data: {
            call_id: part.item.call_id,
            name: part.item.name,
            arguments: part.item.arguments,
            item_id: part.item.id ?? part.item.call_id,
            output_index: part.output_index,
          },
        };
        continue;
      }

      if (part.type === "response.completed") {
        yield {
          name: "llm.finish",
          data: {
            response: part.response,
          },
        };
        continue;
      }

      if (part.type === "error") {
        yield {
          name: "llm.error",
          data: {
            error: part,
          },
        };
      }
    }
  }
}
