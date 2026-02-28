<template>
  <div class="gantt-legend">
    <div v-for="project in projects" :key="project.displayName" class="legend-item">
      <span class="legend-swatch" :style="{ background: project.color }" />
      <span class="legend-label">{{ project.displayName }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * GanttLegend — floating legend box mapping project colors to display names.
 *
 * @prop {Array} projects - Array of { displayName, color } objects
 */
defineProps({
  projects: {
    type: Array,
    required: true,
  },
})
</script>

<style scoped>
.gantt-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm) var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.legend-label {
  font-size: var(--font-size-sm);
  color: var(--color-body-text);
}
</style>
