<template>
  <div class="toolbar">
    <!-- Left group: Navigation buttons + current date display -->
    <div class="nav-group">
      <AppButton variant="ghost" size="sm" @click="emit('navigate', addDays(date, -1))">&larr; Prev</AppButton>
      <AppButton variant="secondary" size="sm" @click="emit('navigate', yesterdayStr())">Yesterday</AppButton>
      <AppButton variant="secondary" size="sm" @click="emit('navigate', todayStr())">Today</AppButton>
      <AppButton variant="ghost" size="sm" :disabled="date >= todayStr()" @click="emit('navigate', addDays(date, 1))">Next &rarr;</AppButton>
      <span class="date-display">{{ formatDate(date) }}</span>
    </div>

    <!-- Right group: Theme toggle + Threshold + DatePicker + Import -->
    <div class="right-group">
      <button
        class="theme-toggle"
        type="button"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggle"
      >
        <!-- Sun icon: shown in dark mode -->
        <svg v-if="isDark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <!-- Moon icon: shown in light mode -->
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>
      <div class="threshold-control">
        <span class="threshold-label">Idle Minutes</span>
        <button
          class="info-btn"
          type="button"
          aria-label="What is idle minutes?"
          @click="showIdleInfo = !showIdleInfo"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 7v4M8 5.5v-.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <NumberStepper
          :model-value="threshold"
          :min="1"
          :max="60"
          label="Idle threshold in minutes"
          @update:model-value="$emit('update:threshold', $event)"
        />
      </div>
      <!-- Info popover -->
      <div v-if="showIdleInfo" class="info-popover">
        <div class="info-popover-header">
          <strong>Idle Threshold</strong>
          <button class="info-close" type="button" aria-label="Close" @click="showIdleInfo = false">&times;</button>
        </div>
        <p>Controls the maximum gap (in minutes) between consecutive messages that still counts as <em>working time</em>.</p>
        <p>Gaps longer than this value are treated as idle breaks and excluded from the working time total. Shorter gaps are assumed to be active work (thinking, reading, reviewing).</p>
        <div class="info-examples">
          <span class="info-example"><strong>5 min</strong> &mdash; strict, only rapid exchanges</span>
          <span class="info-example"><strong>10 min</strong> &mdash; default, balanced</span>
          <span class="info-example"><strong>20+ min</strong> &mdash; generous, includes longer pauses</span>
        </div>
      </div>
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
import { computed, ref } from 'vue'
import { useTheme } from '../composables/useTheme.js'
import AppButton from './AppButton.vue'
import AppDatePicker from './AppDatePicker.vue'
import AppProgressBar from './AppProgressBar.vue'
import NumberStepper from './NumberStepper.vue'

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
  /** Idle threshold in minutes */
  threshold: {
    type: Number,
    default: 10,
  },
})

const emit = defineEmits(['navigate', 'import', 'update:threshold'])

const { isDark, toggle } = useTheme()

const showIdleInfo = ref(false)

// Local picker Date object derived from props.date (for display only)
const pickerDate = computed(() => {
  if (!props.date) return null
  return new Date(props.date + 'T12:00:00')
})

function onDatePicked(val) {
  if (!val) return
  const d = val instanceof Date ? val : new Date(val)
  const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  emit('navigate', str)
}

// --- Date arithmetic helpers ---

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00') // noon avoids DST edge cases
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  position: relative;
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

.threshold-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.threshold-label {
  font-size: var(--font-size-sm);
  color: var(--color-muted);
  white-space: nowrap;
}

.info-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.info-btn:hover {
  color: var(--color-link);
  background: color-mix(in srgb, var(--color-link) 10%, transparent);
}

.info-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 320px;
  padding: var(--spacing-md);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  z-index: 100;
  font-size: var(--font-size-sm);
  color: var(--color-body-text);
  line-height: 1.5;
}

.info-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
  color: var(--color-heading);
  font-size: var(--font-size-base);
}

.info-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  font-size: 18px;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.info-close:hover {
  background: var(--color-bg-secondary);
  color: var(--color-heading);
}

.info-popover p {
  margin: 0 0 var(--spacing-sm) 0;
}

.info-popover p:last-of-type {
  margin-bottom: var(--spacing-md);
}

.info-examples {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}

.info-example strong {
  color: var(--color-heading);
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
  flex-shrink: 0;
}

.theme-toggle:hover {
  color: var(--color-heading);
  background: var(--color-bg);
  border-color: var(--color-muted);
}
</style>
