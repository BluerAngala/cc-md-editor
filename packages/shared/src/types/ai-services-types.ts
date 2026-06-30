export type ModelFetcher = (
  apiKey: string,
  signal?: AbortSignal,
) => Promise<string[]>

export interface ServiceOption {
  value: string
  label: string
  endpoint: string
  /**
   * Static fallback model list. Used when no API key is available,
   * when dynamic fetching fails, or as a baseline that always includes
   * the default model so the UI has something to show.
   */
  models: string[]
  /**
   * Optional async fetcher that returns the latest model list at runtime.
   * When provided, the UI merges the dynamic result with `models` and lets
   * the user pick from the superset.
   */
  fetchModels?: ModelFetcher
}

export interface ImageServiceOption {
  value: string
  label: string
  endpoint: string
  models: string[]
  fetchModels?: ModelFetcher
}
