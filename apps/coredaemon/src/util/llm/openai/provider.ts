import { LLMMessage, Event } from "@symbiote/types";
import { LLMProvider, LLMFunction, LLMProviderConfig } from "../provider.js";
import OpenAI from "openai";
import { appConfig } from "../config.js";

function toResponsesInput(messages: LLMMessage[]) {
  return messages.map((message) => ({
    type: "message" as const,
    role: message.role === "system" ? "developer" as const : message.role,
    content: message.content,
  }));
}

function toOAIResponsesTools(functions: LLMFunction[]) {
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
  private functions: LLMFunction[];
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
    messages: LLMMessage[],
    functions?: LLMFunction[]
  ): AsyncGenerator<Event> {
    const input = toResponsesInput(messages);
    const oaiFunctions = toOAIResponsesTools(functions || this.functions);

    const stream = this.client.responses.stream({
      model: this.model,
      input,
      ...(oaiFunctions.length ? { tools: oaiFunctions } : {}),
      stream: true,
      temperature: this.temperature,
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

      if (part.type === "response.function_call_arguments.delta") {
        yield {
          name: "llm.function_call",
          data: {
            delta: part.delta,
            item_id: part.item_id,
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