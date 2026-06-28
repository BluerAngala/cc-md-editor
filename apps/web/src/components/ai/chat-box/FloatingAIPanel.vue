<script setup lang="ts">
import type { QuickCommandRuntime } from '@/stores/quickCommands'
import {
  ArrowLeft,
  Check,
  Copy,
  FileInput,
  MessageCircle,
  Plus,
  RefreshCcw,
  Send,
  Settings,
  SlidersHorizontal,
  Undo2,
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
const configTab = ref<`ai` | `presets`>(`ai`)
const editingMessageId = ref<string | null>(null)
const copiedIndex = ref<number | null>(null)
const insertedIndex = ref<number | null>(null)
const isQuoteAllContent = ref(false)
const chatContainerRef = ref<HTMLElement | null>(null)
const editingPresetId = ref<string | null>(null)
const presetFormName = ref(``)
const presetFormContent = ref(``)
const presetFormType = ref<`always` | `ondemand`>(`always`)
const showPresetForm = ref(false)

interface ContextPreset {
  id: string
  name: string
  content: string
  type: `always` | `ondemand`
  enabled: boolean
  builtin?: boolean
}

const defaultPresets: ContextPreset[] = [
  { id: `date`, name: `当前日期时间`, content: ``, type: `always`, enabled: true, builtin: true },
  { id: `editor`, name: `编辑器全文内容`, content: ``, type: `always`, enabled: false, builtin: true },
]

const presets = useStorage<ContextPreset[]>(`ai-context-presets`, defaultPresets)

// Ensure built-in presets exist
if (!presets.value.some(p => p.id === `date`)) {
  presets.value.unshift({ id: `date`, name: `当前日期时间`, content: ``, type: `always`, enabled: true, builtin: true })
}
if (!presets.value.some(p => p.id === `editor`)) {
  presets.value.splice(1, 0, { id: `editor`, name: `编辑器全文内容`, content: ``, type: `always`, enabled: false, builtin: true })
}

const alwaysPresets = computed(() => presets.value.filter(p => p.type === `always`))
const ondemandPresets = computed(() => presets.value.filter(p => p.type === `ondemand`))

function togglePreset(id: string) {
  const p = presets.value.find(x => x.id === id)
  if (p)
    p.enabled = !p.enabled
}

function insertPresetToInput(preset: ContextPreset) {
  input.value = input.value ? `${input.value}\n${preset.content}` : preset.content
  nextTick(() => {
    const textarea = chatContainerRef.value?.querySelector(`textarea`)
    textarea?.focus()
  })
}

function startEditPreset(preset: ContextPreset) {
  editingPresetId.value = preset.id
  presetFormName.value = preset.name
  presetFormContent.value = preset.content
  presetFormType.value = preset.type
}

function savePreset() {
  if (!presetFormName.value.trim())
    return
  if (editingPresetId.value) {
    const p = presets.value.find(x => x.id === editingPresetId.value)
    if (p) {
      p.name = presetFormName.value.trim()
      p.content = presetFormContent.value.trim()
      p.type = presetFormType.value
    }
  }
  else {
    presets.value.push({
      id: crypto.randomUUID(),
      name: presetFormName.value.trim(),
      content: presetFormContent.value.trim(),
      type: presetFormType.value,
      enabled: true,
    })
  }
  cancelEditPreset()
}

function deletePreset(id: string) {
  presets.value = presets.value.filter(p => p.id !== id)
}

function cancelEditPreset() {
  editingPresetId.value = null
  presetFormName.value = ``
  presetFormContent.value = ``
  presetFormType.value = `always`
}
const aiConfigRef = ref<InstanceType<typeof AIConfig> | null>(null)

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

// ── Focus input when panel opens ──
watch(() => panelStore.visible, (val) => {
  if (val) {
    nextTick(() => {
      const textarea = chatContainerRef.value?.querySelector(`textarea`)
      textarea?.focus()
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
  const contextText = panelStore.selectedText.trim()

  if (editingMessageId.value) {
    // Editing: replace original user message and remove old AI reply
    const editIdx = messages.value.findIndex(m => m.id === editingMessageId.value)
    if (editIdx !== -1) {
      messages.value[editIdx].content = userInput
      // Remove the AI reply after the edited message (if exists)
      if (editIdx + 1 < messages.value.length && messages.value[editIdx + 1].role === `assistant`) {
        messages.value.splice(editIdx + 1, 1)
      }
    }
    editingMessageId.value = null
  }
  else {
    // New message
    if (contextText) {
      messages.value.push({
        role: `system`,
        content: `以下是用户选中的参考内容：\n\n${contextText}`,
        id: uuidv4(),
      })
    }
    messages.value.push({ role: `user`, content: userInput, id: uuidv4() })
  }

  input.value = ``
  panelStore.selectedText = ``

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

  // Build preset context from enabled always-on presets
  const presetContexts: string[] = []
  for (const p of presets.value.filter(x => x.type === `always` && x.enabled)) {
    if (p.id === `date`) {
      const now = new Date()
      presetContexts.push(`当前日期时间：${now.toLocaleString(`zh-CN`, { dateStyle: `full`, timeStyle: `short` })}（星期${[`日`, `一`, `二`, `三`, `四`, `五`, `六`][now.getDay()]}）`)
    }
    else if (p.id === `editor` && editor.value) {
      const doc = editor.value.state.doc.toString()
      if (doc.trim())
        presetContexts.push(`当前编辑器内容：\n${doc}`)
    }
    else if (p.content) {
      presetContexts.push(p.content)
    }
  }

  const systemMessages = [
    { role: `system` as const, content: t(`ai.chat.systemPrompt`) },
    ...presetContexts.length ? [{ role: `system` as const, content: `补充上下文信息：\n${presetContexts.join(`\n`)}` }] : [],
    ...quoteMessages,
  ]

  const payloadMessages = [
    ...systemMessages,
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
  console.log(`[AI] Payload:`, JSON.stringify(payloadMessages.map(m => ({ role: m.role, content: (m.content || ``).substring(0, 150) })), null, 2))

  try {
    await fetchSSE(url, headers, payload, {
      onDelta(content) {
        const last = messages.value[messages.value.length - 1]
        if (last.id !== replyMessage.id)
          return
        last.content += content
        scrollToBottom()
      },
      onReasoningDelta(reasoning) {
        const last = messages.value[messages.value.length - 1]
        if (last.id !== replyMessage.id)
          return
        last.reasoning = (last.reasoning || ``) + reasoning
        scrollToBottom()
      },
      onDone() {
        const last = messages.value[messages.value.length - 1]
        if (last.id === replyMessage.id && last.role === `assistant`) {
          if (!last.content && !last.reasoning)
            last.content = `(AI 未返回内容)`
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

async function copyToClipboard(text: string, index: number) {
  copyPlain(text)
  copiedIndex.value = index
  setTimeout(() => (copiedIndex.value = null), FEEDBACK_INDICATOR_TIMEOUT_MS)
}

function recallMessage(msg: ChatMessage, index: number) {
  // Remove the AI reply after this message (if exists)
  if (index + 1 < messages.value.length && messages.value[index + 1].role === `assistant`) {
    messages.value.splice(index + 1, 1)
  }
  // Remove the user message
  messages.value.splice(index, 1)
  // Put content back in input
  input.value = msg.content
  editingMessageId.value = null
  nextTick(() => {
    const textarea = chatContainerRef.value?.querySelector(`textarea`)
    textarea?.focus()
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length)
  })
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

function resetToAnchor() {
  // Find the sidebar AI icon and preview area
  const icon = document.querySelector('.editor-ai-toolbar .utools-sidebar-edge')
  const preview = document.getElementById('output')
  if (icon) {
    const iconRect = icon.getBoundingClientRect()
    const top = preview ? preview.getBoundingClientRect().top : iconRect.top
    panelStore.setPosition(Math.max(20, iconRect.right + 8), Math.max(20, top))
  }
  else {
    panelStore.resetPosition()
  }
}
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
          @dblclick="resetToAnchor()"
        >
          <div class="flex items-center gap-1 text-sm font-medium">
            <MessageCircle class="w-4 h-4" />
            <span>{{ t('ai.chat.title') }}</span>
            <Button variant="ghost" size="sm" class="h-6 gap-0.5 text-xs ml-1" @click.stop="configVisible = true; configTab = 'ai'">
              <Settings class="w-3 h-3" />
              <span>{{ t('ai.chat.configTitle') || 'AI 配置' }}</span>
            </Button>
            <Button variant="ghost" size="sm" class="h-6 gap-0.5 text-xs" @click.stop="configVisible = true; configTab = 'presets'">
              <SlidersHorizontal class="w-3 h-3" />
              <span>{{ t('ai.chat.advancedConfig') || '高级配置' }}</span>
            </Button>
            <Button variant="ghost" size="sm" class="h-6 gap-0.5 text-xs" @click.stop="resetMessages">
              <Plus class="w-3 h-3" />
              <span>{{ t('ai.chat.newSession') }}</span>
            </Button>
          </div>
          <Button variant="destructive" size="icon" class="h-6 w-6 rounded-full" @click.stop="panelStore.close()">
            <X class="w-3.5 h-3.5" />
          </Button>
        </div>

        <!-- ============ Config Panel (slide-over) ============ -->
        <Transition name="overlay-fade">
          <!-- eslint-disable vue/html-self-closing -->
          <div v-if="configVisible" class="absolute inset-0 z-10 bg-black/30" @click.stop="configVisible = false"></div>
        </Transition>
        <Transition name="config-slide">
          <div v-if="configVisible" class="absolute top-0 right-0 bottom-0 z-20 flex flex-col bg-card shadow-xl" style="width: 60%;">
            <!-- Header with tabs -->
            <div class="sticky top-0 z-10 flex items-center gap-1 px-2 py-1.5 border-b shrink-0 bg-card">
              <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" @click.stop="configVisible = false">
                <ArrowLeft class="w-4 h-4" />
              </Button>
              <button
                class="px-2.5 py-1 text-xs rounded-md transition-colors"
                :class="configTab === 'ai' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'"
                @click.stop="configTab = 'ai'"
              >
                {{ t('ai.chat.configTitle') || 'AI 配置' }}
              </button>
              <button
                class="px-2.5 py-1 text-xs rounded-md transition-colors"
                :class="configTab === 'presets' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'"
                @click.stop="configTab = 'presets'"
              >
                {{ t('ai.chat.advancedConfig') || '高级配置' }}
              </button>
            </div>

            <!-- AI Config tab -->
            <template v-if="configTab === 'ai'">
              <AIConfig ref="aiConfigRef" class="flex-1 overflow-y-auto px-4 pt-2" @saved="handleConfigSaved" />
              <div class="shrink-0 border-t px-4 py-3 flex flex-col gap-2 sm:flex-row">
                <Button size="sm" @click="aiConfigRef?.saveConfig()">
                  {{ t('common.save') }}
                </Button>
                <Button size="sm" variant="ghost" @click="aiConfigRef?.clearConfig()">
                  {{ t('common.clear') }}
                </Button>
                <Button size="sm" variant="outline" :disabled="aiConfigRef?.loading" @click="aiConfigRef?.testConnection()">
                  {{ aiConfigRef?.loading ? t('common.testing') : t('common.testConnection') }}
                </Button>
              </div>
              <div v-if="aiConfigRef?.testResult" class="shrink-0 px-4 pb-2 text-xs text-gray-500">
                {{ aiConfigRef.testResult }}
              </div>
            </template>

            <!-- Presets tab -->
            <div v-else class="flex-1 overflow-y-auto px-3 py-2 space-y-3 text-xs">
              <!-- Context presets section -->
              <div class="space-y-1.5">
                <div class="font-medium text-muted-foreground flex items-center gap-1">
                  <span>🔄</span>
                  <span>{{ t('ai.chat.alwaysContext') || '自动上下文' }}</span>
                  <span class="text-muted-foreground/50 ml-1">{{ t('ai.chat.alwaysHint') || '(每次请求附带)' }}</span>
                </div>
                <div v-for="p in alwaysPresets" :key="p.id" class="flex items-center gap-1.5 group">
                  <input :checked="p.enabled" type="checkbox" class="rounded w-3.5 h-3.5" @change="togglePreset(p.id)" />
                  <span class="flex-1 truncate" :class="p.enabled ? '' : 'text-muted-foreground/50'">{{ p.name }}</span>
                  <Button v-if="!p.builtin" variant="ghost" size="icon" class="h-5 w-5 opacity-0 group-hover:opacity-100" @click.stop="startEditPreset(p)">
                    <Pencil class="w-2.5 h-2.5" />
                  </Button>
                  <Button v-if="!p.builtin" variant="ghost" size="icon" class="h-5 w-5 opacity-0 group-hover:opacity-100" @click.stop="deletePreset(p.id)">
                    <X class="w-2.5 h-2.5" />
                  </Button>
                </div>
              </div>

              <!-- On-demand presets -->
              <div class="space-y-1.5">
                <div class="font-medium text-muted-foreground flex items-center gap-1">
                  <span>📌</span>
                  <span>{{ t('ai.chat.ondemandContext') || '手动引用' }}</span>
                  <span class="text-muted-foreground/50 ml-1">{{ t('ai.chat.ondemandHint') || '(点击填入输入框)' }}</span>
                </div>
                <div v-if="ondemandPresets.length === 0" class="text-muted-foreground/40 pl-5">
                  {{ t('ai.chat.noOndemandPresets') || '暂无' }}
                </div>
                <div v-for="p in ondemandPresets" :key="p.id" class="flex items-center gap-1.5 group pl-5">
                  <span class="flex-1 truncate cursor-pointer hover:underline" @click.stop="insertPresetToInput(p)">{{ p.name }}</span>
                  <Button variant="ghost" size="icon" class="h-5 w-5 opacity-0 group-hover:opacity-100" @click.stop="startEditPreset(p)">
                    <Pencil class="w-2.5 h-2.5" />
                  </Button>
                  <Button variant="ghost" size="icon" class="h-5 w-5 opacity-0 group-hover:opacity-100" @click.stop="deletePreset(p.id)">
                    <X class="w-2.5 h-2.5" />
                  </Button>
                </div>
              </div>

              <!-- Divider -->
              <div class="border-t pt-2">
                <!-- Inline add form -->
                <div class="flex items-center gap-1.5">
                  <input
                    v-model="presetFormName"
                    :placeholder="t('ai.chat.addPresetPlaceholder') || '+ 添加预设上下文...'"
                    class="flex-1 text-xs border rounded px-2 py-1 bg-background"
                    @keydown.enter="showPresetForm = !showPresetForm"
                  />
                  <select v-model="presetFormType" class="text-xs border rounded px-1 py-1 bg-background">
                    <option value="always">
                      {{ t('ai.chat.alwaysShort') || '自动' }}
                    </option>
                    <option value="ondemand">
                      {{ t('ai.chat.ondemandShort') || '手动' }}
                    </option>
                  </select>
                </div>
                <!-- Expandable content area -->
                <div v-if="showPresetForm || editingPresetId" class="mt-1.5 space-y-1.5">
                  <textarea
                    v-model="presetFormContent"
                    :placeholder="t('ai.chat.presetContentPlaceholder') || '上下文内容...'"
                    rows="2"
                    class="w-full text-xs border rounded px-2 py-1 bg-background resize-none"
                  />
                  <div class="flex items-center gap-1.5">
                    <Button size="sm" class="h-6 text-xs px-2" @click.stop="savePreset">
                      {{ editingPresetId ? (t('common.save') || '保存') : (t('ai.chat.addPreset') || '添加') }}
                    </Button>
                    <Button v-if="editingPresetId" variant="ghost" size="sm" class="h-6 text-xs px-2" @click.stop="cancelEditPreset">
                      {{ t('common.cancel') || '取消' }}
                    </Button>
                    <span v-if="!editingPresetId" class="text-muted-foreground/40 text-[10px] ml-auto">
                      {{ t('ai.chat.addPresetHint') || '输入名称后回车展开' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- ============ Chat Area ============ -->
        <div class="flex flex-col flex-1 min-h-0">
          <!-- Quick Commands + Presets -->
          <div class="flex gap-1.5 px-3 py-2 border-b overflow-x-auto shrink-0 items-center">
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
                    {{ t('ai.chat.reasoning') }}
                  </summary>
                  <pre class="mt-1 whitespace-pre-wrap">{{ msg.reasoning }}</pre>
                </details>

                <div class="whitespace-pre-wrap break-words">
                  {{ msg.content }}
                </div>

                <!-- User message actions -->
                <div v-if="msg.role === 'user'" class="flex gap-1 mt-2 pt-1 border-t border-border/50">
                  <Button variant="ghost" size="icon" class="h-6 w-6" @click.stop="copyToClipboard(msg.content, index)">
                    <Check v-if="copiedIndex === index" class="w-3 h-3 text-green-500" />
                    <Copy v-else class="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" class="h-6 w-6" :title="t('ai.chat.recallMessage')" @click.stop="recallMessage(msg, index)">
                    <Undo2 class="w-3 h-3" />
                  </Button>
                </div>

                <!-- Assistant message actions -->
                <div v-if="msg.role === 'assistant' && msg.done" class="flex gap-1 mt-2 pt-1 border-t border-border/50">
                  <Button variant="ghost" size="icon" class="h-6 w-6" @click.stop="copyToClipboard(msg.content, index)">
                    <Check v-if="copiedIndex === index" class="w-3 h-3 text-green-500" />
                    <Copy v-else class="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" class="h-6 w-6" :title="t('ai.chat.insertDoc')" @click.stop="insertToDocument(msg.content, index)">
                    <Check v-if="insertedIndex === index" class="w-3 h-3 text-green-500" />
                    <FileInput v-else class="w-3 h-3" />
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
            <div v-if="panelStore.selectedText" class="mb-2 flex items-center gap-2 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 px-2 py-1.5 rounded-md border border-blue-200 dark:border-blue-800">
              <span class="text-blue-600 dark:text-blue-400 font-medium">📎</span>
              <span class="truncate flex-1">
                {{ panelStore.selectedText.substring(0, 80) }}{{ panelStore.selectedText.length > 80 ? '...' : '' }}
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
              <Button variant="ghost" size="sm" class="h-5 text-xs px-1.5" @click.stop="resetToAnchor()">
                {{ t('ai.chat.resetPosition') }}
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
