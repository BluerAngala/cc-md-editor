<script setup lang="ts">
import { Loader2, Send, X } from '@lucide/vue'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { buildAIHeaders, resolveEndpointUrl, useAIFetch } from '@/composables/useAIFetch'
import { useAIConfigStore } from '@/stores/aiConfig'
import { usePostStore } from '@/stores/post'

const props = defineProps<{
  screenshot: string // data URL
  ideaTitle: string
  ideaDesc: string
}>()

const emit = defineEmits<{
  close: []
  inserted: []
}>()

const aiConfig = useAIConfigStore()
const postStore = usePostStore()
const { loading, fetchSSE, abort } = useAIFetch()

const prompt = ref(
  `请根据以下想法和白板截图，帮我写一篇完整的文章初稿。\n\n想法标题：${props.ideaTitle}\n想法描述：${props.ideaDesc || '（无描述）'}\n\n要求：\n1. 根据截图中的内容梳理文章结构\n2. 语言流畅自然，适合公众号发布\n3. 直接输出 Markdown 格式的文章内容\n4. 不需要输出标题以外的元信息`,
)

const result = ref('')
const done = ref(false)
const error = ref('')

async function generate() {
  if (loading.value)
    return
  result.value = ''
  done.value = false
  error.value = ''

  try {
    const url = resolveEndpointUrl(aiConfig.endpoint, 'chat')
    const headers = buildAIHeaders(aiConfig.apiKey, aiConfig.type)

    const payload: Record<string, unknown> = {
      model: aiConfig.visionModel || aiConfig.textModel,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.maxToken,
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt.value },
            { type: 'image_url', image_url: { url: props.screenshot } },
          ],
        },
      ],
    }

    await fetchSSE(url, headers, payload, {
      onDelta: (content) => {
        result.value += content
      },
      onDone: () => {
        done.value = true
      },
    })
  }
  catch (e: any) {
    error.value = e.message || 'AI 调用失败'
  }
}

function insertToDraft() {
  if (!result.value)
    return
  const post = postStore.addPost(props.ideaTitle || 'AI 生成初稿')
  // 将截图作为首图 + AI 生成的内容
  const content = `![想法白板](${props.screenshot})\n\n${result.value}`
  postStore.updatePostContent(post.id, content)
  emit('inserted')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="emit('close')">
    <div class="flex h-[85vh] w-[800px] max-w-[90vw] flex-col rounded-xl border bg-background shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between border-b px-4 py-3">
        <h2 class="text-base font-semibold">
          AI 生成文章初稿
        </h2>
        <Button variant="ghost" size="icon" class="h-7 w-7" @click="emit('close')">
          <X class="h-4 w-4" />
        </Button>
      </div>

      <div class="flex flex-1 overflow-hidden">
        <!-- 左侧：截图预览 -->
        <div class="w-1/3 border-r p-4">
          <p class="mb-2 text-xs font-medium text-muted-foreground">
            白板截图
          </p>
          <img :src="screenshot" class="rounded border" alt="白板截图">
          <p class="mt-3 text-xs text-muted-foreground">
            💡 在画布上选中内容再点击「生成初稿」，可只发送选中部分
          </p>
        </div>

        <!-- 右侧：Prompt + 结果 -->
        <div class="flex flex-1 flex-col overflow-hidden">
          <!-- Prompt 编辑 -->
          <div class="border-b p-4">
            <p class="mb-2 text-xs font-medium text-muted-foreground">
              Prompt（可编辑）
            </p>
            <textarea
              v-model="prompt"
              class="h-24 w-full resize-none rounded-md border bg-muted/30 p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div class="mt-2 flex items-center gap-2">
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

          <!-- AI 结果 -->
          <div class="flex-1 overflow-y-auto p-4">
            <div v-if="error" class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {{ error }}
            </div>
            <div v-else-if="result" class="prose prose-sm max-w-none whitespace-pre-wrap">
              {{ result }}
            </div>
            <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
              点击「生成初稿」开始
            </div>
          </div>

          <!-- 底部操作 -->
          <div v-if="done && result" class="border-t px-4 py-3">
            <Button @click="insertToDraft">
              插入草稿箱
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
