<script setup lang="ts">
import type { QuickCommandRuntime } from '@/stores/quickCommands'
import {
  ArrowLeft,
  Check,
  Copy,
  MessageCircle,
  Pin,
  Plus,
  RefreshCcw,
  Send,
  Settings,
  X,
} from '@lucide/vue'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { buildAIHeaders, resolveEndpointUrl, useAIFetch } from '@/composables/useAIFetch'
import { copyPlain } from '@/lib/browser/clipboard'
import { store } from '@/storage'
import useAIConfigStore from '@/stores/aiConfig'
import { useAIPanelStore } from '@/stores/aiPanel'
import { useEditorStore } from '@/stores/editor'
import { useQuickCommandsStore } from '@/stores/quickCommands'
import AIConfig from './AIConfig.vue'

const FEEDBACK_INDICATOR_TIMEOUT_MS = 1500

const panelStore = useAIPanelStore()
const editorStore = useEditorStore()
const { editor } = storeToRefs(editorStore)
const configStore = useAIConfigStore()
const { apiKey, endpoint, model, temperature, maxToken, type } = storeToRefs(configStore)
const quickCmdStore = useQuickCommandsStore()

const { t } = useI18n()

// ── Local position/size refs (decoupled from store for smooth drag/resize) ──
const panelRef = ref<HTMLElement | null>(null)
const dragHandleRef = ref<HTMLElement | null>(null)
const x = ref(panelStore.position.x)
const y = ref(panelStore.position.y)
const w = ref(panelStore.size.width)
const h = ref(panelStore.size.height)

// Sync store → local when panel opens
watch([() => panelStore.visible, () => panelStore.position.x, () => panelStore.position.y], ([vis]) => {
  if (vis) {
    x.value = panelStore.position.x
    y.value = panelStore.position.y
    w.value = panelStore.size.width
    h.value = panelStore.size.height
  }
}, { immediate: true })

// ── Drag (update local refs only, sync store on mouseup) ──
function onDragStart(e: MouseEvent) {
  if (!(e.target as HTMLElement)?.closest(`.ai-panel-header`))
    return
  if ((e.target as HTMLElement).closest(`button`))
    return

  e.preventDefault()
  const startX = e.clientX - x.value
  const startY = e.clientY - y.value

  function onMove(ev: MouseEvent) {
    x.value = ev.clientX - startX
    y.value = ev.clientY - startY
  }

  function onUp() {
    document.removeEventListener(`mousemove`, onMove)
    document.removeEventListener(`mouseup`, onUp)
    panelStore.setPosition(x.value, y.value)
  }

  document.addEventListener(`mousemove`, onMove)
  document.addEventListener(`mouseup`, onUp)
}

// ── Resize (update local refs only, sync store on mouseup) ──
function onResizeStart(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  const startX = e.clientX
  const startY = e.clientY
  const startW = w.value
  const startH = h.value

  function onMove(ev: MouseEvent) {
    w.value = Math.max(panelStore.MIN_WIDTH, startW + ev.clientX - startX)
    h.value = Math.max(panelStore.MIN_HEIGHT, startH + ev.clientY - startY)
  }

  function onUp() {
    document.removeEventListener(`mousemove`, onMove)
    document.removeEventListener(`mouseup`, onUp)
    panelStore.setSize(w.value, h.value)
  }

  document.addEventListener(`mousemove`, onMove)
  document.addEventListener(`mouseup`, onUp)
}

// ── Chat state ──
const input = ref(``)
const inputHistory = ref<string[]>([])
const historyIndex = ref<number | null>(null)
const configVisible = ref(false)
const copiedIndex = ref<number | null>(null)
const insertedIndex = ref<number | null>(null)
const isQuoteAllContent = ref(false)
const chatContainerRef = ref<HTMLElement | null>(null)

interface ChatMessage {
  role: `user` | `assistant` | `system`
  content: string
  reasoning?: string
  done?: boolean
  id?: string
}

const messages = ref<ChatMessage[]>([])
const memoryKey = `ai_memory_context`
const { loading, abort: abortFetch, fetchSSE } = useAIFetch()

// ── Init ──
onMounted(async () => {
  const saved = await store.getJSON<ChatMessage[]>(memoryKey, [])
  messages.value = saved.length > 0
    ? saved.map((msg: ChatMessage) => ({ ...msg, id: msg.id || uuidv4() }))
    : getDefaultMessages()
  await scrollToBottom(true)
})

function getDefaultMessages(): ChatMessage[] {
  return [{ role: `assistant`, content: t(`ai.chat.greeting`), id: uuidv4() }]
}

