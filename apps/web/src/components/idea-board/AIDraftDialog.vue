<script setup lang="ts">
import { Loader2, Send, Settings, X } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import AIConfig from '@/components/ai/chat-box/AIConfig.vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { buildAIHeaders, resolveEndpointUrl, useAIFetch } from '@/composables/useAIFetch'
import { useImageUploader } from '@/composables/useImageUploader'
import { useAIConfigStore } from '@/stores/aiConfig'
import { usePostStore } from '@/stores/post'

const props = defineProps<{
  screenshotFile: File
  ideaTitle: string
  ideaDesc: string
}>()

const emit = defineEmits<{
  close: []
  inserted: []
}>()

const aiConfig = useAIConfigStore()
const postStore = usePostStore()
const { upload } = useImageUploader()
const { loading, fetchSSE, abort } = useAIFetch()

// File → data URL（供 AI 视觉模型和预览使用）
const screenshotDataUrl = ref('')
onMounted(() => {
  const reader = new FileReader()
  reader.onloadend = () => { screenshotDataUrl.value = reader.result as string }
  reader.readAsDataURL(props.screenshotFile)
})

const PROMPT_TEMPLATE = `请根据以下想法和白板截图，帮我写一篇完整的文章初稿。

想法标题：{title}
想法描述：{desc}

要求：
1. 根据截图中的内容梳理文章结构
2. 语言流畅自然，适合公众号发布
3. 直接输出 Markdown 格式的文章内容
4. 不需要输出标题以外的元信息`

const prompt = ref(
  PROMPT_TEMPLATE
    .replace('{title}', props.ideaTitle)
    .replace('{desc}', props.ideaDesc || '（无描述）'),
)

const result = ref('')
const done = ref(false)
const error = ref('')
const step = ref<'idle' | 'vision' | 'ocr' | 'writing' | 'done'>('idle')
const stepText = ref('')
const inserting = ref(false)

// ── 用视觉模型一步到位 ─────────────────────────────────
async function tryVisionModel(): Promise<boolean> {
  const visionModel = aiConfig.visionModel
  if (!visionModel)
    return false

  step.value = 'vision'
  stepText.value = '正在用视觉模型理解图片…'

  try {
    const url = resolveEndpointUrl(aiConfig.visionEndpoint || aiConfig.endpoint, 'chat')
    const headers = buildAIHeaders(aiConfig.visionApiKey || aiConfig.apiKey, aiConfig.visionType || aiConfig.type)

    const payload: Record<string, unknown> = {
      model: visionModel,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.maxToken,
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt.value },
            { type: 'image_url', image_url: { url: screenshotDataUrl.value } },
          ],
        },
      ],
    }

    result.value = ''
    await fetchSSE(url, headers, payload, {
      onDelta: (content) => {
        result.value += content
      },
      onDone: () => {
        done.value = true
        step.value = 'done'
        stepText.value = ''
      },
    })
    return true
  }
  catch {
    // 视觉模型失败，降级
    result.value = ''
    done.value = false
    return false
  }
}

// ── 降级：OCR 提取 + 文本模型生成 ─────────────────────────
async function fallbackOcrAndWrite() {
  const visionModel = aiConfig.visionModel
  const textModel = aiConfig.textModel
  const textEndpoint = aiConfig.endpoint
  const textApiKey = aiConfig.apiKey
  const textType = aiConfig.type

  // Step 1: OCR — 用视觉模型提取图片中的文字内容
  let ocrResult = ''
  if (visionModel) {
    step.value = 'ocr'
    stepText.value = '正在用图片理解模型提取内容…'

    try {
      const url = resolveEndpointUrl(aiConfig.visionEndpoint || aiConfig.endpoint, 'chat')
      const headers = buildAIHeaders(aiConfig.visionApiKey || aiConfig.apiKey, aiConfig.visionType || aiConfig.type)

      const payload: Record<string, unknown> = {
        model: visionModel,
        temperature: 0,
        max_tokens: 4096,
        stream: false,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '请仔细阅读这张白板/思维导图截图，将其中所有文字内容、结构关系、层级关系完整提取出来。输出为结构化的纯文本，保留层级缩进和箭头/连线所表达的逻辑关系。不要添加额外分析，只提取截图中的原始内容。' },
              { type: 'image_url', image_url: { url: screenshotDataUrl.value } },
            ],
          },
        ],
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        ocrResult = data.choices?.[0]?.message?.content || ''
      }
    }
    catch {
      // OCR 也失败了
    }
  }

  if (!ocrResult) {
    error.value = '未配置视觉模型，无法理解图片内容。请在设置中配置视觉模型。'
    step.value = 'idle'
    return
  }

  // Step 2: 用文本模型根据 OCR 结果生成文章
  if (!textModel) {
    error.value = '未配置文本模型，无法生成文章。'
    step.value = 'idle'
    return
  }

  step.value = 'writing'
  stepText.value = '正在用文本模型生成文章…'

  const writePrompt = ocrResult
    ? `请根据以下白板/思维导图的结构化内容，帮我写一篇完整的文章初稿。

想法标题：${props.ideaTitle}
想法描述：${props.ideaDesc || '（无描述）'}

白板内容（从图片中提取）：
${ocrResult}

要求：
1. 根据白板内容梳理文章结构
2. 语言流畅自然，适合公众号发布
3. 直接输出 Markdown 格式的文章内容
4. 不需要输出标题以外的元信息`
    : prompt.value

  try {
    const url = resolveEndpointUrl(textEndpoint, 'chat')
    const headers = buildAIHeaders(textApiKey, textType)

    const payload: Record<string, unknown> = {
      model: textModel,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.maxToken,
      stream: true,
      messages: [
        { role: 'user', content: writePrompt },
      ],
    }

    result.value = ''
    await fetchSSE(url, headers, payload, {
      onDelta: (content) => {
        result.value += content
      },
      onDone: () => {
        done.value = true
        step.value = 'done'
        stepText.value = ''
      },
    })
  }
  catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'AI 调用失败'
    step.value = 'idle'
  }
}

