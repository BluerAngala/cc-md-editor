import type { ImageServiceOption, ServiceOption } from '@md/shared/types'
import { imageServiceOptions, serviceOptions } from '@md/shared/configs'
import { withSiliconflowFetcher } from '@/services/ai/siliconflow'

type Translate = (key: string) => string

export function getAIServiceLabel(t: Translate, value: string): string {
  const key = `ai.services.${value}`
  const translated = t(key)
  return translated !== key ? translated : value
}

export function getAIImageServiceLabel(t: Translate, value: string): string {
  const key = `ai.imageServices.${value}`
  const translated = t(key)
  return translated !== key ? translated : value
}

function localizeServiceOptions(t: Translate): ServiceOption[] {
  return serviceOptions.map((option) => {
    const localized: ServiceOption = {
      ...option,
      label: getAIServiceLabel(t, option.value),
    }
    if (option.value === `siliconflow`)
      return withSiliconflowFetcher(localized, option.endpoint)
    return localized
  })
}

function localizeImageServiceOptions(t: Translate): ImageServiceOption[] {
  return imageServiceOptions.map((option) => {
    const localized: ImageServiceOption = {
      ...option,
      label: getAIImageServiceLabel(t, option.value),
    }
    if (option.value === `siliconflow`)
      return withSiliconflowFetcher(localized, option.endpoint)
    return localized
  })
}

export function createLocalizedAIServiceOptions(t: Translate) {
  return {
    serviceOptions: localizeServiceOptions(t),
    imageServiceOptions: localizeImageServiceOptions(t),
    getAIServiceLabel: (value: string) => getAIServiceLabel(t, value),
    getAIImageServiceLabel: (value: string) => getAIImageServiceLabel(t, value),
  }
}

export function useLocalizedAIServiceOptions() {
  const { t, locale } = useI18n()

  return computed(() => {
    void locale.value
    return createLocalizedAIServiceOptions(t)
  })
}
