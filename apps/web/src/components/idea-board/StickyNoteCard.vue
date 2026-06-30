<script setup lang="ts">
import type { NoteColor, StickyNote } from '@/stores/ideaBoard'
import { nextTick, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NOTE_COLORS } from '@/stores/ideaBoard'

const props = defineProps<{
  note: StickyNote
  selected: boolean
}>()

const emit = defineEmits<{
  update: [content: string]
  delete: []
  togglePin: []
  toggleSelect: []
  colorChange: [color: NoteColor]
  groupChange: [group: string]
}>()

const isEditing = ref(false)
const editContent = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function startEdit() {
  editContent.value = props.note.content
  isEditing.value = true
  nextTick(() => textareaRef.value?.focus())
}

function finishEdit() {
  if (editContent.value.trim() !== props.note.content) {
    emit('update', editContent.value.trim())
  }
  isEditing.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    finishEdit()
  }
  if (e.key === 'Escape') {
    isEditing.value = false
  }
}

const colors = Object.keys(NOTE_COLORS) as NoteColor[]
const showColorPicker = ref(false)

// Tailwind-safe dot color classes
const DOT_COLORS: Record<NoteColor, string> = {
  yellow: 'bg-amber-400',
  blue: 'bg-sky-400',
  green: 'bg-emerald-400',
  pink: 'bg-pink-400',
  purple: 'bg-violet-400',
  orange: 'bg-orange-400',
}
</script>

<template>
  <div
    class="group relative flex flex-col rounded-lg border-2 p-3 shadow-sm transition-shadow hover:shadow-md"
    :class="[NOTE_COLORS[note.color].bg, NOTE_COLORS[note.color].border]"
  >
    <!-- Top bar: checkbox + pin + color + delete -->
    <div class="mb-2 flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <Checkbox
          :checked="selected"
          @update:checked="emit('toggleSelect')"
        />
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              :class="note.pinned ? 'text-amber-500' : 'text-muted-foreground opacity-0 group-hover:opacity-100'"
              @click="emit('togglePin')"
            >
              <span class="i-lucide-pin text-xs" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ note.pinned ? '取消置顶' : '置顶' }}</TooltipContent>
        </Tooltip>
      </div>

      <div class="flex items-center gap-1">
        <!-- Color picker -->
        <div class="relative">
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 opacity-0 group-hover:opacity-100"
            @click="showColorPicker = !showColorPicker"
          >
            <span
              class="block h-3 w-3 rounded-full border border-gray-300"
              :class="DOT_COLORS[note.color]"
            />
          </Button>
          <div
            v-if="showColorPicker"
            class="absolute right-0 top-7 z-10 flex gap-1 rounded-lg border bg-white p-1.5 shadow-lg"
          >
            <button
              v-for="c in colors"
              :key="c"
              class="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
              :class="[
                DOT_COLORS[c],
                c === note.color ? 'border-gray-800' : 'border-transparent',
              ]"
              @click="emit('colorChange', c); showColorPicker = false"
            />
          </div>
        </div>

        <!-- Delete -->
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100"
              @click="emit('delete')"
            >
              <span class="i-lucide-trash-2 text-xs" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>删除</TooltipContent>
        </Tooltip>
      </div>
    </div>

    <!-- Content -->
    <div class="min-h-[60px] flex-1">
      <Textarea
        v-if="isEditing"
        ref="textareaRef"
        v-model="editContent"
        class="min-h-[60px] resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        :class="NOTE_COLORS[note.color].text"
        placeholder="写下你的想法..."
        @blur="finishEdit"
        @keydown="handleKeydown"
      />
      <p
        v-else
        class="cursor-text whitespace-pre-wrap text-sm leading-relaxed"
        :class="[note.content ? NOTE_COLORS[note.color].text : 'text-muted-foreground italic']"
        @click="startEdit"
      >
        {{ note.content || '点击编辑...' }}
      </p>
    </div>

    <!-- Group tag -->
    <div v-if="note.group" class="mt-2">
      <span
        class="inline-block rounded-full bg-black/5 px-2 py-0.5 text-xs"
        :class="NOTE_COLORS[note.color].text"
      >
        {{ note.group }}
      </span>
    </div>
  </div>
</template>
