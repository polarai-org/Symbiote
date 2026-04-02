export type AppConfig =  {
  llm_provider_config: {
    name: string
    base_url: string
    api_key: string
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
