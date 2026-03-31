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

    <!-- Import progress overlay -->
    <div v-if="importRunning" class="import-progress-overlay">
      <AppProgressBar
        :value="importProgress.processed"
        :max="importProgress.total || 1"
        :indeterminate="importProgress.phase === 'discovering' || importProgress.phase === 'discovered' || importProgress.total === 0"
      />
      <span class="import-progress-text">
        <template v-if="importProgress.phase === 'discovering'">
          Discovering sessions...
          <template v-if="importProgress.total > 0">
            ({{ importProgress.discovered }} of {{ importProgress.total }} projects)
          </template>
        </template>
        <template v-else-if="importProgress.phase === 'discovered'">
          Found {{ importProgress.totalFiles }} sessions to import
        </template>
        <template v-else-if="importProgress.total > 0">
          {{ importProgress.processed }} / {{ importProgress.total }}
          <span v-if="importProgress.skipped" class="import-skipped-text">({{ importProgress.skipped }} skipped)</span>
        </template>
      </span>
    </div>

    <!-- Re-import notification banner -->
    <div v-if="schemaMigrated && !importRunning && !migrationDismissed" class="reimport-banner">
      <span>CC Time Reporter was updated. A full re-import is recommended to take advantage of new features.</span>
      <AppButton variant="primary" size="sm" @click="triggerImport({ full: true })">
        Re-import Now
      </AppButton>
      <AppButton variant="ghost" size="sm" @click="dismissMigrationBanner">
        Dismiss
      </AppButton>
    </div>

    <!-- Error banner -->
    <div v-if="error" class="timeline-error">
      <span>Error: {{ error }}</span>
      <AppButton variant="ghost" size="sm" @click="fetchTimeline">Retry</AppButton>
    </div>

    <!-- Loading state -->
    <div v-else-if="loading" class="timeline-loading">
      Loading timeline&hellip;
    </div>

    <!-- First-time welcome: no sessions ever imported -->
    <div v-else-if="timelineData && timelineData.totalSessions === 0" class="timeline-welcome">
      <h2>Welcome to CC Time Reporter</h2>
      <p>This tool scans your Claude Code session transcripts and shows them as a visual timeline grouped by project.</p>
      <p class="timeline-welcome-hint">Your first import covers the last 30 days of sessions. It may take a moment.</p>
      <AppButton variant="primary" size="lg" :loading="importRunning" @click="triggerImport({ full: true })">
        Import Sessions
      </AppButton>
    </div>

    <!-- Empty date: sessions exist but none on this date -->
    <div v-else-if="timelineData && timelineData.projects.length === 0" class="timeline-empty">
      <p>No sessions found for <strong>{{ selectedDate }}</strong>.</p>
      <p class="timeline-empty-hint">Try navigating to a different date.</p>
    </div>

    <!-- Main content -->
    <div v-else-if="timelineData" class="timeline-content">
      <!-- Session detail panel: always visible, populated on bar click -->
      <SessionDetailPanel
        :session="selectedSession || selectedForkParentSession"
        :fork="selectedFork"
        :project-name="selectedProjectName"
        @show-messages="onShowMessages"
        @show-messages-fork="onShowMessagesFork"
        @edit="editModalOpen = true"
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
        :selected-fork-branch-id="selectedFork?.forkBranchId"
        :zoom-level="zoomLevel"
        :show-forks="showForks"
        @select="onSelectSession"
        @select-fork="onSelectFork"
        @update:zoom-level="val => zoomLevel = val"
        @update:show-forks="onToggleShowForks"
      />

      <!-- Day summary: total time + per-project/ticket/branch breakdowns -->
      <DaySummary :projects="timelineData.projects" />
    </div>

    <!-- Session messages modal -->
    <SessionMessagesModal
      v-model:open="messagesModalOpen"
      :session-id="messagesModalSessionId"
      :fork-branch-id="messagesModalForkBranchId"
    />

    <!-- Session edit modal -->
    <SessionEditModal
      v-model:open="editModalOpen"
      :session="selectedSession"
      @saved="onSessionEdited"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TimelineToolbar from '../components/TimelineToolbar.vue'
import GanttChart from '../components/GanttChart.vue'
import GanttLegend from '../components/GanttLegend.vue'
import SessionDetailPanel from '../components/SessionDetailPanel.vue'
import AppButton from '../components/AppButton.vue'
import AppCheckbox from '../components/AppCheckbox.vue'
import DaySummary from '../components/DaySummary.vue'
import SessionMessagesModal from '../components/SessionMessagesModal.vue'
import SessionEditModal from '../components/SessionEditModal.vue'
import AppProgressBar from '../components/AppProgressBar.vue'
import { driver } from 'driver.js'

// --- Router ---

const route = useRoute()
const router = useRouter()

// --- State ---

