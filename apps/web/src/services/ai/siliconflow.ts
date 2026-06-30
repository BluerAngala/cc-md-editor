import type { ImageServiceOption, ModelFetcher, ServiceOption } from '@md/shared/types'

/**
 * 硅基流动 (SiliconFlow) models endpoint。
 * OpenAI 兼容：GET {endpoint}/models → { object: 'list', data: [{ id, ... }, ...] }
 */
export const SILICONFLOW_MODELS_ENDPOINT = `https://api.siliconflow.cn/v1`

const SILICONFLOW_MODEL_PATH = `/models`

/**
 * Build a `ModelFetcher` bound to a particular SiliconFlow endpoint.
 * The returned function performs a GET against `${endpoint}/models` with the
 * provided API key and resolves to the list of model IDs.
 */
export function createSiliconflowModelFetcher(endpoint: string): ModelFetcher {
  const base = endpoint.replace(/\/+$/, ``)
  const url = `${base}${SILICONFLOW_MODEL_PATH}`
  return async (apiKey: string, signal?: AbortSignal) => {
    if (!apiKey)
      throw new Error(`缺少 API Key，无法获取最新模型列表`)
    const res = await fetch(url, {
      method: `GET`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: `application/json`,
      },
      signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => ``)
      throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ``}`)
    }
    const data: { data?: Array<{ id?: string }> } = await res.json()
    return Array.from(
      new Set(
        (data.data ?? [])
          .map(item => item.id)
          .filter((id): id is string => typeof id === `string` && id.length > 0),
      ),
    )
  }
}

/**
 * Attach a working `fetchModels` to any SiliconFlow option.
 * The `models` array is preserved unchanged (it still acts as fallback + default).
 */
export function withSiliconflowFetcher<
  T extends ServiceOption | ImageServiceOption,
>(option: T, endpoint: string = SILICONFLOW_MODELS_ENDPOINT): T {
  return {
    ...option,
    fetchModels: createSiliconflowModelFetcher(endpoint),
  }
}
