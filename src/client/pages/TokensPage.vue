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
      <SessionDetailPanel
        :session="selectedSession"
        :project-name="selectedProjectName"
        :tokens="selectedSessionTokens"
        @show-messages="onShowMessages"
      />

      <!-- Project filter bar (matches TimelinePage pattern) -->
      <div class="filter-bar" v-if="colorizedProjects.length > 1">
        <span class="filter-label">Projects:</span>
        <AppCheckbox
          v-for="p in colorizedProjects"
          :key="p.projectPath"
          :model-value="!hiddenProjects.has(p.projectPath)"
          :label="p.displayName"
          @update:model-value="toggleProject(p.projectPath)"
        />
      </div>

      <!-- Legend (same GanttLegend component as TimelinePage) -->
      <GanttLegend
        v-if="legendItems.length > 0"
        :projects="legendItems"
      />

      <div class="tokens-content">
        <div class="chart-controls">
          <div class="view-toggle" role="group" aria-label="Chart view mode">
            <button
              class="toggle-btn"
              :class="{ active: viewMode === 'sessions' }"
              @click="viewMode = 'sessions'"
            >
              Session Totals
            </button>
            <button
              class="toggle-btn"
              :class="{ active: viewMode === 'timeline' }"
              @click="viewMode = 'timeline'"
            >
              Per Message
            </button>
          </div>

          <label v-if="viewMode === 'timeline'" class="bucket-control">
            <span class="bucket-label">Interval:</span>
            <select v-model.number="bucketMinutes" class="bucket-select">
              <option :value="1">1 min</option>
              <option :value="5">5 min</option>
              <option :value="10">10 min</option>
              <option :value="15">15 min</option>
              <option :value="30">30 min</option>
              <option :value="60">1 hour</option>
            </select>
          </label>
        </div>

        <TokenChart
          :chart-data="chartData"
          :chart-options="chartOptions"
          :chart-type="viewMode === 'sessions' ? 'bar' : 'line'"
        />
      </div>
    </template>

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
import AppCheckbox from '../components/AppCheckbox.vue'
import TokenChart from '../components/TokenChart.vue'
import SessionDetailPanel from '../components/SessionDetailPanel.vue'
import SessionMessagesModal from '../components/SessionMessagesModal.vue'
import GanttLegend from '../components/GanttLegend.vue'
import { projectColor, resetProjectColors } from '../utils/project-colors.js'
import { useTheme } from '../composables/useTheme.js'

const route = useRoute()
const router = useRouter()
const { isDark } = useTheme()

// --- State ---

const tokensData = ref(null)
const timelineData = ref(null)
const loading = ref(false)
const error = ref(null)

const viewMode = ref('sessions')        // 'sessions' | 'timeline'
const bucketMinutes = ref(5)
const hiddenProjects = ref(new Set())   // Set of projectPath strings
const selectedSession = ref(null)
const messagesModalOpen = ref(false)
const messagesModalSessionId = ref('')

// --- Date management ---

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
    const [tokRes, tlRes] = await Promise.all([
      fetch(`/api/tokens?date=${selectedDate.value}`),
      fetch(`/api/timeline?date=${selectedDate.value}`),
    ])
    if (!tokRes.ok) throw new Error(`Tokens API: HTTP ${tokRes.status}`)
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

// --- Session metadata ---

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

