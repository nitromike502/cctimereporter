<template>
  <div class="gantt-chart">
    <div class="gantt-chart-inner" :class="{ 'is-pannable': zoomLevel > 1 }">
    <!-- Pinned label column -->
    <div class="gantt-labels">
      <div class="gantt-label-header"></div>
      <div
        v-for="project in projects"
        :key="project.projectId"
        class="gantt-label-row"
        :style="{ height: laneHeights[project.projectId] + 'px' }"
        :title="project.displayName"
      >{{ project.displayName }}</div>
    </div>

    <!-- Scrollable canvas area -->
    <div class="gantt-scroll-area" ref="scrollAreaEl"
         @mousedown="onScrollAreaMouseDown"
         @scroll="onScrollAreaScroll">
      <div class="gantt-canvas" :style="{ width: zoomLevel * 100 + '%' }" :class="{ 'zoom-transitioning': isTransitioning }">
        <!-- Time axis -->
        <div class="time-axis">
          <div
            v-for="tick in timeAxisTicks"
            :key="tick.pct"
            class="tick"
            :style="{ left: tick.pct + '%' }"
          >
            <span class="tick-label">{{ tick.label }}</span>
          </div>
        </div>

        <!-- Swim lanes -->
        <div class="lanes-container">
          <!-- Grid overlay: full canvas width, inside scroll area -->
          <div class="grid-overlay">
            <div
              v-for="tick in timeAxisTicks"
              :key="'grid-' + tick.pct"
              class="grid-line"
              :style="{ left: tick.pct + '%' }"
            />
          </div>

          <!-- Project swim lanes (bars only, labels are in .gantt-labels) -->
          <div v-for="project in projects" :key="project.projectId" class="swimlane-row">
            <GanttSwimlane
              :sessions="project.sessions"
              :date="date"
              :color="project.color"
              :selected-session-id="selectedSessionId"
              :selected-fork-branch-id="selectedForkBranchId"
              :show-forks="showForks"
              @select="onBarSelect($event)"
              @select-fork="onForkSelect($event)"
            />
          </div>
        </div>
      </div>
    </div>

    </div>

    <!-- Controls bar below the chart: forks toggle + zoom -->
    <div class="zoom-bar">
      <button
        class="fork-toggle-btn"
        :class="{ 'fork-toggle-btn--active': showForks }"
        :title="showForks ? 'Hide fork branches' : 'Show fork branches'"
        @click="$emit('update:showForks', !showForks)"
        aria-label="Toggle fork branch visibility"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="6" r="3"/>
          <path d="M6 15V7a9 9 0 0 0 9 9"/>
        </svg>
        Forks
      </button>
      <span class="zoom-bar-spacer"></span>
      <span class="zoom-bar-label">Zoom</span>
      <NumberStepper
        :model-value="zoomLevel"
        :min="1"
        :max="4"
        :step="0.25"
        label="Zoom level"
        @update:model-value="onStepperZoom($event)"
      />
      <span class="zoom-bar-suffix">x</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import GanttSwimlane from './GanttSwimlane.vue'
import NumberStepper from './NumberStepper.vue'

/**
 * GanttChart — the main timeline canvas.
 *
 * Renders a two-column layout: pinned label column on the left,
 * scrollable canvas area on the right containing the time axis,
 * grid lines, and swimlanes.
 *
 * At 1x zoom (.gantt-canvas is 100% width) the chart looks identical
 * to the old single-flow layout. Canvas width scales to zoomLevel * 100%
 * to enable horizontal scroll.
 *
 * @prop {Array}  projects          - Array of { projectId, displayName, color, sessions } objects
 * @prop {string} date              - YYYY-MM-DD date string
 * @prop {string} selectedSessionId - Session ID of the currently selected bar (or null)
 * @prop {number} zoomLevel         - Zoom multiplier (1–4), controls canvas width
 */
