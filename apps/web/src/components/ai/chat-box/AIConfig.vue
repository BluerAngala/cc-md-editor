<script setup lang="ts">
import type { ImageServiceOption, ServiceOption } from '@md/shared/types'
import { Check, ChevronDown, Info, Loader2, RefreshCw, X } from '@lucide/vue'
import { DEFAULT_SERVICE_TYPE } from '@md/shared/constants'
import {
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from 'reka-ui'
import { PasswordInput } from '@/components/ui/password-input'
import { buildAIHeaders, resolveEndpointUrl, useAIFetch } from '@/composables/useAIFetch'
import { useDynamicAIModels } from '@/composables/useDynamicAIModels'
import { useLocalizedAIServiceOptions } from '@/composables/useLocalizedAIServices'
import { useAIConfigStore } from '@/stores/aiConfig'

const emit = defineEmits([`saved`])
const aiConfig = useAIConfigStore()
const { t } = useI18n()

const { fetchJSON } = useAIFetch()
const localizedAIServices = useLocalizedAIServiceOptions()

// 每个模型独立的测试状态
const textTesting = ref(false)
const visionTesting = ref(false)
const imageTesting = ref(false)
const textTestResult = ref<{ ok: boolean, msg: string } | null>(null)
const visionTestResult = ref<{ ok: boolean, msg: string } | null>(null)
const imageTestResult = ref<{ ok: boolean, msg: string } | null>(null)

function getCurrentService<T extends ServiceOption | ImageServiceOption>(
  svcType: string,
  options: T[],
): T {
  return options.find(s => s.value === svcType) ?? options[0]
}

const textService = computed(() => getCurrentService(aiConfig.textType, localizedAIServices.value.serviceOptions))
const visionService = computed(() => getCurrentService(aiConfig.visionType, localizedAIServices.value.serviceOptions))
const imageService = computed(() => getCurrentService(aiConfig.imageType, localizedAIServices.value.imageServiceOptions))

// 动态模型：当供应商提供 fetchModels 时按需调用 /v1/models，
// 否则回退到服务静态 models 列表。多个组件复用一份缓存。
const textDynamic = useDynamicAIModels(textService, () => aiConfig.textApiKey)
const visionDynamic = useDynamicAIModels(visionService, () => aiConfig.visionApiKey)

// 图片模型过滤器：只保留图片生成相关的模型，排除文本/对话模型
function isImageModel(modelId: string): boolean {
  const imageKeywords = [
    `image`,
    `flux`,
    `dall-e`,
    `stable-diffusion`,
    `sd`,
    `kolors`,
    `qwen-image`,
    `wanx`,
    `cogview`,
    `ideogram`,
    `midjourney`,
    `mj`,
    `recraft`,
    `gpt-image`,
    `seedream`,
    `kontext`,
  ]
  const lower = modelId.toLowerCase()
  return imageKeywords.some(kw => lower.includes(kw))
}
const imageDynamic = useDynamicAIModels(imageService, () => aiConfig.imageApiKey, isImageModel)

async function testConn(
  endpoint: string,
  apiKey: string,
  type: string,
  modelName: string,
  resultRef: typeof textTestResult,
  testingRef: typeof textTesting,
) {
  resultRef.value = null
  testingRef.value = true
  const headers = buildAIHeaders(apiKey, type)
  try {
    const url = resolveEndpointUrl(endpoint, `chat`)
    const payload = { model: modelName, messages: [{ role: `user`, content: `ping` }], temperature: 0, max_tokens: 1, stream: false }
    const res = await fetchJSON(url, headers, payload)
    if (res.ok) {
      resultRef.value = { ok: true, msg: '成功' }
      emit(`saved`)
    }
    else {
      resultRef.value = { ok: false, msg: `${res.status} ${res.statusText}` }
    }
  }
  catch (e: unknown) {
    resultRef.value = { ok: false, msg: e instanceof Error ? e.message : String(e) }
  }
  finally {
    testingRef.value = false
  }
}

function testText() { testConn(aiConfig.textEndpoint, aiConfig.textApiKey, aiConfig.textType, aiConfig.textModel, textTestResult, textTesting) }
function testVision() { testConn(aiConfig.visionEndpoint, aiConfig.visionApiKey, aiConfig.visionType, aiConfig.visionModel, visionTestResult, visionTesting) }

// 图片模型使用 image 端点测试，而非 chat 端点
async function testImage() {
  imageTestResult.value = null
  imageTesting.value = true
  const headers = buildAIHeaders(aiConfig.imageApiKey, aiConfig.imageType)
  try {
    const url = resolveEndpointUrl(aiConfig.imageEndpoint, `image`)
    const payload = { model: aiConfig.imageModel, prompt: `test`, n: 1, size: `1024x1024` }
    const res = await fetchJSON(url, headers, payload)
    if (res.ok) {
      imageTestResult.value = { ok: true, msg: '成功' }
      emit(`saved`)
    }
    else {
      imageTestResult.value = { ok: false, msg: `${res.status} ${res.statusText}` }
    }
  }
  catch (e: unknown) {
    imageTestResult.value = { ok: false, msg: e instanceof Error ? e.message : String(e) }
  }
  finally {
    imageTesting.value = false
  }
}
</script>

<template>
  <div class="custom-scroll flex-1 text-xs sm:text-sm">
    <AccordionRoot
      type="single"
      collapsible
      default-value="text"
      class="space-y-4"
    >
      <!-- ========== 文本模型 ========== -->
      <AccordionItem value="text" class="rounded-lg border overflow-hidden">
        <AccordionHeader>
          <AccordionTrigger class="flex w-full cursor-pointer select-none items-center justify-between px-3 py-2.5 text-sm font-semibold hover:bg-muted/50 [&[data-state=open]>svg.chevron]:rotate-180">
            <div class="flex flex-1 items-center text-left">
              <span>📝 文本模型</span>
              <span class="ml-2 text-xs font-normal text-muted-foreground">用于文字生成、AI 助手对话等</span>
            </div>
            <div class="flex items-center gap-1.5" @click.stop.prevent @keydown.stop>
              <Button size="sm" variant="ghost" class="h-6 px-2 text-xs" :disabled="textTesting" @click="testText">
                {{ t('common.testConnection') }}
              </Button>
              <Loader2 v-if="textTesting" class="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <template v-else-if="textTestResult">
                <Check v-if="textTestResult.ok" class="h-4 w-4 text-green-500" />
                <X v-else class="h-4 w-4 text-red-500" />
              </template>
            </div>
            <ChevronDown class="chevron h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionContent class="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div class="space-y-3 px-3 pb-3 pt-1">
            <div>
              <Label class="mb-1 block text-sm font-medium">{{ t('ai.config.serviceType') }}</Label>
              <Select v-model="aiConfig.textType">
                <SelectTrigger class="w-full">
                  <SelectValue>{{ textService.label }}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="svc in localizedAIServices.serviceOptions" :key="svc.value" :value="svc.value">
                    {{ svc.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div v-if="aiConfig.textType !== DEFAULT_SERVICE_TYPE">
              <Label class="mb-1 block text-sm font-medium">{{ t('ai.config.apiEndpoint') }}</Label>
              <Input v-model="aiConfig.textEndpoint" :placeholder="t('ai.config.apiEndpointPlaceholder')" />
            </div>

            <div v-if="aiConfig.textType !== DEFAULT_SERVICE_TYPE">
              <Label class="mb-1 block text-sm font-medium">{{ t('ai.config.apiKey') }}</Label>
              <PasswordInput v-model="aiConfig.textApiKey" placeholder="sk-..." />
            </div>

            <div>
              <div class="mb-1 flex items-center justify-between">
                <Label class="text-sm font-medium">{{ t('ai.config.modelName') }}</Label>
                <button
                  v-if="textService.fetchModels"
                  type="button"
                  class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  :disabled="textDynamic.loading.value || !aiConfig.textApiKey"
                  :title="t('ai.config.refreshModelsHint')"
                  @click="textDynamic.refresh()"
                >
                  <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': textDynamic.loading.value }" />
                  <span>{{ textDynamic.loading.value ? t('ai.config.refreshModelsLoading') : t('ai.config.refreshModels') }}</span>
                </button>
              </div>
              <Select v-if="textDynamic.allModels.value.length > 0" v-model="aiConfig.textModel">
                <SelectTrigger class="w-full">
                  <SelectValue>{{ aiConfig.textModel || t('ai.config.selectModel') }}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="m in textDynamic.allModels.value" :key="m" :value="m">
                    {{ m }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input v-else v-model="aiConfig.textModel" :placeholder="t('ai.config.modelPlaceholder')" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <Label class="mb-1 flex items-center gap-1 text-sm font-medium">
                  {{ t('ai.config.temperature') }}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Info class="text-gray-500" :size="14" />
                      </TooltipTrigger>
                      <TooltipContent side="top" class="z-250">
                        {{ t('ai.config.temperatureHint') }}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input v-model.number="aiConfig.temperature" type="number" step="0.1" min="0" max="2" />
              </div>
              <div>
                <Label class="mb-1 block text-sm font-medium">{{ t('ai.config.maxTokens') }}</Label>
                <Input v-model.number="aiConfig.maxToken" type="number" min="1" max="32768" />
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <!-- ========== 视觉模型 ========== -->
      <AccordionItem value="vision" class="rounded-lg border overflow-hidden">
        <AccordionHeader>
          <AccordionTrigger class="flex w-full cursor-pointer select-none items-center justify-between px-3 py-2.5 text-sm font-semibold hover:bg-muted/50 [&[data-state=open]>svg.chevron]:rotate-180">
            <div class="flex flex-1 items-center text-left">
              <span>👁️ 视觉模型（图片理解）</span>
              <span class="ml-2 text-xs font-normal text-muted-foreground">分析图片内容，白板截图生成文章</span>
            </div>
            <div class="flex items-center gap-1.5" @click.stop.prevent @keydown.stop>
              <Button size="sm" variant="ghost" class="h-6 px-2 text-xs" :disabled="visionTesting" @click="testVision">
                {{ t('common.testConnection') }}
              </Button>
              <Loader2 v-if="visionTesting" class="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <template v-else-if="visionTestResult">
                <Check v-if="visionTestResult.ok" class="h-4 w-4 text-green-500" />
                <X v-else class="h-4 w-4 text-red-500" />
              </template>
            </div>
            <ChevronDown class="chevron h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionContent class="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div class="space-y-3 px-3 pb-3 pt-1">
            <div>
              <Label class="mb-1 block text-sm font-medium">{{ t('ai.config.serviceType') }}</Label>
              <Select v-model="aiConfig.visionType">
                <SelectTrigger class="w-full">
                  <SelectValue>{{ visionService.label }}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="svc in localizedAIServices.serviceOptions" :key="svc.value" :value="svc.value">
                    {{ svc.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div v-if="aiConfig.visionType !== DEFAULT_SERVICE_TYPE">
              <Label class="mb-1 block text-sm font-medium">{{ t('ai.config.apiEndpoint') }}</Label>
              <Input v-model="aiConfig.visionEndpoint" :placeholder="t('ai.config.apiEndpointPlaceholder')" />
            </div>

            <div v-if="aiConfig.visionType !== DEFAULT_SERVICE_TYPE">
              <Label class="mb-1 block text-sm font-medium">{{ t('ai.config.apiKey') }}</Label>
              <PasswordInput v-model="aiConfig.visionApiKey" placeholder="sk-..." />
            </div>

            <div>
              <div class="mb-1 flex items-center justify-between">
                <Label class="text-sm font-medium">{{ t('ai.config.modelName') }}</Label>
                <button
                  v-if="visionService.fetchModels"
                  type="button"
                  class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  :disabled="visionDynamic.loading.value || !aiConfig.visionApiKey"
                  :title="t('ai.config.refreshModelsHint')"
                  @click="visionDynamic.refresh()"
                >
                  <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': visionDynamic.loading.value }" />
                  <span>{{ visionDynamic.loading.value ? t('ai.config.refreshModelsLoading') : t('ai.config.refreshModels') }}</span>
                </button>
              </div>
              <Select v-if="visionDynamic.allModels.value.length > 0" v-model="aiConfig.visionModel">
                <SelectTrigger class="w-full">
                  <SelectValue>{{ aiConfig.visionModel || t('ai.config.selectModel') }}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="m in visionDynamic.allModels.value" :key="m" :value="m">
                    {{ m }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input v-else v-model="aiConfig.visionModel" placeholder="如 gpt-4o" />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <!-- ========== 图片生成模型 ========== -->
      <AccordionItem value="image" class="rounded-lg border overflow-hidden">
        <AccordionHeader>
          <AccordionTrigger class="flex w-full cursor-pointer select-none items-center justify-between px-3 py-2.5 text-sm font-semibold hover:bg-muted/50 [&[data-state=open]>svg.chevron]:rotate-180">
            <div class="flex flex-1 items-center text-left">
              <span>🎨 图片生成模型</span>
              <span class="ml-2 text-xs font-normal text-muted-foreground">AI 生成封面图、插图等</span>
            </div>
            <div class="flex items-center gap-1.5" @click.stop.prevent @keydown.stop>
              <Button size="sm" variant="ghost" class="h-6 px-2 text-xs" :disabled="imageTesting" @click="testImage">
                {{ t('common.testConnection') }}
              </Button>
              <Loader2 v-if="imageTesting" class="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <template v-else-if="imageTestResult">
                <Check v-if="imageTestResult.ok" class="h-4 w-4 text-green-500" />
                <X v-else class="h-4 w-4 text-red-500" />
              </template>
            </div>
            <ChevronDown class="chevron h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionContent class="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div class="space-y-3 px-3 pb-3 pt-1">
            <div>
              <Label class="mb-1 block text-sm font-medium">{{ t('ai.config.serviceType') }}</Label>
              <Select v-model="aiConfig.imageType">
                <SelectTrigger class="w-full">
                  <SelectValue>{{ imageService.label }}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="svc in localizedAIServices.imageServiceOptions" :key="svc.value" :value="svc.value">
                    {{ svc.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div v-if="aiConfig.imageType !== DEFAULT_SERVICE_TYPE">
              <Label class="mb-1 block text-sm font-medium">{{ t('ai.config.apiEndpoint') }}</Label>
              <Input v-model="aiConfig.imageEndpoint" :placeholder="t('ai.config.apiEndpointPlaceholder')" />
            </div>

            <div v-if="aiConfig.imageType !== DEFAULT_SERVICE_TYPE">
              <Label class="mb-1 block text-sm font-medium">{{ t('ai.config.apiKey') }}</Label>
              <PasswordInput v-model="aiConfig.imageApiKey" placeholder="sk-..." />
            </div>

            <div>
              <div class="mb-1 flex items-center justify-between">
                <Label class="text-sm font-medium">{{ t('ai.config.modelName') }}</Label>
                <button
                  v-if="imageService.fetchModels"
                  type="button"
                  class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  :disabled="imageDynamic.loading.value || !aiConfig.imageApiKey"
                  :title="t('ai.config.refreshModelsHint')"
                  @click="imageDynamic.refresh()"
                >
                  <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': imageDynamic.loading.value }" />
                  <span>{{ imageDynamic.loading.value ? t('ai.config.refreshModelsLoading') : t('ai.config.refreshModels') }}</span>
                </button>
              </div>
              <Select v-if="imageDynamic.allModels.value.length > 0" v-model="aiConfig.imageModel">
                <SelectTrigger class="w-full">
                  <SelectValue>{{ aiConfig.imageModel || t('ai.config.selectModel') }}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="m in imageDynamic.allModels.value" :key="m" :value="m">
                    {{ m }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input v-else v-model="aiConfig.imageModel" placeholder="如 dall-e-3" />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </AccordionRoot>
  </div>
</template>

<style scoped>
@reference 'tailwindcss';

.custom-scroll::-webkit-scrollbar {
  width: 6px;
}
@media (pointer: coarse) {
  .custom-scroll::-webkit-scrollbar {
    width: 3px;
  }
}
.custom-scroll::-webkit-scrollbar-thumb {
  @apply rounded-full bg-gray-400/40 hover:bg-gray-400/60;
  @apply dark:bg-gray-500/40 dark:hover:bg-gray-500/70;
}
.custom-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgb(156 163 175 / 0.4) transparent;
}
.dark .custom-scroll {
  scrollbar-color: rgb(107 114 128 / 0.4) transparent;
}
</style>
