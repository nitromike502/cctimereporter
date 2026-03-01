<template>
  <div class="gantt-chart">
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
      <!-- Grid overlay: positioned over the bar area (after 140px labels) -->
      <div class="grid-overlay">
        <div
          v-for="tick in timeAxisTicks"
          :key="'grid-' + tick.pct"
          class="grid-line"
          :style="{ left: tick.pct + '%' }"
        />
      </div>

      <!-- Project swim lanes with labels -->
      <div v-for="project in projects" :key="project.projectId" class="lane-row">
        <div class="lane-label" :title="project.displayName">{{ project.displayName }}</div>
        <div class="lane-bars">
          <GanttSwimlane
            :sessions="project.sessions"
            :date="date"
            :color="project.color"
            :selected-session-id="selectedSessionId"
            @select="emit('select', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import GanttSwimlane from './GanttSwimlane.vue'

/**
 * GanttChart — the main timeline canvas.
 *
 * Renders a 24h horizontal time axis with tick marks and one GanttSwimlane
 * per project. Forwards selectedSessionId to swimlanes and emits select events.
 *
 * @prop {Array}  projects          - Array of { projectId, displayName, color, sessions } objects
 * @prop {string} date              - YYYY-MM-DD date string
 * @prop {string} selectedSessionId - Session ID of the currently selected bar (or null)
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
})

const emit = defineEmits(['select'])

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
  overflow: hidden;
  padding-right: 10px;
}

.time-axis {
  position: relative;
  height: 28px;
  border-bottom: 1px solid var(--color-border);
  margin-left: 140px;
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
  left: 140px;
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

.lane-row {
  display: flex;
  min-height: 44px;
}

.lane-label {
  width: 140px;
  flex-shrink: 0;
  padding: var(--spacing-sm) var(--spacing-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-heading);
  border-right: 1px solid var(--color-border);
  display: flex;
  align-items: flex-start;
  padding-top: var(--spacing-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lane-bars {
  flex: 1;
  position: relative;
}
</style>