// ── 主流程 ─────────────────────────────────────────────
async function generate() {
  if (loading.value)
    return
  result.value = ''
  done.value = false
  error.value = ''
  step.value = 'idle'
  stepText.value = ''

  // 检查基本配置
  if (!aiConfig.apiKey && !aiConfig.visionApiKey) {
    error.value = '请先在设置中配置 AI 的 API Key'
    return
  }

  // 策略 1：视觉模型一步到位
  const visionSuccess = await tryVisionModel()
  if (visionSuccess)
    return

  // 策略 2：降级为 OCR + 文本模型
  await fallbackOcrAndWrite()
}

async function insertToDraft() {
  if (!result.value || inserting.value)
    return
  inserting.value = true
  const post = postStore.addPost(props.ideaTitle || 'AI 生成初稿')
  try {
    const imageUrl = await upload(props.screenshotFile)
    postStore.updatePostContent(post.id, `![想法白板](${imageUrl})\n\n${result.value}`)
  }
  catch (e: unknown) {
    // 上传失败，仍保留已创建的文章（含 base64 首图兜底）
    postStore.updatePostContent(post.id, `![想法白板](${screenshotDataUrl.value})\n\n${result.value}`)
    error.value = e instanceof Error ? e.message : '图片上传失败，已使用本地图片兜底'
  }
  finally {
    // 立即落盘，不依赖 500ms debounce，避免刷新丢稿
    await postStore.persistImmediately()
    inserting.value = false
    emit('inserted')
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="emit('close')">
    <div class="flex h-[85vh] w-[1100px] max-w-[95vw] flex-col rounded-xl border bg-background shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between border-b px-4 py-3">
        <h2 class="text-base font-semibold">
          AI 生成文章初稿
        </h2>
        <Button variant="ghost" size="icon" class="h-7 w-7" @click="emit('close')">
          <X class="h-4 w-4" />
        </Button>
      </div>

      <!-- 三栏主体 -->
      <div class="flex flex-1 overflow-hidden">
        <!-- 左栏：白板截图 -->
        <div class="flex w-[28%] flex-col border-r">
          <div class="flex h-[46px] items-center border-b px-4 text-xs font-medium text-muted-foreground">
            白板截图
          </div>
          <div class="flex-1 overflow-y-auto p-4">
            <img :src="screenshotDataUrl" class="w-full rounded border" alt="白板截图">
            <p class="mt-3 text-xs text-muted-foreground">
              💡 在画布上选中内容再右键「生成文章草稿」，可只发送选中部分
            </p>
          </div>
        </div>

        <!-- 中栏：提示词 + 生成按钮 -->
        <div class="flex w-[34%] flex-col border-r">
          <div class="flex h-[46px] items-center justify-between border-b px-4">
            <span class="text-xs font-medium text-muted-foreground">
              Prompt（可编辑）
            </span>
            <div class="flex items-center gap-2">
              <Popover>
                <PopoverTrigger as-child>
                  <Button variant="outline" size="sm" class="gap-1.5">
                    <Settings class="h-3.5 w-3.5" />
                    AI 配置
                  </Button>
                </PopoverTrigger>
                <PopoverContent class="w-[420px] max-h-[70vh] overflow-y-auto" align="end">
                  <AIConfig />
                </PopoverContent>
              </Popover>
              <Button size="sm" :disabled="loading" @click="generate">
                <Send v-if="!loading" class="mr-1 h-3.5 w-3.5" />
                <Loader2 v-else class="mr-1 h-3.5 w-3.5 animate-spin" />
                {{ loading ? '生成中...' : '生成初稿' }}
              </Button>
              <Button v-if="loading" variant="ghost" size="sm" @click="abort">
                停止
              </Button>
            </div>
          </div>
          <span v-if="stepText" class="px-4 pt-2 text-xs text-muted-foreground">
            {{ stepText }}
          </span>
          <!-- Prompt 编辑区 -->
          <div class="flex flex-1 flex-col overflow-hidden p-4">
            <textarea
              v-model="prompt"
              class="flex-1 w-full resize-none rounded-md border bg-muted/30 p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p class="mt-2 text-xs text-muted-foreground">
              文本：{{ aiConfig.textModel || '未配置' }}
            </p>
            <p class="text-xs text-muted-foreground">
              视觉：{{ aiConfig.visionModel || '未配置' }}
            </p>
          </div>
        </div>

        <!-- 右栏：预览结果 + 插入按钮 -->
        <div class="flex w-[38%] flex-col overflow-hidden">
          <div class="flex h-[46px] items-center justify-between border-b px-4">
            <span class="text-xs font-medium text-muted-foreground">
              生成结果
            </span>
            <Button :disabled="!done || !result || inserting" size="sm" @click="insertToDraft">
              <Loader2 v-if="inserting" class="mr-1 h-3.5 w-3.5 animate-spin" />
              {{ inserting ? '插入中...' : '插入草稿箱' }}
            </Button>
          </div>
          <!-- 结果预览 -->
          <div class="flex-1 overflow-y-auto p-4">
            <div v-if="error" class="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-3 text-sm text-red-600 dark:text-red-400">
              {{ error }}
            </div>
            <div v-else-if="result" class="prose prose-sm max-w-none whitespace-pre-wrap">
              {{ result }}
            </div>
            <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
              点击「生成初稿」开始
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