const props = defineProps({
  projects: {
    type: Array,
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  selectedSessionId: {
    type: String,
    default: null,
  },
  selectedForkBranchId: {
    type: String,
    default: null,
  },
  zoomLevel: {
    type: Number,
    default: 1,
  },
  /** Whether fork sub-rows are visible. Passed through to GanttSwimlane. */
  showForks: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['select', 'select-fork', 'update:zoomLevel', 'update:showForks'])

// --- Zoom transition (button zoom only) ---

const isTransitioning = ref(false)
let transitionTimer = null

function onStepperZoom(newZoom) {
  isTransitioning.value = true
  emit('update:zoomLevel', newZoom)
  clearTimeout(transitionTimer)
  transitionTimer = setTimeout(() => { isTransitioning.value = false }, 160)
}

// --- Scroll area ref ---

const scrollAreaEl = ref(null)

// --- Wheel zoom handler ---

const ZOOM_MIN = 1
const ZOOM_MAX = 4
const ZOOM_STEP = 0.25

function onWheel(event) {
  // Only zoom on vertical scroll (deltaY). Ignore horizontal scroll (deltaX dominant = trackpad pan).
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return

  event.preventDefault()

  const direction = event.deltaY < 0 ? 1 : -1
  const oldZoom = props.zoomLevel
  const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, oldZoom + direction * ZOOM_STEP))
  if (newZoom === oldZoom) return

  const viewport = scrollAreaEl.value
  if (!viewport) return

  // Cursor-anchor math:
  // cursorViewportX = horizontal distance from left edge of viewport to cursor
  const cursorViewportX = event.clientX - viewport.getBoundingClientRect().left
  const oldScrollLeft = viewport.scrollLeft

  emit('update:zoomLevel', newZoom)

  nextTick(() => {
    // After DOM update, reposition scroll so content under cursor stays anchored
    viewport.scrollLeft = (oldScrollLeft + cursorViewportX) * (newZoom / oldZoom) - cursorViewportX
  })
}

// Must use addEventListener (not @wheel in template) because Vue template event listeners
// are passive by default and we need preventDefault() to prevent page scrolling.
onMounted(() => {
  scrollAreaEl.value?.addEventListener('wheel', onWheel, { passive: false })
})
onUnmounted(() => {
  scrollAreaEl.value?.removeEventListener('wheel', onWheel)
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', onPanEnd)
})

// --- Drag-pan + bar click guard ---

let scrollStartX = 0
let didScroll = false
let isPanning = false
let panStartMouseX = 0
let panStartScrollLeft = 0

function onScrollAreaMouseDown(event) {
  scrollStartX = scrollAreaEl.value?.scrollLeft ?? 0
  didScroll = false

  // Only enable drag-pan when zoomed in
  if (props.zoomLevel > 1 && event.button === 0) {
    isPanning = true
    panStartMouseX = event.clientX
    panStartScrollLeft = scrollAreaEl.value?.scrollLeft ?? 0
    scrollAreaEl.value?.classList.add('is-grabbing')
    event.preventDefault()

    document.addEventListener('mousemove', onPanMove)
    document.addEventListener('mouseup', onPanEnd)
  }
}

function onPanMove(event) {
  if (!isPanning || !scrollAreaEl.value) return
  const delta = panStartMouseX - event.clientX
  scrollAreaEl.value.scrollLeft = panStartScrollLeft + delta

  // Set didScroll if movement exceeds threshold (prevents bar click on drag release)
  if (Math.abs(delta) > 5) {
    didScroll = true
  }
}

function onPanEnd() {
  isPanning = false
  scrollAreaEl.value?.classList.remove('is-grabbing')
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', onPanEnd)
}

function onScrollAreaScroll() {
  const currentX = scrollAreaEl.value?.scrollLeft ?? 0
  if (Math.abs(currentX - scrollStartX) > 5) {
    didScroll = true
  }
}

function onBarSelect(session) {
  if (didScroll) {
    didScroll = false
    return
  }
  emit('select', session)
}

/**
 * Routes fork bar clicks through the drag-pan guard.
 * Prevents accidental fork selection when the user was panning at zoom > 1x.
 * Called from GanttSwimlane's select-fork event (wired by Phase 24).
 */
function onForkSelect(fork) {
  if (didScroll) {
    didScroll = false
    return
  }
  emit('select-fork', fork)
}

// Reset scrollLeft when date changes (zoom reset to 1x is in TimelinePage's date watcher)
watch(() => props.date, () => {
  if (scrollAreaEl.value) {
    scrollAreaEl.value.scrollLeft = 0
  }
})

/** Bar height (28px) + gap (8px) — must match GanttSwimlane.vue BAR_ROW_HEIGHT */
const BAR_ROW_HEIGHT = 36
/** Fork bar height — must match GanttSwimlane.vue FORK_BAR_HEIGHT */
const FORK_BAR_HEIGHT = 14

/**
 * Computes the number of non-overlapping sub-rows for a project's sessions.
 * Mirrors the greedy algorithm in GanttSwimlane so label heights match swimlane heights.
 */
function computeSubRowCount(sessions) {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startTime) - new Date(b.startTime)
  )
  const rows = []
  for (const session of sorted) {
    const sessionStart = new Date(session.startTime).getTime()
    const rowIdx = rows.findIndex(
      (row) => row.length === 0 || new Date(row.at(-1).endTime).getTime() <= sessionStart
    )
    if (rowIdx === -1) {
      rows.push([session])
    } else {
      rows[rowIdx].push(session)
    }
  }
  return Math.max(rows.length, 1)
}

/**
 * Map of projectId → lane height in px.
 * Matches GanttSwimlane's laneHeight: subRowCount * BAR_ROW_HEIGHT + 8 + forkExtra
 */
