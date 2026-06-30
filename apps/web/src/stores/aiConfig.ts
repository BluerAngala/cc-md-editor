import type { ImageServiceOption, ServiceOption } from '@md/shared/types'
import { imageServiceOptions, serviceOptions } from '@md/shared/configs'
import {
  DEFAULT_SERVICE_KEY,
  DEFAULT_SERVICE_MAX_TOKEN,
  DEFAULT_SERVICE_TEMPERATURE,
  DEFAULT_SERVICE_TYPE,
} from '@md/shared/constants'
import { store } from '@/storage'

/**
 * 各模型在硅基流动 (SiliconFlow) 上的默认模型。
 * 仅作为「首次配置」时的初始选择；用户切换供应商或模型后会被持久化值覆盖。
 */
const SILICONFLOW_DEFAULT_TEXT_MODEL = `deepseek-ai/DeepSeek-V4-Flash`
const SILICONFLOW_DEFAULT_VISION_MODEL = `Qwen/Qwen3-VL-32B-Instruct`
const SILICONFLOW_DEFAULT_IMAGE_MODEL = `Qwen/Qwen-Image`
const SILICONFLOW_TYPE = `siliconflow`

/**
 * AI 配置 Store
 * 展平结构，每个模型类型独立配置供应商
 */
export const useAIConfigStore = defineStore(`AIConfig`, () => {
  // ==================== 文本模型 ====================
  const textType = store.reactive<string>(`ai_text_type`, SILICONFLOW_TYPE)
  const textEndpoint = ref<string>(``)
  const textModel = ref<string>(``)
  const textApiKey = ref<string>(DEFAULT_SERVICE_KEY)
  const temperature = store.reactive<number>(`openai_temperature`, DEFAULT_SERVICE_TEMPERATURE)
  const maxToken = store.reactive<number>(`openai_max_token`, DEFAULT_SERVICE_MAX_TOKEN)

  // ==================== 视觉模型 ====================
  const visionType = store.reactive<string>(`ai_vision_type`, SILICONFLOW_TYPE)
  const visionEndpoint = ref<string>(``)
  const visionModel = ref<string>(``)
  const visionApiKey = ref<string>(DEFAULT_SERVICE_KEY)

  // ==================== 图片生成模型 ====================
  const imageType = store.reactive<string>(`ai_image_type`, SILICONFLOW_TYPE)
  const imageEndpoint = ref<string>(``)
  const imageModel = ref<string>(``)
  const imageApiKey = ref<string>(DEFAULT_SERVICE_KEY)

  // ==================== 通用初始化逻辑 ====================
  type ServiceOptionLike = ServiceOption | ImageServiceOption

  function initServiceWatch(
    typeRef: Ref<string>,
    endpointRef: Ref<string>,
    modelRef: Ref<string>,
    apiKeyRef: Ref<string>,
    svcOptions: ServiceOptionLike[],
    prefix: string,
    defaultModel?: string,
  ) {
    // 异步加载 API Key
    Promise.resolve().then(async () => {
      const capturedType = typeRef.value
      const value = await store.get(`${prefix}_key_${capturedType}`)
      if (typeRef.value === capturedType)
        apiKeyRef.value = value || DEFAULT_SERVICE_KEY
    })

    watch(typeRef, async (newType: string) => {
      const svc = svcOptions.find(s => s.value === newType) ?? svcOptions[0]
      endpointRef.value = svc.endpoint

      const saved = await store.get(`${prefix}_model_${newType}`) || ``
      const preferred = defaultModel && svc.models.includes(defaultModel)
        ? defaultModel
        : svc.models[0]
      modelRef.value = svc.models.includes(saved) ? saved : preferred
      await store.set(`${prefix}_model_${newType}`, modelRef.value)

      const keyValue = await store.get(`${prefix}_key_${newType}`)
      apiKeyRef.value = keyValue || DEFAULT_SERVICE_KEY
    }, { immediate: true })

    watch(apiKeyRef, async (val: string) => {
      if (typeRef.value !== DEFAULT_SERVICE_TYPE)
        await store.set(`${prefix}_key_${typeRef.value}`, val)
    })

    watch(modelRef, async (val: string) => {
      await store.set(`${prefix}_model_${typeRef.value}`, val)
    })
  }

  initServiceWatch(textType, textEndpoint, textModel, textApiKey, serviceOptions, `ai_text`, SILICONFLOW_DEFAULT_TEXT_MODEL)
  initServiceWatch(visionType, visionEndpoint, visionModel, visionApiKey, serviceOptions, `ai_vision`, SILICONFLOW_DEFAULT_VISION_MODEL)
  initServiceWatch(imageType, imageEndpoint, imageModel, imageApiKey, imageServiceOptions, `ai_image`, SILICONFLOW_DEFAULT_IMAGE_MODEL)

  // ==================== 向后兼容 ====================
  const type = textType
  const endpoint = textEndpoint
  const model = textModel
  const apiKey = textApiKey

  // ==================== Actions ====================
  const reset = async () => {
    // 清理文本和视觉模型的服务数据
    for (const prefix of [`ai_text`, `ai_vision`]) {
      for (const svc of serviceOptions) {
        await store.remove(`${prefix}_key_${svc.value}`)
        await store.remove(`${prefix}_model_${svc.value}`)
      }
    }
    // 清理图片生成模型的服务数据
    for (const svc of imageServiceOptions) {
      await store.remove(`ai_image_key_${svc.value}`)
      await store.remove(`ai_image_model_${svc.value}`)
    }
    textType.value = DEFAULT_SERVICE_TYPE
    visionType.value = DEFAULT_SERVICE_TYPE
    imageType.value = DEFAULT_SERVICE_TYPE
    temperature.value = DEFAULT_SERVICE_TEMPERATURE
    maxToken.value = DEFAULT_SERVICE_MAX_TOKEN
  }

  return {
    // 文本模型
    textType,
    textEndpoint,
    textModel,
    textApiKey,
    type,
    endpoint,
    model,
    apiKey, // 向后兼容
    temperature,
    maxToken,

    // 视觉模型
    visionType,
    visionEndpoint,
    visionModel,
    visionApiKey,

    // 图片生成模型
    imageType,
    imageEndpoint,
    imageModel,
    imageApiKey,

    // Actions
    reset,
  }
})

export default useAIConfigStore
