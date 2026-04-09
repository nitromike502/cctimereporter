<template>
  <div class="tokens-page">
    <TimelineToolbar
      :date="selectedDate"
      :import-running="false"
      @navigate="navigateToDate"
    />

    <div v-if="loading" class="tokens-loading">
      Loading token data&hellip;
    </div>

    <div v-else-if="error" class="tokens-error">
      <span>Error: {{ error }}</span>
      <AppButton variant="ghost" size="sm" @click="fetchData">Retry</AppButton>
    </div>

    <div v-else-if="!enrichedSessions.length" class="tokens-empty">
      <p>No token data for <strong>{{ selectedDate }}</strong>.</p>
      <p class="tokens-empty-hint">Try navigating to a different date, or re-import sessions.</p>
    </div>

    <template v-else>
      <!-- Session detail panel — always visible when content is present -->
      <SessionDetailPanel
        :session="selectedSession"
        :project-name="selectedProjectName"
        :tokens="selectedSessionTokens"
        @show-messages="onShowMessages"
      />

      <div class="tokens-content">
        <!-- Chart controls: segmented view toggle -->
        <div class="chart-controls">
          <div class="view-toggle" role="group" aria-label="Chart view mode">
            <button
              class="toggle-btn"
              :class="{ active: viewMode === 'cumulative' }"
              @click="viewMode = 'cumulative'"
            >
              Cumulative
            </button>
            <button
              class="toggle-btn"
              :class="{ active: viewMode === 'per-message' }"
              @click="viewMode = 'per-message'"
            >
              Per Message
            </button>
          </div>
        </div>

        <!-- Token usage chart -->
        <TokenChart :chart-data="chartData" :chart-options="chartOptions" />

        <!-- Custom HTML legend with session visibility toggle -->
        <div class="token-legend" role="list" aria-label="Session legend">
          <div
            v-for="(session, idx) in enrichedSessions"
            :key="session.sessionId"
            class="legend-item"
            :class="{ 'legend-item--hidden': hiddenSessions.has(idx) }"
            role="listitem"
            tabindex="0"
            :title="hiddenSessions.has(idx) ? 'Click to show' : 'Click to hide'"
            @click="toggleSession(idx)"
            @keydown.enter.prevent="toggleSession(idx)"
            @keydown.space.prevent="toggleSession(idx)"
          >
            <span
              class="legend-color"
              :style="{ backgroundColor: projectColor(session.projectPath) }"
            ></span>
            <span class="legend-label">{{ resolveSessionLabel(session) }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Session messages modal -->
    <SessionMessagesModal
      v-model:open="messagesModalOpen"
      :session-id="messagesModalSessionId"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TimelineToolbar from '../components/TimelineToolbar.vue'
import AppButton from '../components/AppButton.vue'
import TokenChart from '../components/TokenChart.vue'
import SessionDetailPanel from '../components/SessionDetailPanel.vue'
import SessionMessagesModal from '../components/SessionMessagesModal.vue'
import { projectColor } from '../utils/project-colors.js'
import { useTheme } from '../composables/useTheme.js'

// --- Router ---

const route = useRoute()
const router = useRouter()

// --- Theme ---

const { isDark } = useTheme()

// --- State ---

const tokensData = ref(null)       // Raw /api/tokens response
const timelineData = ref(null)     // Raw /api/timeline response (for session metadata)
const loading = ref(false)
const error = ref(null)

// Chart/interaction state
const viewMode = ref('cumulative') // 'cumulative' | 'per-message'
const hiddenSessions = ref(new Set())
const selectedSession = ref(null)
const messagesModalOpen = ref(false)
const messagesModalSessionId = ref('')

// --- Date management (URL-synced, mirrors TimelinePage) ---

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const selectedDate = computed(() => route.query.date ?? todayStr())

function navigateToDate(dateStr) {
  router.push({ path: '/tokens', query: { date: dateStr } })
}

// --- Data fetching ---

async function fetchData() {
  loading.value = true
  error.value = null
  tokensData.value = null
  timelineData.value = null

  try {
    // Fetch tokens and timeline in parallel — timeline provides session metadata (project path, name, etc.)
    const [tokRes, tlRes] = await Promise.all([
      fetch(`/api/tokens?date=${selectedDate.value}`),
      fetch(`/api/timeline?date=${selectedDate.value}`),
    ])
    if (!tokRes.ok) throw new Error(`Tokens API: HTTP ${tokRes.status}`)
    // Timeline failure is non-fatal — we still show the chart without project metadata
    const [tokJson, tlJson] = await Promise.all([
      tokRes.json(),
      tlRes.ok ? tlRes.json() : Promise.resolve(null),
    ])
    tokensData.value = tokJson
    timelineData.value = tlJson
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// --- Session metadata helpers ---

/**
 * Build a Map from sessionId → timeline session object.
 * Used to enrich token sessions with project path, display name, timestamps, etc.
 */
const timelineSessionMap = computed(() => {
  const map = new Map()
  if (!timelineData.value?.projects) return map
  for (const project of timelineData.value.projects) {
    for (const session of project.sessions ?? []) {
      map.set(session.sessionId, {
        ...session,
        projectPath: project.projectPath,
        projectName: project.displayName,
      })
    }
  }
  return map
})

/**
 * Enriched session array: token sessions merged with timeline metadata.
 * Only includes sessions that have at least one assistant message with token data.
 */
const enrichedSessions = computed(() => {
  const sessions = tokensData.value?.sessions ?? []
  return sessions
    .filter(s => s.tokenMessages?.length > 0)
    .map(s => {
      const tl = timelineSessionMap.value.get(s.sessionId) ?? {}
      return {
        // Token aggregate fields
        sessionId: s.sessionId,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        cacheCreationInputTokens: s.cacheCreationInputTokens,
        cacheReadInputTokens: s.cacheReadInputTokens,
        totalTokens: s.totalTokens,
        cacheHitRate: s.cacheHitRate,
        tokenMessages: s.tokenMessages,
        // Timeline metadata (gracefully absent)
        projectPath: tl.projectPath ?? s.sessionId, // fallback to sessionId for color hash
        projectName: tl.projectName ?? '',
        userLabel: tl.userLabel ?? null,
        customTitle: tl.customTitle ?? null,
        startTime: tl.startTime ?? null,
        endTime: tl.endTime ?? null,
        workingTimeMs: tl.workingTimeMs ?? null,
        elapsedTimeMs: tl.elapsedTimeMs ?? null,
        messageCount: tl.messageCount ?? null,
        ticket: tl.ticket ?? null,
        branch: tl.branch ?? null,
        userTicket: tl.userTicket ?? null,
      }
    })
})

// --- Session detail ---

const selectedProjectName = computed(() => {
  if (!selectedSession.value) return ''
  return selectedSession.value.projectName ?? ''
})

/** Token aggregate object for the selected session — fed to SessionDetailPanel :tokens prop */
const selectedSessionTokens = computed(() => {
  if (!selectedSession.value) return null
  const s = selectedSession.value
  return {
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    cacheCreationInputTokens: s.cacheCreationInputTokens,
    cacheReadInputTokens: s.cacheReadInputTokens,
    totalTokens: s.totalTokens,
    cacheHitRate: s.cacheHitRate,
  }
})

function onShowMessages() {
  if (!selectedSession.value) return
  messagesModalSessionId.value = selectedSession.value.sessionId
  messagesModalOpen.value = true
}

// --- Session label resolution ---

function resolveSessionLabel(session) {
  if (session.userLabel) return session.userLabel
  if (session.customTitle) return session.customTitle
  return session.sessionId.slice(0, 8) + '...'
}

// --- Legend toggle ---

function toggleSession(idx) {
  const next = new Set(hiddenSessions.value)
  if (next.has(idx)) next.delete(idx)
  else next.add(idx)
  hiddenSessions.value = next
}

// --- Chart data helpers ---

function buildTokenSeries(messages, mode) {
  if (mode === 'cumulative') {
    let running = 0
    return messages.map(m => {
      running += m.totalTokens ?? 0
      return running
    })
  }
  // per-message mode
  return messages.map(m => m.totalTokens ?? 0)
}

// --- chartData computed ---

const AGGREGATE_DATASET_INDEX = 0

const chartData = computed(() => {
  if (!enrichedSessions.value.length) return { labels: [], datasets: [] }

  const sessions = enrichedSessions.value
  const maxMessages = Math.max(...sessions.map(s => s.tokenMessages.length), 0)
  const labels = Array.from({ length: maxMessages }, (_, i) => i + 1)

  // Per-session datasets (offset by 1 since aggregate is at index 0)
  const sessionDatasets = sessions.map((session, idx) => {
    const series = buildTokenSeries(session.tokenMessages, viewMode.value)
    const padded = series.concat(Array(Math.max(0, maxMessages - series.length)).fill(null))
    return {
      label: resolveSessionLabel(session),
      data: padded,
      borderColor: projectColor(session.projectPath),
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 5,
      tension: 0,
      hidden: hiddenSessions.value.has(idx),
    }
  })

  // Aggregate "All Sessions" line — sum of all VISIBLE sessions at each message index
  const aggregateData = Array.from({ length: maxMessages }, (_, i) => {
    let sum = 0
    let hasAny = false
    sessionDatasets.forEach((ds, idx) => {
      if (!hiddenSessions.value.has(idx) && ds.data[i] != null) {
        sum += ds.data[i]
        hasAny = true
      }
    })
    return hasAny ? sum : null
  })

  // Resolve aggregate line color from CSS token for theme support
  const aggregateColor =
    getComputedStyle(document.documentElement).getPropertyValue('--color-muted').trim() || '#6e7c87'

  const aggregateDataset = {
    label: 'All Sessions',
    data: aggregateData,
    borderColor: aggregateColor,
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderDash: [6, 4],
    pointRadius: 0,
    tension: 0,
    hidden: false,
  }

  return {
    labels,
    datasets: [aggregateDataset, ...sessionDatasets],
  }
})

// --- CSS token helper ---

function getToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// --- chartOptions computed (theme-reactive via isDark dependency) ---

const chartOptions = computed(() => {
  void isDark.value // reactive dependency — options recompute on theme switch

  const mutedColor  = getToken('--color-muted')  || '#6e7c87'
  const borderColor = getToken('--color-border') || '#d0d7de'
  const bgSecondary = getToken('--color-bg-secondary') || '#f6f8fa'
  const headingColor = getToken('--color-heading') || '#243846'
  const bodyColor   = getToken('--color-body-text') || '#3e4d56'

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    onClick: (_event, activeElements) => {
      if (!activeElements.length) return
      const { datasetIndex } = activeElements[0]
      if (datasetIndex === AGGREGATE_DATASET_INDEX) return // ignore aggregate click
      const sessionIdx = datasetIndex - 1 // offset by 1 (aggregate is index 0)
      const session = enrichedSessions.value[sessionIdx]
      if (!session) return
      // Toggle: clicking same session deselects
      if (selectedSession.value?.sessionId === session.sessionId) {
        selectedSession.value = null
      } else {
        selectedSession.value = session
      }
    },
    plugins: {
      legend: { display: false }, // custom HTML legend instead
      tooltip: {
        backgroundColor: bgSecondary,
        titleColor: headingColor,
        bodyColor,
        borderColor,
        borderWidth: 1,
        callbacks: {
          title: (items) => `Message ${items[0]?.label ?? ''}`,
          label: (context) => {
            const value = context.parsed.y
            if (value == null) return null
            const formatted = value >= 1_000_000
              ? (value / 1_000_000).toFixed(1) + 'M'
              : value >= 1_000
              ? (value / 1_000).toFixed(0) + 'K'
              : value.toLocaleString()
            return `${context.dataset.label}: ${formatted} tokens`
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Assistant Message Index',
          color: mutedColor,
        },
        ticks: { color: mutedColor },
        grid: { color: borderColor },
      },
      y: {
        title: {
          display: true,
          text: viewMode.value === 'cumulative' ? 'Cumulative Tokens' : 'Tokens per Message',
          color: mutedColor,
        },
        ticks: {
          color: mutedColor,
          callback: (value) => {
            if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M'
            if (value >= 1_000) return (value / 1_000).toFixed(0) + 'K'
            return value
          },
        },
        grid: { color: borderColor },
      },
    },
  }
})

// --- Reset interaction state on date change ---

watch(() => route.query.date, () => {
  selectedSession.value = null
  hiddenSessions.value = new Set()
  fetchData()
})

// --- Lifecycle ---

onMounted(fetchData)
</script>

<style scoped>
.tokens-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.tokens-loading {
  padding: var(--spacing-xl) var(--spacing-lg);
  color: var(--color-muted);
  text-align: center;
  font-size: var(--font-size-base);
}

.tokens-error {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: color-mix(in srgb, var(--color-danger, #e05c5c) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-danger, #e05c5c) 30%, transparent);
  color: var(--color-danger, #e05c5c);
  font-size: var(--font-size-sm);
}

.tokens-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl);
  color: var(--color-muted);
  text-align: center;
}

.tokens-empty strong {
  color: var(--color-heading);
}

.tokens-empty-hint {
  font-size: var(--font-size-sm);
  opacity: 0.7;
}

.tokens-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  flex: 1;
}

/* Chart controls */
.chart-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

/* Segmented view toggle */
.view-toggle {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.toggle-btn {
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-sm);
  background: transparent;
  border: none;
  border-right: 1px solid var(--color-border);
  cursor: pointer;
  color: var(--color-body-text);
  transition: background var(--transition-fast), color var(--transition-fast);
  white-space: nowrap;
}

.toggle-btn:last-child {
  border-right: none;
}

.toggle-btn:hover:not(.active) {
  background: var(--color-bg-secondary);
}

.toggle-btn.active {
  background: var(--color-bg-secondary);
  color: var(--color-heading);
  font-weight: 600;
}

/* Custom HTML legend */
.token-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs) var(--spacing-md);
  max-height: 120px;
  overflow-y: auto;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}

.legend-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-xs);
  cursor: pointer;
  padding: 2px var(--spacing-xs);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--color-body-text);
  transition: opacity var(--transition-fast), background var(--transition-fast);
  user-select: none;
}

.legend-item:hover {
  background: var(--color-bg);
}

.legend-item:focus-visible {
  outline: 2px solid var(--color-link);
  outline-offset: 1px;
}

.legend-item--hidden {
  opacity: 0.4;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legend-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
</style>
