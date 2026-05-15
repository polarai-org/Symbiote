import { Function, Event } from "@symbiote/types";
import { appConfig } from "@symbiote/config";

export const http: Function = {
  name: "http",
  description: "Make HTTP requests to interact with external APIs or services.",
  parameters: {
    method: {
      description: "HTTP method to use (GET, POST, PUT, DELETE, etc.).",
      type: "string",
    },
    url: {
      description: "The URL to which the request is sent.",
      type: "string",
    },
    headers: {
      description: "Optional HTTP headers to include in the request.",
      type: "object",
    },
    body: {
      description: "Optional body of the request for methods like POST or PUT.",
      type: "string",
    }
  },
  requiredParams: ["method", "url"],
  enabled: () => {
    return !!appConfig.functions?.http?.enabled;
  },
  exec: async (args): Promise<Event> => {
    const { method, url, headers, body } = args as { method: string, url: string, headers?: Record<string, string>, body?: string };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
      });

      const responseBody = await response.text();

      if (!response.ok) {
        return {
          name: "function.error",
          data: { error: `HTTP Error: ${response.status} ${response.statusText} - ${responseBody}` }
        }
      }

      return {
        name: "function.ok",
        data: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody,
        }
      };
    } catch (err: any) {
      return {
        name: "function.error",
        data: { error: err.message || String(err) }
      };
    }
  }
}