const laneHeights = computed(() => {
  const map = {}
  for (const project of props.projects) {
    const subRowCount = computeSubRowCount(project.sessions)
    let maxForks = 0
    if (props.showForks) {
      for (const s of project.sessions) {
        const cnt = s.forkSegments?.length ?? 0
        if (cnt > maxForks) maxForks = cnt
      }
    }
    map[project.projectId] = subRowCount * BAR_ROW_HEIGHT + 8 + maxForks * FORK_BAR_HEIGHT
  }
  return map
})

/**
 * Generates tick marks for the 24h time axis with zoom-adaptive density.
 * Labels use 12-hour format. Sub-hour ticks show "H:MMa/p" format.
 *
 * Density rules:
 *   1x–1.74x: every 2 hours (13 ticks)
 *   1.75x–2.74x: every 1 hour (25 ticks)
 *   2.75x–3.74x: every 30 minutes (49 ticks)
 *   3.75x–4x: every 15 minutes (97 ticks)
 */
const timeAxisTicks = computed(() => {
  const z = props.zoomLevel
  let stepHours
  if (z >= 3.75) stepHours = 0.25      // 15 min
  else if (z >= 2.75) stepHours = 0.5   // 30 min
  else if (z >= 1.75) stepHours = 1     // 1 hour
  else stepHours = 2                     // 2 hours

  const ticks = []
  for (let h = 0; h <= 24; h += stepHours) {
    const pct = (h / 24) * 100
    const totalMinutes = h * 60
    const hours = Math.floor(totalMinutes / 60)
    const minutes = Math.round(totalMinutes % 60)

    let label
    if (minutes === 0) {
      // Full hour — use 12-hour format
      const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
      const suffix = hours < 12 || hours === 24 ? 'a' : 'p'
      label = `${h12}${suffix}`
    } else {
      // Sub-hour — show as "H:MM" in 12-hour format
      const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
      const suffix = hours < 12 ? 'a' : 'p'
      label = `${h12}:${String(minutes).padStart(2, '0')}${suffix}`
    }
    ticks.push({ pct, label })
  }
  return ticks
})
</script>

<style scoped>
.gantt-chart {
  width: 100%;
}

.gantt-chart-inner {
  display: flex;
}

/* Grab cursor when zoomed in (pannable) */
.gantt-chart-inner.is-pannable .gantt-scroll-area {
  cursor: grab;
}

.gantt-chart-inner.is-pannable .gantt-scroll-area.is-grabbing {
  cursor: grabbing;
  user-select: none;
}

/* Pinned label column */
.gantt-labels {
  width: 140px;
  flex-shrink: 0;
}

.gantt-label-header {
  height: 28px;
  border-bottom: 1px solid var(--color-border);
}

.gantt-label-row {
  padding: var(--spacing-sm) var(--spacing-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-heading);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-top: var(--spacing-sm);
  box-sizing: border-box;
}

/* Scrollable canvas area */
.gantt-scroll-area {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  margin-left: -14px;
  padding-left: 14px;
  padding-right: 10px;
  scrollbar-width: none; /* Firefox */
}

.gantt-scroll-area::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Edge */
}

.gantt-canvas {
  /* Width is set via inline style: zoomLevel * 100% — see :style binding in template */
}

/* Smooth transition for button-triggered zoom only (not wheel zoom) */
.gantt-canvas.zoom-transitioning {
  transition: width 150ms ease-out;
}

.time-axis {
  position: relative;
  height: 28px;
  border-bottom: 1px solid var(--color-border);
}

.tick {
  position: absolute;
  top: 0;
  height: 100%;
  transform: translateX(-50%);
}

.tick-label {
  font-size: var(--font-size-xs);
  color: var(--color-muted);
  user-select: none;
}

.lanes-container {
  position: relative;
  min-height: 100px;
}

.grid-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  z-index: 0;
}

.grid-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-border);
  opacity: 0.4;
}

.swimlane-row {
  position: relative;
}

/* Controls bar below chart: forks toggle + zoom */
.zoom-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 4px var(--spacing-sm);
}

.zoom-bar-label,
.zoom-bar-suffix {
  font-size: var(--font-size-xs);
  color: var(--color-muted);
  white-space: nowrap;
}

.zoom-bar-spacer {
  flex: 1;
}

/* Fork visibility toggle button */
.fork-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--color-muted);
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast);
  opacity: 0.7;
  white-space: nowrap;
}

.fork-toggle-btn:hover {
  opacity: 1;
  color: var(--color-heading);
  border-color: var(--color-muted);
}

.fork-toggle-btn--active {
  color: var(--color-link);
  border-color: var(--color-link);
  opacity: 1;
}

.fork-toggle-btn--active:hover {
  color: var(--color-link);
}
</style>
