<template>
  <div
    class="gantt-fork-bar"
    :style="{
      left: barLeft + '%',
      width: barWidth + '%',
      '--fork-color': color,
    }"
    :title="`Fork: ${fork.forkBranchId.slice(0, 8)} (${fork.messageCount} messages)`"
    @click.stop="emit('select', fork)"
  />
</template>

<script setup>
import { computed } from 'vue'

/**
 * GanttForkBar — a fork branch sub-bar rendered below its parent session bar.
 *
 * Positioned absolutely at 50% height (14px) within the parent swimlane row.
 * Uses the same timeToPercent math as GanttBar but renders at half height,
 * overlaid in the lower half of the row so no row height changes are needed.
 *
 * Visual treatment: 50% opacity of the project color, clearly subordinate
 * to the main session bar above it.
 *
 * Emits 'select' with the fork object when clicked.
 *
 * @prop {Object} fork  - Fork segment: { forkBranchId, startTime, endTime, messageCount }
 * @prop {string} date  - YYYY-MM-DD date string for time-to-percent conversion
 * @prop {string} color - Project color hex string (same as parent session)
 */
const emit = defineEmits(['select'])

const props = defineProps({
  fork: {
    type: Object,
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
})

/**
 * Converts an ISO timestamp to a percentage (0-100) of a 24-hour day.
 * Matches the identical function in GanttBar.vue.
 */
function timeToPercent(timestamp, dateStr) {
  const dayStart = new Date(dateStr + 'T00:00:00').getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const t = new Date(timestamp).getTime()
  return Math.max(0, Math.min(100, ((t - dayStart) / dayMs) * 100))
}

/** Left offset of the fork bar as percentage of the 24h day */
const barLeft = computed(() => timeToPercent(props.fork.startTime, props.date))

/** Width of the fork bar as percentage of the 24h day, with a minimum to remain visible */
const barWidth = computed(() => {
  const widthPct = timeToPercent(props.fork.endTime, props.date) - barLeft.value
  return Math.max(widthPct, 0.03)
})
</script>

<style scoped>
.gantt-fork-bar {
  position: absolute;
  height: 14px;
  min-width: 4px;
  border-radius: var(--radius-sm);
  background: var(--fork-color);
  opacity: 0.5;
  cursor: pointer;
  pointer-events: auto;
}

.gantt-fork-bar:hover {
  opacity: 0.7;
}
</style>
