import { appConfig } from "@symbiote/config";
import type { Function, Event } from "@symbiote/types";

export const websearch: Function = {
  name: "websearch",
  description: "Search the web using Exa AI.",
  parameters: {
    query: {
      description: "The search query formulation.",
      type: "string",
    },
    top_k: {
      description: "Number of results to return. Defaults to 10.",
      type: "number"
    }
  },
  requiredParams: ["query"],
  enabled: () => {
    return !!appConfig.functions?.websearch?.enabled;
  },
  exec: async (args): Promise<Event> => {
    const { query, top_k } = args as { query: string, top_k?: number };
    const apiKey = appConfig.functions?.websearch?.api_key;

    if (!apiKey) {
      return {
        name: "function.error",
        data: { error: "Websearch API key is not configured." }
      };
    }

    switch (appConfig.functions?.websearch?.provider) {
      case "exa-ai":
        try {
          const response = await fetch("https://api.exa.ai/search", {
            method: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
              "x-api-key": apiKey
            },
            body: JSON.stringify({
              query,
              numResults: top_k || 10
            })
          });

          if (!response.ok) {
            throw new Error(`Exa API Error: ${response.status} ${response.statusText} - ${await response.text()}`);
          }

          const data = await response.json();
          return {
            name: "function.ok",
            data: data
          };
        } catch (err: any) {
          return {
            name: "function.error",
            data: { error: err.message || String(err) }
          };
        }
      default:
        return {
          name: "function.error",
          data: { error: "Invalid websearch provider configured: " + appConfig.functions?.websearch?.provider }
        };
    }
  }
};
