<script setup lang="ts">
import { Loader2, Plus, Radio, Timer, Trash2, X } from '@lucide/vue'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useReadingStore } from '@/stores/reading'

const emit = defineEmits<{
  close: []
}>()

const store = useReadingStore()

const newUrl = ref('')
const newTitle = ref('')
const newCategory = ref('')
const discovering = ref(false)
const discoveredRoutes = ref<Array<{ name: string, path: string }>>([])

const REFRESH_OPTIONS = [
  { value: 0, label: '关闭' },
  { value: 15, label: '15分钟' },
  { value: 30, label: '30分钟' },
  { value: 60, label: '1小时' },
  { value: 120, label: '2小时' },
]

function handleAdd() {
  if (!newUrl.value.trim())
    return
  store.addSource(newUrl.value.trim(), newTitle.value.trim() || newUrl.value.trim(), newCategory.value.trim() || '未分类')
  newUrl.value = ''
  newTitle.value = ''
  newCategory.value = ''
  discoveredRoutes.value = []
}

async function handleDiscover() {
  if (!newUrl.value.trim())
    return
  discovering.value = true
  discoveredRoutes.value = []
  try {
    discoveredRoutes.value = await store.discoverRSSHubRoutes(newUrl.value.trim())
  }
  catch { /* ignore */ }
  finally {
    discovering.value = false
  }
}

function useRoute(route: { name: string, path: string }) {
  newUrl.value = route.path
  newTitle.value = route.name.split('/').pop() || route.name
  newCategory.value = 'RSSHub'
  discoveredRoutes.value = []
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="emit('close')">
    <div class="flex h-[70vh] w-[600px] max-w-[95vw] flex-col rounded-xl border bg-background shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between border-b px-4 py-3">
        <h2 class="text-base font-semibold">
          订阅管理
        </h2>
        <Button variant="ghost" size="icon" class="h-7 w-7" @click="emit('close')">
          <X class="h-4 w-4" />
        </Button>
      </div>

      <!-- 添加订阅源 -->
      <div class="border-b p-4">
        <p class="text-xs font-medium text-muted-foreground mb-2">
          添加订阅源
        </p>
        <div class="flex gap-2">
          <Input v-model="newUrl" placeholder="RSS 地址或任意网站 URL" class="h-8 text-xs flex-1" />
          <Input v-model="newTitle" placeholder="标题（可选）" class="h-8 text-xs w-28" />
          <Input v-model="newCategory" placeholder="分类" class="h-8 text-xs w-20" />
          <Button size="sm" variant="outline" class="h-8 gap-1" :disabled="!newUrl.trim() || discovering" @click="handleDiscover">
            <Loader2 v-if="discovering" class="h-3.5 w-3.5 animate-spin" />
            <Radio v-else class="h-3.5 w-3.5" />
            发现
          </Button>
          <Button size="sm" class="h-8 gap-1" @click="handleAdd">
            <Plus class="h-3.5 w-3.5" />
            添加
          </Button>
        </div>
        <p class="mt-1.5 text-[10px] text-muted-foreground">
          支持标准 RSS/Atom 格式。输入任意网站 URL 点击「发现」自动查找 RSS 源（via RSSHub）
        </p>
        <!-- RSSHub 发现结果 -->
        <div v-if="discoveredRoutes.length" class="mt-2 rounded-md border bg-muted/30 p-2">
          <p class="text-[10px] text-muted-foreground mb-1.5">
            发现 {{ discoveredRoutes.length }} 个可用路由：
          </p>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="route in discoveredRoutes.slice(0, 10)"
              :key="route.path"
              class="rounded bg-background border px-2 py-0.5 text-[10px] hover:bg-primary/10 transition-colors"
              @click="useRoute(route)"
            >
              {{ route.name }}
            </button>
          </div>
        </div>
      </div>

      <!-- 已订阅列表 -->
      <div class="flex-1 overflow-y-auto">
        <div
          v-for="src in store.sources"
          :key="src.id"
          class="flex items-center justify-between border-b px-4 py-2.5 hover:bg-muted/50 transition-colors"
        >
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium truncate">
              {{ src.title }}
            </p>
            <p class="text-[10px] text-muted-foreground truncate">
              {{ src.url }}
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0 ml-2">
            <div class="flex items-center gap-1">
              <Timer class="h-3 w-3 text-muted-foreground" />
              <select
                class="rounded border bg-background px-1.5 py-0.5 text-[10px]"
                :value="src.refreshInterval"
                @change="store.updateSourceInterval(src.id, Number(($event.target as HTMLSelectElement).value))"
              >
                <option v-for="opt in REFRESH_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <span class="rounded-full bg-muted px-2 py-0.5 text-[10px]">
              {{ src.category }}
            </span>
            <Button variant="ghost" size="icon" class="h-6 w-6 text-destructive" @click="store.removeSource(src.id)">
              <Trash2 class="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div v-if="!store.sources.length" class="flex h-32 flex-col items-center justify-center gap-2 text-xs text-muted-foreground/50">
          <span>暂无订阅源</span>
          <Button variant="outline" size="sm" class="h-7 text-xs" @click="store.resetToDefaults()">
            恢复默认订阅源
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
