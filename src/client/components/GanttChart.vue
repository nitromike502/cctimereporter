<template>
  <div class="gantt-chart">
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
      <div class="gantt-canvas" :style="{ width: zoomLevel * 100 + '%' }">
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
              @select="onBarSelect($event)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import GanttSwimlane from './GanttSwimlane.vue'

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
  zoomLevel: {
    type: Number,
    default: 1,
  },
})

const emit = defineEmits(['select', 'update:zoomLevel'])

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
})

// --- Bar click guard (prevent false selection after scroll-dragging) ---

let scrollStartX = 0
let didScroll = false

function onScrollAreaMouseDown() {
  scrollStartX = scrollAreaEl.value?.scrollLeft ?? 0
  didScroll = false
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

// Reset scrollLeft when date changes (zoom reset is handled in Plan 02)
watch(() => props.date, () => {
  if (scrollAreaEl.value) {
    scrollAreaEl.value.scrollLeft = 0
  }
})

/** Bar height (28px) + gap (8px) — must match GanttSwimlane.vue BAR_ROW_HEIGHT */
const BAR_ROW_HEIGHT = 36

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
 * Matches GanttSwimlane's laneHeight: subRowCount * BAR_ROW_HEIGHT + 8
 */
const laneHeights = computed(() => {
  const map = {}
  for (const project of props.projects) {
    const subRowCount = computeSubRowCount(project.sessions)
    map[project.projectId] = subRowCount * BAR_ROW_HEIGHT + 8
  }
  return map
})

/**
 * Generates tick marks for the 24h time axis, one every 2 hours.
 * Labels use 12-hour format: 12a, 2a, 4a, ... 12p, 2p, ... 10p, 12a
 */
const timeAxisTicks = computed(() => {
  const ticks = []
  for (let h = 0; h <= 24; h += 2) {
    const pct = (h / 24) * 100
    const label =
      h === 0 ? '12a' :
      h < 12 ? `${h}a` :
      h === 12 ? '12p' :
      `${h - 12}p`
    ticks.push({ pct, label })
  }
  return ticks
})
</script>

<style scoped>
.gantt-chart {
  width: 100%;
  display: flex;
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
}

.gantt-canvas {
  /* Width is set via inline style: zoomLevel * 100% — see :style binding in template */
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
</style>
