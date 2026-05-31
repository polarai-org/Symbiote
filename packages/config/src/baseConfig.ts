export const baseConfig = `{
  "coredaemon": {
    "port": 3000,
    "host": "127.0.0.1",
    "enabled": true,
    "db_path": "symbiote.db",
    "encryption_secret": "DONT_FORGET_TO_REPLACE_ME_PLS",
    "allow_signups": true // Use this only for registering the first account. Highly recommended to disable after the initial setup for security reasons.
  },
  "llm": {
    "provider_name": "openai",
    "base_url": "https://openrouter.ai/api/v1",
    "api_key": "DONT_FORGET_TO_REPLACE_ME_PLS",
    "model_name": "openai/gpt-5.5-pro",
    "reasoning_intensity": "medium" // NOTE: Please check your LLM provider's documentation for supported parameters and adjust accordingly.
  },
  "logging": {
    "logfile": {
      "enabled": true,
      "path": "logs/{dd-mm-yyyy}.log"
    },
    "console": {
      "enabled": true
    }
  },
  "functions": {
    "websearch": {
      "enabled": false,
      "provider": "exa-ai",
      "api_key": "YOUR_EXA_API_KEY"
    },
    "terminal": {
      "enabled": true
    },
    "http": {
      "enabled": true
    }
  },
  "mcp": {}
}
`