const timelineData = ref(null)
const loading = ref(false)
const error = ref(null)
const importRunning = ref(false)
const importProgress = ref({ phase: null, processed: 0, total: 0, skipped: 0, discovered: 0 })
const importEventSource = ref(null)
const schemaMigrated = ref(false)
const MIGRATION_DISMISSED_KEY = 'cctimereporter:migrationDismissed'
const migrationDismissed = ref(false)
const schemaVersion = ref(null)
// Set of hidden projectIds. Persists across date changes. All visible by default.
const hiddenProjects = ref(new Set())
// Currently selected session (click-to-select from GanttBar)
const selectedSession = ref(null)
const messagesModalOpen = ref(false)
const messagesModalSessionId = ref('')
const messagesModalForkBranchId = ref('')
const editModalOpen = ref(false)
// Idle threshold in minutes, persisted to localStorage
const THRESHOLD_KEY = 'cctimereporter:idleThreshold'
const idleThreshold = ref(parseInt(localStorage.getItem(THRESHOLD_KEY), 10) || 10)
// Zoom level for the Gantt chart (1x = full day, 4x = max zoom)
const zoomLevel = ref(1)
// Show/hide fork sub-rows, persisted to localStorage
const SHOW_FORKS_KEY = 'cctimereporter:showForks'
const showForks = ref(localStorage.getItem(SHOW_FORKS_KEY) !== 'false')
// Currently selected fork segment (mutually exclusive with selectedSession)
const selectedFork = ref(null)
// Parent session of the currently selected fork
const selectedForkParentSession = ref(null)

function setIdleThreshold(val) {
  idleThreshold.value = val
  localStorage.setItem(THRESHOLD_KEY, String(val))
  fetchTimeline()
}

function onToggleShowForks(val) {
  showForks.value = val
  localStorage.setItem(SHOW_FORKS_KEY, String(val))
}

// --- Guided tour ---

const TOUR_KEY = 'cctimereporter:tourSeen'