// ── Auto-fill selected text ──
watch(() => panelStore.visible, (val) => {
  if (val && panelStore.selectedText) {
    input.value = panelStore.selectedText
    nextTick(() => {
      const textarea = chatContainerRef.value?.querySelector(`textarea`)
      textarea?.focus()
      textarea?.setSelectionRange(textarea.value.length, textarea.value.length)
    })
  }
})

// ── Scroll ──
async function scrollToBottom(force = false) {
  await nextTick()
  const el = chatContainerRef.value
  if (el && (force || el.scrollHeight - el.scrollTop - el.clientHeight < 200))
    el.scrollTop = el.scrollHeight
}

// ── Send / Stream ──
async function sendMessage() {
  if (!input.value.trim() || loading.value)
    return

  inputHistory.value.push(input.value.trim())
  historyIndex.value = null
  loading.value = true

  const userInput = input.value.trim()
  messages.value.push({ role: `user`, content: userInput, id: uuidv4() })
  input.value = ``

  const replyMessage: ChatMessage = { role: `assistant`, content: ``, reasoning: ``, done: false, id: uuidv4() }
  messages.value.push(replyMessage)
  await scrollToBottom(true)

  await streamResponse(replyMessage)
}

async function streamResponse(replyMessage: ChatMessage) {
  const allHistory = messages.value
    .slice(-12)
    .filter((msg, idx, arr) =>
      !(idx === arr.length - 1 && msg.role === `assistant` && !msg.done)
      && !(idx === 0 && msg.role === `assistant`),
    )

  let contextHistory: ChatMessage[]
  if (isQuoteAllContent.value) {
    const latest: ChatMessage[] = []
    for (let i = allHistory.length - 1; i >= 0 && latest.length < 2; i--) {
      const m = allHistory[i]
      if (latest.length === 0 || m.role === `user`)
        latest.unshift(m)
      else if (m.role === `assistant`)
        latest.unshift(m)
    }
    contextHistory = latest
  }
  else {
    contextHistory = allHistory.slice(-10)
  }

  const quoteMessages: ChatMessage[] = isQuoteAllContent.value
    ? [{ role: `system`, content: t(`ai.chat.systemQuote`, { content: editor.value?.state.doc.toString() ?? `` }) }]
    : []

  const payloadMessages = [
    { role: `system`, content: t(`ai.chat.systemPrompt`) },
    ...quoteMessages,
    ...contextHistory,
  ]

  const payload = {
    model: model.value,
    messages: payloadMessages,
    temperature: temperature.value,
    max_tokens: maxToken.value,
    stream: true,
  }
  const headers = buildAIHeaders(apiKey.value, type.value)
  const url = resolveEndpointUrl(endpoint.value, `chat`)

  try {
    await fetchSSE(url, headers, payload, {
      onDelta(content) {
        const last = messages.value[messages.value.length - 1]
        if (last !== replyMessage)
          return
        last.content += content
        scrollToBottom()
      },
      onReasoningDelta(reasoning) {
        const last = messages.value[messages.value.length - 1]
        if (last !== replyMessage)
          return
        last.reasoning = (last.reasoning || ``) + reasoning
        scrollToBottom()
      },
      onDone() {
        const last = messages.value[messages.value.length - 1]
        if (last.role === `assistant`) {
          last.done = true
          scrollToBottom(true)
        }
      },
    })
  }
  catch (e) {
    messages.value[messages.value.length - 1].content
      = t(`ai.chat.requestFailed`, { message: (e as Error).message })
    await scrollToBottom(true)
  }
  finally {
    await store.setJSON(memoryKey, messages.value)
  }
}

// ── Actions ──
function insertToDocument(text: string, index: number) {
  editorStore.insertAtCursor(text)
  insertedIndex.value = index
  setTimeout(() => (insertedIndex.value = null), FEEDBACK_INDICATOR_TIMEOUT_MS)
  toast.success(t(`ai.chat.insertedToDoc`))
}

function replaceSelection(text: string, index: number) {
  editorStore.replaceSelection(text)
  insertedIndex.value = index
  setTimeout(() => (insertedIndex.value = null), FEEDBACK_INDICATOR_TIMEOUT_MS)
  toast.success(t(`ai.chat.insertedToDoc`))
}

async function copyToClipboard(text: string, index: number) {
  copyPlain(text)
  copiedIndex.value = index
  setTimeout(() => (copiedIndex.value = null), FEEDBACK_INDICATOR_TIMEOUT_MS)
}

async function resetMessages() {
  abortFetch()
  messages.value = getDefaultMessages()
  await store.setJSON(memoryKey, messages.value)
}

