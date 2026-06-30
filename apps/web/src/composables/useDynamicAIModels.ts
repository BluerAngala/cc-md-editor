import type { ImageServiceOption, ServiceOption } from '@md/shared/types'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

type AnyOption = ServiceOption | ImageServiceOption

/**
 * Resolve a single writable model list given:
 *   - the selected service `option` (with `models` static fallback + optional `fetchModels`)
 *   - the API key (a ref/computed that may start empty and become populated later)
 *
 * Behavior:
 *   1. Always include `option.models` so the static fallback is never lost.
 *   2. When `option.fetchModels` is provided AND `apiKey` is present,
 *      call it on mount and whenever either changes. Results are merged
 *      into the returned list (de-duplicated).
 *   3. If the fetch fails (e.g. 401, network) the list still contains the
 *      static models — the UI is never empty as long as fallback models exist.
 *   4. Calling `refresh()` re-runs the fetch even with the same inputs.
 *
 * Cancellation: in-flight requests are aborted when inputs change or on
 * `refresh()`, preventing stale results from overwriting newer ones.
 *
 * @param option - The service option with static models and optional fetchModels.
 * @param apiKey - The API key for authentication.
 * @param filter - Optional filter function to dynamically filter models (e.g., for image-only models).
 */
export function useDynamicAIModels(
  option: MaybeRefOrGetter<AnyOption | undefined>,
  apiKey: MaybeRefOrGetter<string>,
  filter?: (modelId: string) => boolean,
) {
  const dynamic = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  let abortController: AbortController | null = null

  const staticModels = computed(() => toValue(option)?.models ?? [])

  const allModels = computed<string[]>(() => {
    const merged = new Set<string>(staticModels.value)
    for (const m of dynamic.value) merged.add(m)
    return Array.from(merged)
  })

  async function refresh() {
    const opt = toValue(option)
    const key = toValue(apiKey)

    abortController?.abort()
    abortController = null

    if (!opt?.fetchModels || !key) {
      dynamic.value = []
      error.value = null
      loading.value = false
      return
    }

    const controller = new AbortController()
    abortController = controller
    loading.value = true
    error.value = null

    try {
      const models = await opt.fetchModels(key, controller.signal)
      // Guard: if a newer refresh has started, drop these results.
      if (abortController !== controller)
        return
      dynamic.value = filter ? models.filter(filter) : models
    }
    catch (e: unknown) {
      if (abortController !== controller)
        return
      if (e instanceof Error && e.name === `AbortError`)
        return
      error.value = e instanceof Error ? e.message : String(e)
      dynamic.value = []
    }
    finally {
      if (abortController === controller) {
        loading.value = false
        abortController = null
      }
    }
  }

  function cancel() {
    abortController?.abort()
    abortController = null
  }

  // Auto-refresh whenever the option (value/endpoint) or apiKey changes.
  watch(
    [() => toValue(option)?.value, () => toValue(option)?.endpoint, () => toValue(apiKey)],
    () => {
      refresh()
    },
    { immediate: true },
  )

  onBeforeUnmount(cancel)

  return {
    allModels,
    staticModels,
    dynamicModels: dynamic,
    loading,
    error,
    refresh,
  }
}
