<template>
  <div class="gantt-swimlane" :style="{ height: laneHeight + 'px' }">
    <template v-for="(row, rowIdx) in subRows" :key="rowIdx">
      <GanttBar
        v-for="session in row"
        :key="session.sessionId"
        :session="session"
        :date="date"
        :color="color"
        :selected="session.sessionId === selectedSessionId"
        :style="{ top: rowIdx * BAR_ROW_HEIGHT + 'px' }"
        @select="emit('select', $event)"
      />
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import GanttBar from './GanttBar.vue'

/**
 * GanttSwimlane — renders all session bars for one project.
 *
 * Uses a greedy algorithm to stack overlapping sessions in non-colliding sub-rows.
 * Forwards the selected session ID to each bar and bubbles the select event up.
 *
 * @prop {Array}  sessions         - Array of session objects from the API
 * @prop {string} date             - YYYY-MM-DD for time conversion
 * @prop {string} color            - Project color hex string
 * @prop {string} selectedSessionId - Session ID of the currently selected bar (or null)
 */
const props = defineProps({
  sessions: {
    type: Array,
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  color: {
    type: String,
    required: true,
  },
  selectedSessionId: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['select'])

/** Bar height (28px) + gap (8px) */
const BAR_ROW_HEIGHT = 36

/**
 * Assigns sessions to non-overlapping sub-rows using a greedy algorithm.
 * Sessions are sorted by start time and placed into the first row that has room.
 */
const subRows = computed(() => {
  const sorted = [...props.sessions].sort(
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
  return rows
})

/** Total height of the swim lane to accommodate all sub-rows */
const laneHeight = computed(() => subRows.value.length * BAR_ROW_HEIGHT + 8)
</script>

<style scoped>
.gantt-swimlane {
  position: relative;
  min-height: 36px;
  border-bottom: 1px solid var(--color-border);
}
</style>