async function regenerateLast() {
  if (loading.value)
    return
  const lastAssistant = [...messages.value].reverse().find(m => m.role === `assistant`)
  if (lastAssistant) {
    lastAssistant.content = ``
    lastAssistant.reasoning = ``
    lastAssistant.done = false
    await streamResponse(lastAssistant)
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229)
    return
  if (e.key === `Enter` && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
  if (e.key === `ArrowUp` && !input.value) {
    e.preventDefault()
    if (inputHistory.value.length > 0) {
      historyIndex.value = historyIndex.value === null
        ? inputHistory.value.length - 1
        : Math.max(0, historyIndex.value - 1)
      input.value = inputHistory.value[historyIndex.value]
    }
  }
  if (e.key === `ArrowDown` && historyIndex.value !== null) {
    e.preventDefault()
    historyIndex.value++
    if (historyIndex.value >= inputHistory.value.length) {
      historyIndex.value = null
      input.value = ``
    }
    else {
      input.value = inputHistory.value[historyIndex.value]
    }
  }
}

function applyQuickCommand(cmd: QuickCommandRuntime) {
  const selected = editorStore.getSelection()
  input.value = cmd.buildPrompt(selected)
  historyIndex.value = null
  nextTick(() => {
    const textarea = chatContainerRef.value?.querySelector(`textarea`)
    textarea?.focus()
    if (textarea)
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  })
}

function handleConfigSaved() {
  configVisible.value = false
  scrollToBottom(true)
}

const quickCommands = computed(() => quickCmdStore.commands)
</script>

<template>
  <Teleport to="body">
    <Transition name="ai-panel">
      <div
        v-if="panelStore.visible"
        ref="panelRef"
        class="ai-floating-panel fixed flex flex-col rounded-xl border shadow-2xl overflow-hidden select-none"
        :style="{
          left: `${x}px`,
          top: `${y}px`,
          width: `${w}px`,
          height: `${h}px`,
          zIndex: 100,
        }"
      >
        <!-- ============ Header (drag handle) ============ -->
        <div
          ref="dragHandleRef"
          class="ai-panel-header flex items-center justify-between px-3 py-2 cursor-move border-b shrink-0"
          @mousedown="onDragStart"
          @dblclick="panelStore.resetPosition()"
        >
          <div class="flex items-center gap-2 text-sm font-medium">
            <MessageCircle class="w-4 h-4" />
            <span>{{ t('ai.chat.title') }}</span>
          </div>
          <div class="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" class="h-7 w-7" :title="t('ai.chat.configParams')" @click.stop="configVisible = !configVisible">
              <Settings class="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" class="h-7 w-7" :title="t('ai.chat.newSession')" @click.stop="resetMessages">
              <Plus class="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" class="h-7 w-7" @click.stop="panelStore.close()">
              <X class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <!-- ============ Config Panel (slide-over) ============ -->
        <Transition name="overlay-fade">
          <div v-if="configVisible" class="absolute inset-0 z-10 bg-black/30" @click.stop="configVisible = false" />
        </Transition>
        <Transition name="config-slide">
          <div v-if="configVisible" class="absolute top-0 right-0 bottom-0 z-20 flex flex-col bg-card shadow-xl" style="width: 60%;">
            <div class="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b shrink-0 bg-card">
              <Button variant="ghost" size="icon" class="h-7 w-7" @click.stop="configVisible = false">
                <ArrowLeft class="w-4 h-4" />
              </Button>
              <span class="text-sm font-medium">{{ t('ai.chat.configParams') }}</span>
            </div>
            <AIConfig class="flex-1 overflow-y-auto px-4 pt-2" @saved="handleConfigSaved" />
          </div>
        </Transition>

        <!-- ============ Chat Area ============ -->
        <div class="flex flex-col flex-1 min-h-0">
          <!-- Quick Commands -->
          <div v-if="quickCommands.length > 0" class="flex gap-1.5 px-3 py-2 border-b overflow-x-auto shrink-0">
            <Button
              v-for="cmd in quickCommands"
              :key="cmd.id"
              variant="outline"
              size="sm"
              class="h-6 text-xs shrink-0"
              @click.stop="applyQuickCommand(cmd)"
            >
              {{ cmd.label }}
            </Button>
          </div>

          <!-- Messages -->
          <div
            ref="chatContainerRef"
            class="ai-chat-messages flex-1 overflow-y-auto px-3 py-3 space-y-3"
          >
            <div
              v-for="(msg, index) in messages"
              :key="msg.id"
              class="flex"
              :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-[90%] rounded-lg px-3 py-2 text-sm leading-relaxed"
                :class="msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'"
              >
                <details v-if="msg.reasoning" class="mb-2 text-xs text-muted-foreground">
                  <summary class="cursor-pointer hover:underline">
                    {{ t('ai.chat.reasoning') || '思考过程' }}
                  </summary>
                  <pre class="mt-1 whitespace-pre-wrap">{{ msg.reasoning }}</pre>
                </details>

                <div class="whitespace-pre-wrap break-words">
                  {{ msg.content }}
                </div>

                <div v-if="msg.role === 'assistant' && msg.done" class="flex gap-1 mt-2 pt-1 border-t border-border/50">
                  <Button variant="ghost" size="icon" class="h-6 w-6" @click.stop="copyToClipboard(msg.content, index)">
                    <Check v-if="copiedIndex === index" class="w-3 h-3 text-green-500" />
                    <Copy v-else class="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" class="h-6 w-6" :title="t('ai.chat.insertDoc')" @click.stop="insertToDocument(msg.content, index)">
                    <Check v-if="insertedIndex === index" class="w-3 h-3 text-green-500" />
                    <Pin v-else class="w-3 h-3" />
                  </Button>
                  <Button
                    v-if="editorStore.getSelection()"
                    variant="ghost"
                    size="icon"
                    class="h-6 w-6"
                    :title="t('ai.chat.replaceSelection') || '替换选中'"
                    @click.stop="replaceSelection(msg.content, index)"
                  >
                    <RefreshCcw class="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" class="h-6 w-6" :title="t('ai.chat.regenerate')" @click.stop="regenerateLast">
                    <RefreshCcw class="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- ============ Input Area ============ -->
          <div class="border-t p-3 shrink-0">
            <div v-if="panelStore.selectedText" class="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span class="truncate max-w-[200px] bg-muted px-1.5 py-0.5 rounded">
                {{ panelStore.selectedText.substring(0, 60) }}{{ panelStore.selectedText.length > 60 ? '...' : '' }}
              </span>
              <Button variant="ghost" size="icon" class="h-5 w-5" @click.stop="panelStore.selectedText = ''">
                <X class="w-3 h-3" />
              </Button>
            </div>

            <div class="flex gap-2">
              <Textarea
                v-model="input"
                :placeholder="t('ai.chat.inputPlaceholder')"
                class="flex-1 min-h-[36px] max-h-[120px] resize-none text-sm"
                :disabled="loading"
                @keydown="handleKeydown"
              />
              <div class="flex flex-col gap-1">
                <Button
                  size="icon"
                  class="h-8 w-8"
                  :disabled="!input.trim() || loading"
                  @click.stop="sendMessage"
                >
                  <Send class="w-3.5 h-3.5" />
                </Button>
                <Button
                  v-if="loading"
                  variant="destructive"
                  size="icon"
                  class="h-8 w-8"
                  @click.stop="abortFetch"
                >
                  <X class="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div class="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <label class="flex items-center gap-1 cursor-pointer">
                <input v-model="isQuoteAllContent" type="checkbox" class="rounded">
                {{ t('ai.chat.quoteFullText') }}
              </label>
              <Button variant="ghost" size="sm" class="h-5 text-xs px-1.5" @click.stop="panelStore.resetPosition()">
                {{ t('ai.chat.resetPosition') || '重置位置' }}
              </Button>
            </div>
          </div>
        </div>

        <!-- ============ Resize Handle ============ -->
        <div
          class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          style="z-index: 10;"
          @mousedown="onResizeStart"
        >
          <svg class="w-3 h-3 absolute bottom-0.5 right-0.5 text-muted-foreground/40" viewBox="0 0 16 16">
            <path d="M14 16L16 14M10 16L16 10M6 16L16 6" stroke="currentColor" stroke-width="1.5" fill="none" />
          </svg>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
@reference 'tailwindcss';

.ai-floating-panel {
  --panel-bg: hsl(var(--card));
  --panel-border: hsl(var(--border));
  background: var(--panel-bg);
  border-color: var(--panel-border);
}

.ai-panel-header {
  background: hsl(var(--card));
  border-color: hsl(var(--border));
}

.ai-chat-messages pre {
  overflow-x: auto;
}

.ai-chat-messages :deep(pre) {
  background: hsl(var(--muted));
  border-radius: 0.375rem;
  padding: 0.5rem;
  font-size: 0.75rem;
  overflow-x: auto;
}

.ai-chat-messages :deep(code) {
  font-size: 0.75rem;
}

.ai-panel-enter-active,
.ai-panel-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.ai-panel-enter-from,
.ai-panel-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

.ai-chat-messages::-webkit-scrollbar {
  width: 5px;
}
.ai-chat-messages::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: hsl(var(--muted-foreground) / 0.2);
}
/* Config slide-over */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.config-slide-enter-active,
.config-slide-leave-active {
  transition: transform 0.2s ease;
}
.config-slide-enter-from {
  transform: translateX(100%);
}
.config-slide-leave-to {
  transform: translateX(100%);
}

.ai-chat-messages::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.4);
}
</style>
