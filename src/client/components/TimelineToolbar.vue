<template>
  <div class="toolbar">
    <!-- Left group: Navigation buttons + current date display -->
    <div class="nav-group">
      <AppButton variant="ghost" size="sm" @click="emit('navigate', addDays(date, -1))">&larr; Prev</AppButton>
      <AppButton variant="secondary" size="sm" @click="emit('navigate', todayStr())">Today</AppButton>
      <AppButton variant="secondary" size="sm" @click="emit('navigate', yesterdayStr())">Yesterday</AppButton>
      <AppButton variant="ghost" size="sm" :disabled="date >= todayStr()" @click="emit('navigate', addDays(date, 1))">Next &rarr;</AppButton>
      <span class="date-display">{{ formatDate(date) }}</span>
    </div>

    <!-- Right group: DatePicker + Import -->
    <div class="right-group">
      <AppDatePicker
        :model-value="pickerDate"
        placeholder="Jump to date..."
        @update:model-value="onDatePicked"
      />
      <div class="import-group">
        <AppButton
          variant="primary"
          size="sm"
          :loading="importRunning"
          @click="emit('import')"
        >Import</AppButton>
        <div v-if="importRunning" class="progress-container">
          <AppProgressBar :indeterminate="true" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AppButton from './AppButton.vue'
import AppDatePicker from './AppDatePicker.vue'
import AppProgressBar from './AppProgressBar.vue'

/**
 * TimelineToolbar — date navigation toolbar for the timeline page.
 *
 * @prop {string}  date          - Current YYYY-MM-DD date string
 * @prop {boolean} importRunning - Whether an import is in progress
 *
 * @emits navigate (dateStr: string) - User selected a date via any method
 * @emits import   ()                - User clicked the Import button
 */
const props = defineProps({
  /** Current date in YYYY-MM-DD format */
  date: {
    type: String,
    required: true,
  },
  /** Whether import is currently running */
  importRunning: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['navigate', 'import'])

// Local picker Date object derived from props.date (for display only)
const pickerDate = computed(() => {
  if (!props.date) return null
  return new Date(props.date + 'T12:00:00')
})

function onDatePicked(val) {
  if (!val) return
  const d = val instanceof Date ? val : new Date(val)
  const str = d.toISOString().slice(0, 10)
  emit('navigate', str)
}

// --- Date arithmetic helpers ---

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00') // noon avoids DST edge cases
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayStr() {
  return addDays(todayStr(), -1)
}
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.nav-group {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.date-display {
  font-weight: 600;
  font-size: var(--font-size-lg);
  color: var(--color-heading);
  margin-left: var(--spacing-xs);
}

.right-group {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-left: auto;
}

.import-group {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--spacing-xs);
}

.progress-container {
  width: 200px;
}
</style>
