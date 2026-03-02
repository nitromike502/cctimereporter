<template>
  <div class="timeline-page">
    <!-- Toolbar: date navigation, datepicker, import -->
    <TimelineToolbar
      :date="selectedDate"
      :import-running="importRunning"
      :threshold="idleThreshold"
      @navigate="navigateToDate"
      @import="triggerImport"
      @update:threshold="setIdleThreshold"
    />

    <!-- Error banner -->
    <div v-if="error" class="timeline-error">
      <span>Error: {{ error }}</span>
      <AppButton variant="ghost" size="sm" @click="fetchTimeline">Retry</AppButton>
    </div>

    <!-- Loading state -->
    <div v-else-if="loading" class="timeline-loading">
      Loading timeline&hellip;
    </div>

    <!-- Empty state -->
    <div v-else-if="timelineData && timelineData.projects.length === 0" class="timeline-empty">
      <p>No sessions found for <strong>{{ selectedDate }}</strong>.</p>
      <AppButton variant="primary" :loading="importRunning" @click="triggerImport">
        Import Sessions
      </AppButton>
    </div>

    <!-- Main content -->
    <div v-else-if="timelineData" class="timeline-content">
      <!-- Session detail panel: always visible, populated on bar click -->
      <SessionDetailPanel
        :session="selectedSession"
        :project-name="selectedProjectName"
      />

      <!-- Project filter bar -->
      <div class="filter-bar" v-if="colorizedProjects.length > 1">
        <span class="filter-label">Projects:</span>
        <AppCheckbox
          v-for="p in colorizedProjects"
          :key="p.projectId"
          :model-value="!hiddenProjects.has(p.projectId)"
          :label="p.displayName"
          @update:model-value="toggleProject(p.projectId)"
        />
      </div>

      <!-- Legend -->
      <GanttLegend
        v-if="legendItems.length > 0"
        :projects="legendItems"
      />

      <!-- Gantt chart -->
      <GanttChart
        :projects="visibleProjects"
        :date="selectedDate"
        :selected-session-id="selectedSession?.sessionId"
        @select="onSelectSession"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TimelineToolbar from '../components/TimelineToolbar.vue'
import GanttChart from '../components/GanttChart.vue'
import GanttLegend from '../components/GanttLegend.vue'
import SessionDetailPanel from '../components/SessionDetailPanel.vue'
import AppButton from '../components/AppButton.vue'
import AppCheckbox from '../components/AppCheckbox.vue'

// --- Router ---

const route = useRoute()
const router = useRouter()

// --- State ---

const timelineData = ref(null)
const loading = ref(false)
const error = ref(null)
const importRunning = ref(false)
// Set of hidden projectIds. Persists across date changes. All visible by default.
const hiddenProjects = ref(new Set())
// Currently selected session (click-to-select from GanttBar)
const selectedSession = ref(null)
// Idle threshold in minutes, persisted to localStorage
const THRESHOLD_KEY = 'cctimereporter:idleThreshold'
const idleThreshold = ref(parseInt(localStorage.getItem(THRESHOLD_KEY), 10) || 10)

function setIdleThreshold(val) {
  idleThreshold.value = val
  localStorage.setItem(THRESHOLD_KEY, String(val))
  fetchTimeline()
}

// --- Date management (URL-synced) ---

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const selectedDate = computed(() => route.query.date ?? todayStr())

function navigateToDate(dateStr) {
  router.push({ path: '/timeline', query: { date: dateStr } })
}

// --- Data fetching ---

async function fetchTimeline() {
  loading.value = true
  error.value = null
  try {
    const res = await fetch(`/api/timeline?date=${selectedDate.value}&threshold=${idleThreshold.value}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    timelineData.value = data
    // Re-sync selected session with fresh data (e.g. after threshold change)
    if (selectedSession.value) {
      const id = selectedSession.value.sessionId
      const fresh = data.projects
        ?.flatMap(p => p.sessions)
        .find(s => s.sessionId === id)
      selectedSession.value = fresh ?? null
    }
    // No visibility init needed — all projects visible by default (not in hiddenProjects set)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// --- Session selection ---

/**
 * Handles clicking a session bar. Toggles selection: clicking the same bar
 * again deselects it; clicking a different bar selects it.
 */
function onSelectSession(session) {
  if (selectedSession.value?.sessionId === session.sessionId) {
    selectedSession.value = null
  } else {
    selectedSession.value = session
  }
}

/**
 * Finds the display name of the project that owns the currently selected session.
 */
const selectedProjectName = computed(() => {
  if (!selectedSession.value || !colorizedProjects.value.length) return ''
  const project = colorizedProjects.value.find(p =>
    p.sessions.some(s => s.sessionId === selectedSession.value.sessionId)
  )
  return project?.displayName ?? ''
})

// --- Project visibility ---

function toggleProject(projectId) {
  const next = new Set(hiddenProjects.value)
  if (next.has(projectId)) {
    next.delete(projectId)
  } else {
    next.add(projectId)
  }
  hiddenProjects.value = next
}

// --- Project color assignment (djb2 hash → palette) ---

const COLOR_PALETTE = [
  '#4e9af1', '#f4a523', '#2ebd6b', '#e05c5c', '#a87fe0',
  '#00c4bc', '#f06292', '#8bc34a', '#ff8f00', '#78909c',
]

function projectColor(projectPath) {
  let hash = 5381
  for (const char of projectPath) hash = (hash * 33) ^ char.charCodeAt(0)
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length]
}

// --- Computed: colorized + filtered projects ---

const colorizedProjects = computed(() => {
  if (!timelineData.value?.projects) return []
  return timelineData.value.projects.map(p => ({
    ...p,
    color: projectColor(p.projectPath),
  }))
})

const visibleProjects = computed(() =>
  colorizedProjects.value.filter(
    p => !hiddenProjects.value.has(p.projectId)
  )
)

const legendItems = computed(() =>
  colorizedProjects.value.map(p => ({ displayName: p.displayName, color: p.color }))
)

// --- Import ---

async function triggerImport() {
  if (importRunning.value) return
  importRunning.value = true
  try {
    const res = await fetch('/api/import', { method: 'POST' })
    if (res.status === 409) return // Import already running on server — ignore
    if (!res.ok) throw new Error('Import failed')
    // Auto-refresh timeline after successful import
    await fetchTimeline()
  } catch (e) {
    error.value = e.message
  } finally {
    importRunning.value = false
  }
}

// --- Lifecycle ---

onMounted(fetchTimeline)
watch(() => route.query.date, () => {
  selectedSession.value = null
  fetchTimeline()
})
</script>

<style scoped>
.timeline-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.timeline-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  flex: 1;
  overflow: auto;
}

.timeline-loading {
  padding: var(--spacing-xl) var(--spacing-lg);
  color: var(--color-muted);
  text-align: center;
  font-size: var(--font-size-base);
}

.timeline-error {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: color-mix(in srgb, var(--color-danger, #e05c5c) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-danger, #e05c5c) 30%, transparent);
  color: var(--color-danger, #e05c5c);
  font-size: var(--font-size-sm);
}

.timeline-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl);
  color: var(--color-muted);
  text-align: center;
}

.timeline-empty strong {
  color: var(--color-heading);
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-xs) var(--spacing-md);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.filter-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-muted);
  margin-right: var(--spacing-xs);
}
</style>
