<template>
  <ProgressRoot
    class="progress-root"
    :value="indeterminate ? null : value"
    :max="max"
  >
    <ProgressIndicator
      class="progress-indicator"
      :class="{ 'is-indeterminate': indeterminate }"
      :style="indeterminate ? undefined : { transform: `translateX(-${100 - (value / max) * 100}%)` }"
    />
  </ProgressRoot>
</template>

<script setup>
import { ProgressRoot, ProgressIndicator } from 'reka-ui'

/**
 * AppProgressBar — accessible progress bar wrapping Reka UI primitives.
 *
 * @prop {number}  value         - Current progress value (0 to max)
 * @prop {number}  max           - Maximum value (default: 100)
 * @prop {boolean} indeterminate - Show animated indeterminate state (ignores value)
 */
defineProps({
  /** Current progress value */
  value: {
    type: Number,
    default: 0,
  },
  /** Maximum possible value */
  max: {
    type: Number,
    default: 100,
  },
  /** Show indeterminate loading animation */
  indeterminate: {
    type: Boolean,
    default: false,
  },
})
</script>

<style scoped>
.progress-root {
  width: 100%;
  height: 8px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.progress-indicator {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-lg);
  transition: transform var(--transition-normal);
}

/* Indeterminate sliding animation */
.progress-indicator.is-indeterminate {
  width: 40%;
  animation: indeterminate 1.4s ease-in-out infinite;
}

@keyframes indeterminate {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
</style>
