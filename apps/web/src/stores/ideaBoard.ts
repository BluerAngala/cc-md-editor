import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface StickyNote {
  id: string
  content: string
  color: NoteColor
  group: string
  createdAt: number
  updatedAt: number
  pinned: boolean
}

export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'orange'

export const NOTE_COLORS: Record<NoteColor, { bg: string, border: string, text: string }> = {
  yellow: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-900' },
  blue: { bg: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-900' },
  green: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-900' },
  pink: { bg: 'bg-pink-50', border: 'border-pink-300', text: 'text-pink-900' },
  purple: { bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-900' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-900' },
}

const STORAGE_KEY = 'idea-board-notes'

export const useIdeaBoardStore = defineStore('ideaBoard', () => {
  const raw = localStorage.getItem(STORAGE_KEY)
  const notes = ref<StickyNote[]>(raw ? JSON.parse(raw) : [])
  const activeGroup = ref<string | null>(null)
  const searchQuery = ref('')
  const selectedNoteIds = ref<Set<string>>(new Set())

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes.value))
    window.dispatchEvent(new CustomEvent('md:data-changed', { detail: { scope: 'ideaBoard' } }))
  }

  // Computed
  const groups = computed(() => {
    const g = new Set(notes.value.map(n => n.group).filter(Boolean))
    return Array.from(g).sort()
  })

  const filteredNotes = computed(() => {
    let result = notes.value
    if (activeGroup.value) {
      result = result.filter(n => n.group === activeGroup.value)
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      result = result.filter(n => n.content.toLowerCase().includes(q))
    }
    return result.sort((a, b) => {
      if (a.pinned !== b.pinned)
        return a.pinned ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
  })

  const selectedNotes = computed(() =>
    notes.value.filter(n => selectedNoteIds.value.has(n.id)),
  )

  // Actions
  function addNote(content = '', color: NoteColor = 'yellow', group = ''): StickyNote {
    const now = Date.now()
    const note: StickyNote = {
      id: now.toString(36) + Math.random().toString(36).slice(2, 8),
      content,
      color,
      group,
      createdAt: now,
      updatedAt: now,
      pinned: false,
    }
    notes.value.unshift(note)
    persist()
    return note
  }

  function updateNote(id: string, updates: Partial<Pick<StickyNote, 'content' | 'color' | 'group' | 'pinned'>>) {
    const note = notes.value.find(n => n.id === id)
    if (!note)
      return
    Object.assign(note, updates, { updatedAt: Date.now() })
    persist()
  }

  function deleteNote(id: string) {
    notes.value = notes.value.filter(n => n.id !== id)
    selectedNoteIds.value.delete(id)
    persist()
  }

  function deleteSelected() {
    notes.value = notes.value.filter(n => !selectedNoteIds.value.has(n.id))
    selectedNoteIds.value.clear()
    persist()
  }

  function togglePin(id: string) {
    const note = notes.value.find(n => n.id === id)
    if (note) {
      note.pinned = !note.pinned
      note.updatedAt = Date.now()
      persist()
    }
  }

  function toggleSelect(id: string) {
    if (selectedNoteIds.value.has(id)) {
      selectedNoteIds.value.delete(id)
    }
    else {
      selectedNoteIds.value.add(id)
    }
  }

  function clearSelection() {
    selectedNoteIds.value.clear()
  }

  function selectAll() {
    filteredNotes.value.forEach(n => selectedNoteIds.value.add(n.id))
  }

  function setActiveGroup(group: string | null) {
    activeGroup.value = group
  }

  function setSearch(query: string) {
    searchQuery.value = query
  }

  function exportToMarkdown(): string {
    const grouped: Record<string, StickyNote[]> = {}
    for (const note of selectedNotes.value) {
      const g = note.group || '未分组'
      ;(grouped[g] ??= []).push(note)
    }

    const lines: string[] = []
    const groupNames = Object.keys(grouped)
    for (const group of groupNames) {
      if (groupNames.length > 1) {
        lines.push(`## ${group}`, '')
      }
      for (const note of grouped[group]) {
        lines.push(`- ${note.content}`)
      }
      lines.push('')
    }
    return lines.join('\n').trim()
  }

  function reloadFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY)
    notes.value = raw ? JSON.parse(raw) : []
  }

  return {
    notes,
    activeGroup,
    searchQuery,
    selectedNoteIds,
    groups,
    filteredNotes,
    selectedNotes,
    addNote,
    updateNote,
    deleteNote,
    deleteSelected,
    togglePin,
    toggleSelect,
    clearSelection,
    selectAll,
    setActiveGroup,
    setSearch,
    exportToMarkdown,
    reloadFromStorage,
  }
})
