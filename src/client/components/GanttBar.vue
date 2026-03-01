<template>
  <div
    class="gantt-bar"
    :class="{ selected }"
    :style="{
      left: barLeft + '%',
      width: barWidth + '%',
      '--bar-color': color,
    }"
    @click="emit('select', session)"
  >
    <span
      v-for="(seg, i) in segments"
      :key="i"
      class="bar-segment"
      :class="seg.type"
      :style="{ left: seg.leftPct + '%', width: seg.widthPct + '%' }"
    />
    <span class="bar-label">{{ label }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

/**
 * GanttBar — a single session bar positioned absolutely within its parent container.
 *
 * Renders idle-gap segments as faded spans inline within the bar.
 * Emits 'select' with the session object when clicked.
 * Shows a highlight (box-shadow) when the `selected` prop is true.
 *
 * @prop {Object}  session  - Session object: { sessionId, startTime, endTime, workingTimeMs, ticket, branch, summary, messageCount, userMessageCount, idleGaps }
 * @prop {string}  date     - YYYY-MM-DD date string for time-to-percent conversion
 * @prop {string}  color    - Project color hex string
 * @prop {boolean} selected - Whether this bar is the currently selected session
 */
const props = defineProps({
  session: {
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
  selected: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select'])

/**
 * Converts an ISO timestamp to a percentage (0-100) of a 24-hour day.
 */
function timeToPercent(timestamp, dateStr) {
  const dayStart = new Date(dateStr + 'T00:00:00').getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const t = new Date(timestamp).getTime()
  return Math.max(0, Math.min(100, ((t - dayStart) / dayMs) * 100))
}

/** Left offset of the bar as percentage of the 24h day */
const barLeft = computed(() => timeToPercent(props.session.startTime, props.date))

/** Width of the bar as percentage of the 24h day, with a minimum to remain clickable */
const barWidth = computed(() => {
  const widthPct = timeToPercent(props.session.endTime, props.date) - barLeft.value
  return Math.max(widthPct, 0.03)
})

/**
 * Segments computed from idle gaps.
 * leftPct and widthPct are RELATIVE to the bar (0-100% within the bar), not the chart.
 */
const segments = computed(() => {
  const startPct = barLeft.value
  const endPct = startPct + barWidth.value
  if (!props.session.idleGaps?.length) {
    return [{ type: 'active', leftPct: 0, widthPct: 100 }]
  }
  const segs = []
  let cursorPct = startPct
  for (const gap of props.session.idleGaps) {
    const gapStartPct = timeToPercent(gap.start, props.date)
    const gapEndPct = timeToPercent(gap.end, props.date)
    if (gapStartPct > cursorPct) {
      segs.push({
        type: 'active',
        leftPct: ((cursorPct - startPct) / barWidth.value) * 100,
        widthPct: ((gapStartPct - cursorPct) / barWidth.value) * 100,
      })
    }
    segs.push({
      type: 'idle',
      leftPct: ((gapStartPct - startPct) / barWidth.value) * 100,
      widthPct: ((gapEndPct - gapStartPct) / barWidth.value) * 100,
    })
    cursorPct = gapEndPct
  }
  if (endPct > cursorPct) {
    segs.push({
      type: 'active',
      leftPct: ((cursorPct - startPct) / barWidth.value) * 100,
      widthPct: ((endPct - cursorPct) / barWidth.value) * 100,
    })
  }
  return segs
})

/** Session label using ticket -> branch -> summary -> sessionId fallback chain */
const label = computed(() => {
  if (props.session.ticket) return props.session.ticket
  if (props.session.branch) return props.session.branch
  if (props.session.summary) {
    const words = props.session.summary.split(/\s+/).slice(0, 5).join(' ')
    return words.length < props.session.summary.length ? words + '...' : words
  }
  return props.session.sessionId.slice(0, 8)
})
</script>

<style scoped>
.gantt-bar {
  position: absolute;
  height: 28px;
  min-width: 4px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}

.gantt-bar:hover {
  opacity: 0.85;
}

.gantt-bar.selected {
  box-shadow: 0 0 0 2px var(--color-primary, #4e9af1);
  z-index: 2;
}

.bar-segment {
  position: absolute;
  top: 0;
  height: 100%;
}

.bar-segment.active {
  background: var(--bar-color);
}

.bar-segment.idle {
  background: var(--bar-color);
  opacity: 0.25;
}

.bar-label {
  position: relative;
  z-index: 1;
  padding: 0 var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: #fff;
  line-height: 28px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
</style>