const enrichedSessions = computed(() => {
  const sessions = tokensData.value?.sessions ?? []
  return sessions
    .filter(s => s.tokenMessages?.length > 0)
    .map(s => {
      const tl = timelineSessionMap.value.get(s.sessionId) ?? {}
      return {
        sessionId: s.sessionId,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        cacheCreationInputTokens: s.cacheCreationInputTokens,
        cacheReadInputTokens: s.cacheReadInputTokens,
        totalTokens: s.totalTokens,
        cacheHitRate: s.cacheHitRate,
        tokenMessages: s.tokenMessages,
        projectPath: tl.projectPath ?? s.sessionId,
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

// --- Project filtering (matches TimelinePage pattern) ---

const colorizedProjects = computed(() => {
  const seen = new Set()
  const items = []
  for (const s of enrichedSessions.value) {
    if (seen.has(s.projectPath)) continue
    seen.add(s.projectPath)
    items.push({
      projectPath: s.projectPath,
      displayName: s.projectName || s.projectPath.split('/').filter(Boolean).pop() || s.projectPath,
      color: projectColor(s.projectPath),
    })
  }
  return items
})

const visibleSessions = computed(() =>
  enrichedSessions.value.filter(s => !hiddenProjects.value.has(s.projectPath))
)

const legendItems = computed(() =>
  colorizedProjects.value.map(p => ({ displayName: p.displayName, color: p.color }))
)

// --- Session detail ---

const selectedProjectName = computed(() => selectedSession.value?.projectName ?? '')

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

// --- Helpers ---

function resolveSessionLabel(session) {
  if (session.userLabel) return session.userLabel
  if (session.customTitle) return session.customTitle
  return session.sessionId.slice(0, 8) + '...'
}

function toggleProject(projectPath) {
  const next = new Set(hiddenProjects.value)
  if (next.has(projectPath)) next.delete(projectPath)
  else next.add(projectPath)
  hiddenProjects.value = next
}

function formatTickValue(value) {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M'
  if (value >= 1_000) return (value / 1_000).toFixed(0) + 'K'
  return value
}

function getToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// --- Session Totals Bar Chart ---

const sessionTotalsData = computed(() => {
  const sessions = visibleSessions.value
  const labels = sessions.map(s => resolveSessionLabel(s))

  return {
    labels,
    datasets: [
      {
        label: 'Input Tokens',
        data: sessions.map(s => s.inputTokens ?? 0),
        backgroundColor: sessions.map(s => projectColor(s.projectPath)),
        borderWidth: 0,
        borderSkipped: false,
      },
      {
        label: 'Output Tokens',
        data: sessions.map(s => s.outputTokens ?? 0),
        backgroundColor: sessions.map(s => {
          const base = projectColor(s.projectPath)
          return base + '99'  // 60% opacity for output tokens layer
        }),
        borderWidth: 0,
        borderSkipped: false,
      },
    ],
  }
})

const sessionTotalsOptions = computed(() => {
  void isDark.value
  const mutedColor = getToken('--color-muted') || '#6e7c87'
  const borderColor = getToken('--color-border') || '#d0d7de'
  const bgSecondary = getToken('--color-bg-secondary') || '#f6f8fa'
  const headingColor = getToken('--color-heading') || '#243846'
  const bodyColor = getToken('--color-body-text') || '#3e4d56'

  return {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event, activeElements) => {
      if (!activeElements.length) return
      const idx = activeElements[0].index
      const session = visibleSessions.value[idx]
      if (!session) return
      selectedSession.value = selectedSession.value?.sessionId === session.sessionId ? null : session
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: bgSecondary,
        titleColor: headingColor,
        bodyColor,
        borderColor,
        borderWidth: 1,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y
            if (value == null) return null
            return `${context.dataset.label}: ${formatTickValue(value)}`
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { color: mutedColor, maxRotation: 45 },
        grid: { display: false },
      },
      y: {
        stacked: true,
        title: { display: true, text: 'Tokens', color: mutedColor },
        ticks: { color: mutedColor, callback: formatTickValue },
        grid: { color: borderColor },
      },
    },
  }
})

// --- Timeline Bucketed Chart ---

/**
 * Convert a UTC timestamp to local-time "minutes since midnight" for bucketing.
 * This ensures bucket boundaries align to local clock times (e.g., 9:00, 9:05).
 */
function localMinuteOfDay(ts) {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes()
}

function formatLocalTime(minuteOfDay) {
  const h = Math.floor(minuteOfDay / 60)
  const m = minuteOfDay % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function bucketMessages(sessions, bucketMin) {
  // Collect all message local-time minutes across all sessions (including hidden, for consistent axis)
  const allMinutes = []
  sessions.forEach(s => {
    for (const msg of s.tokenMessages) {
      if (msg.timestamp) allMinutes.push(localMinuteOfDay(msg.timestamp))
    }
  })

  if (allMinutes.length === 0) return { labels: [], bucketMap: new Map() }

  const minMinute = Math.min(...allMinutes)
  const maxMinute = Math.max(...allMinutes)

  // Align bucket start to interval boundary
  const startBucket = Math.floor(minMinute / bucketMin) * bucketMin
  const endBucket = Math.floor(maxMinute / bucketMin) * bucketMin

  // Generate labels (local time strings)
  const labels = []
  const bucketStarts = []
  for (let m = startBucket; m <= endBucket; m += bucketMin) {
    bucketStarts.push(m)
    labels.push(formatLocalTime(m))
  }

  // Bucket messages per session
  const bucketMap = new Map()
  sessions.forEach((s, idx) => {
    const buckets = new Array(bucketStarts.length).fill(null).map(() => ({ input: 0, output: 0 }))
    for (const msg of s.tokenMessages) {
      if (!msg.timestamp) continue
      const minute = localMinuteOfDay(msg.timestamp)
      const bucketIdx = Math.floor((minute - startBucket) / bucketMin)
      if (bucketIdx >= 0 && bucketIdx < buckets.length) {
        buckets[bucketIdx].input += msg.inputTokens ?? 0
        buckets[bucketIdx].output += msg.outputTokens ?? 0
      }
    }
    bucketMap.set(idx, buckets)
  })

  return { labels, bucketStarts, bucketMap }
}

const timelineChartData = computed(() => {
  const sessions = visibleSessions.value
  const { labels, bucketMap } = bucketMessages(sessions, bucketMinutes.value)

  if (labels.length === 0) return { labels: [], datasets: [] }

  // One line per visible session showing total tokens per time bucket
  const datasets = []
  sessions.forEach((session, idx) => {
    const buckets = bucketMap.get(idx)
    if (!buckets) return

    const color = projectColor(session.projectPath)
    const rawData = buckets.map(b => b.input + b.output)

    // Find first and last bucket with data for this session
    let first = -1, last = -1
    for (let i = 0; i < rawData.length; i++) {
      if (rawData[i] > 0) { if (first === -1) first = i; last = i }
    }

    // null outside the session's range, 0 for idle gaps within it
    const data = rawData.map((v, i) => {
      if (first === -1) return null          // no data at all
      if (i < first || i > last) return null // before/after session
      return v                               // 0 for idle gaps, value otherwise
    })

    datasets.push({
      label: resolveSessionLabel(session),
      data,
      borderColor: color,
      backgroundColor: color + '33',
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.2,
      fill: false,
      spanGaps: false,
      sessionIndex: idx,
    })
  })

  return { labels, datasets }
})

const timelineChartOptions = computed(() => {
  void isDark.value
  const mutedColor = getToken('--color-muted') || '#6e7c87'
  const borderColor = getToken('--color-border') || '#d0d7de'
  const bgSecondary = getToken('--color-bg-secondary') || '#f6f8fa'
  const headingColor = getToken('--color-heading') || '#243846'
  const bodyColor = getToken('--color-body-text') || '#3e4d56'

  return {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event, activeElements) => {
      if (!activeElements.length) return
      const ds = timelineChartData.value.datasets[activeElements[0].datasetIndex]
      if (ds?.sessionIndex == null) return
      const session = visibleSessions.value[ds.sessionIndex]
      if (!session) return
      selectedSession.value = selectedSession.value?.sessionId === session.sessionId ? null : session
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: bgSecondary,
        titleColor: headingColor,
        bodyColor,
        borderColor,
        borderWidth: 1,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y
            if (value == null || value === 0) return null
            return `${context.dataset.label}: ${formatTickValue(value)}`
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Time of Day', color: mutedColor },
        ticks: { color: mutedColor, maxRotation: 45, autoSkip: true, maxTicksLimit: 20 },
        grid: { color: borderColor },
      },
      y: {
        title: { display: true, text: 'Tokens per Interval', color: mutedColor },
        ticks: { color: mutedColor, callback: formatTickValue },
        grid: { color: borderColor },
        beginAtZero: true,
      },
    },
  }
})

// --- Computed chart routing ---

const chartData = computed(() =>
  viewMode.value === 'sessions' ? sessionTotalsData.value : timelineChartData.value
)

const chartOptions = computed(() =>
  viewMode.value === 'sessions' ? sessionTotalsOptions.value : timelineChartOptions.value
)

// --- Watchers ---

watch(() => route.query.date, () => {
  selectedSession.value = null
  hiddenProjects.value = new Set()
  resetProjectColors()
  fetchData()
})

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

.chart-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

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

.bucket-control {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  color: var(--color-muted);
}

.bucket-select {
  padding: 2px var(--spacing-xs);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-body-text);
  cursor: pointer;
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