function startTourIfNew() {
  const steps = [
    {
      element: '.datepicker-wrapper',
      popover: {
        title: 'Navigate by Date',
        description: 'Pick any date to view your Claude Code sessions for that day.',
        side: 'bottom',
      },
    },
    {
      element: '.import-group',
      popover: {
        title: 'Import Sessions',
        description: 'Click Import to scan your Claude Code transcripts and load them into the timeline.',
        side: 'left',
      },
    },
    {
      element: '.gantt-chart',
      popover: {
        title: 'Session Timeline',
        description: 'Each bar represents a coding session. Sessions are grouped by project. Click any bar to see details.',
        side: 'top',
      },
    },
    {
      element: '.session-detail-panel',
      popover: {
        title: 'Session Details',
        description: 'When you click a session bar, its ticket, branch, working time, and first prompt appear here.',
        side: 'top',
      },
    },
  ]

  if (colorizedProjects.value.length > 1) {
    steps.push({
      element: '.filter-bar',
      popover: {
        title: 'Filter by Project',
        description: 'Use these checkboxes to show or hide individual projects in the timeline.',
        side: 'bottom',
      },
    })
  }

  steps.push({
    element: '.day-summary',
    popover: {
      title: 'Day Totals',
      description: 'See total working time for the day, broken down by project, ticket, and branch.',
      side: 'top',
    },
  })

  const tourDriver = driver({
    showProgress: true,
    onDestroyed: () => {
      localStorage.setItem(TOUR_KEY, 'true')
    },
    steps,
  })
  tourDriver.drive()
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
    schemaMigrated.value = data.schemaMigrated || false
    schemaVersion.value = data.schemaVersion ?? null
    // Check if user already dismissed the banner for this exact schema version
    if (schemaMigrated.value && schemaVersion.value != null) {
      const dismissed = localStorage.getItem(MIGRATION_DISMISSED_KEY)
      if (dismissed === String(schemaVersion.value)) {
        migrationDismissed.value = true
      }
    }
    // Re-sync selected session with fresh data (e.g. after threshold change)
    if (selectedSession.value) {
      const id = selectedSession.value.sessionId
      const fresh = data.projects
        ?.flatMap(p => p.sessions)
        .find(s => s.sessionId === id)
      selectedSession.value = fresh ?? null
    }
    // No visibility init needed — all projects visible by default (not in hiddenProjects set)
    // Start guided tour on first visit when sessions are visible
    if (data.projects.length > 0 && !localStorage.getItem(TOUR_KEY)) {
      await nextTick()
      startTourIfNew()
    }
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
 * Clears any selected fork (session and fork selections are mutually exclusive).
 */
function onSelectSession(session) {
  if (selectedSession.value?.sessionId === session.sessionId) {
    selectedSession.value = null
  } else {
    selectedSession.value = session
    selectedFork.value = null
  }
}

/**
 * Handles clicking a fork bar. Toggles selection: clicking the same fork
 * again deselects it; clicking a different fork selects it.
 * Clears any selected session (fork and session selections are mutually exclusive).
 * Receives { fork, parentSession } from GanttSwimlane.
 */
function onSelectFork({ fork, parentSession }) {
  if (selectedFork.value?.forkBranchId === fork.forkBranchId) {
    selectedFork.value = null
    selectedForkParentSession.value = null
  } else {
    selectedFork.value = fork
    selectedForkParentSession.value = parentSession ?? null
    selectedSession.value = null
  }
}

/**
 * Opens the messages modal for the currently selected session (primary branch).
 */
function onShowMessages() {
  if (!selectedSession.value) return
  messagesModalSessionId.value = selectedSession.value.sessionId
  messagesModalForkBranchId.value = ''
  messagesModalOpen.value = true
}

/**
 * Opens the messages modal filtered to a specific fork branch.
 * The session ID comes from the currently selected fork's parent session.
 * @param {string} forkBranchId
 */
function onShowMessagesFork(forkBranchId) {
  if (!selectedForkParentSession.value) return
  messagesModalSessionId.value = selectedForkParentSession.value.sessionId
  messagesModalForkBranchId.value = forkBranchId
  messagesModalOpen.value = true
}

/**
 * Handles session edit save — optimistic UI update without full timeline refetch.
 */
function onSessionEdited({ userLabel, userTicket }) {
  if (selectedSession.value) {
    selectedSession.value = {
      ...selectedSession.value,
      userLabel,
      userTicket,
    }
    // Also update the session in timelineData so GanttBar and DaySummary reflect changes
    if (timelineData.value) {
      for (const project of timelineData.value.projects) {
        const session = project.sessions.find(s => s.sessionId === selectedSession.value.sessionId)
        if (session) {
          session.userLabel = userLabel
          session.userTicket = userTicket
          break
        }
      }
    }
  }
}

/**
 * Finds the display name of the project that owns the currently selected session or fork.
 */
const selectedProjectName = computed(() => {
  if (!colorizedProjects.value.length) return ''
  const sessionToFind = selectedSession.value ?? selectedForkParentSession.value
  if (!sessionToFind) return ''
  const project = colorizedProjects.value.find(p =>
    p.sessions.some(s => s.sessionId === sessionToFind.sessionId)
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

function dismissMigrationBanner() {
  migrationDismissed.value = true
  if (schemaVersion.value != null) {
    localStorage.setItem(MIGRATION_DISMISSED_KEY, String(schemaVersion.value))
  }
}

function triggerImport({ full = false } = {}) {
  if (importRunning.value) return
  importRunning.value = true
  importProgress.value = { phase: 'discovering', processed: 0, total: 0, skipped: 0, discovered: 0 }

  const maxAgeDays = full ? 30 : 2
  const source = new EventSource(`/api/import/progress?maxAgeDays=${maxAgeDays}`)
  importEventSource.value = source

  source.addEventListener('progress', (e) => {
    importProgress.value = JSON.parse(e.data)
  })

  source.addEventListener('complete', () => {
    source.close()
    importEventSource.value = null
    importRunning.value = false
    schemaMigrated.value = false
    // Persist dismissal so banner stays gone after page refresh
    if (schemaVersion.value != null) {
      localStorage.setItem(MIGRATION_DISMISSED_KEY, String(schemaVersion.value))
    }
    fetchTimeline()
  })

  source.addEventListener('error', () => {
    source.close()
    importEventSource.value = null
    importRunning.value = false
    error.value = 'Import failed'
  })
}

// Reset modal fork context when modal closes
watch(messagesModalOpen, (isOpen) => {
  if (!isOpen) {
    messagesModalForkBranchId.value = ''
    messagesModalSessionId.value = ''
  }
})

// --- Lifecycle ---

onMounted(fetchTimeline)
onUnmounted(() => { importEventSource.value?.close() })
watch(() => route.query.date, () => {
  selectedSession.value = null
  selectedFork.value = null
  selectedForkParentSession.value = null
  zoomLevel.value = 1
  fetchTimeline()
})
</script>

<style scoped>
.timeline-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.import-progress-overlay {
  position: fixed;
  top: var(--spacing-sm);
  left: 50%;
  transform: translateX(-50%);
  width: min(500px, 90%);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-sm) var(--spacing-md);
  box-shadow: var(--shadow-md);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.import-progress-overlay :deep(.progress-root) {
  flex: 1;
}

.import-progress-text {
  font-size: var(--font-size-xs);
  color: var(--color-muted);
  white-space: nowrap;
}

.import-skipped-text {
  opacity: 0.7;
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

.reimport-banner {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: color-mix(in srgb, var(--color-accent, #4e9af1) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-accent, #4e9af1) 30%, transparent);
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

.timeline-empty-hint {
  font-size: var(--font-size-sm);
  opacity: 0.7;
}

.timeline-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl) var(--spacing-lg);
  text-align: center;
  max-width: 480px;
  margin: 0 auto;
}

.timeline-welcome h2 {
  color: var(--color-heading);
  font-size: var(--font-size-xl, 1.5rem);
  margin: 0;
}

.timeline-welcome p {
  color: var(--color-muted);
  margin: 0;
  line-height: 1.6;
}

.timeline-welcome-hint {
  font-size: var(--font-size-sm);
  opacity: 0.8;
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
