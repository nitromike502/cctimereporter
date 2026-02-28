<template>
  <label class="app-checkbox" :class="{ 'is-disabled': disabled }">
    <CheckboxRoot
      class="checkbox-root"
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <CheckboxIndicator class="checkbox-indicator">
        <!-- Checkmark SVG -->
        <svg
          width="10"
          height="8"
          viewBox="0 0 10 8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </CheckboxIndicator>
    </CheckboxRoot>
    <span v-if="label" class="checkbox-label">{{ label }}</span>
  </label>
</template>

<script setup>
import { CheckboxRoot, CheckboxIndicator } from 'reka-ui'

/**
 * AppCheckbox — accessible checkbox wrapping Reka UI primitives.
 *
 * @prop {boolean} modelValue - Bound value (v-model)
 * @prop {string}  label      - Optional text label rendered next to the checkbox
 * @prop {boolean} disabled   - Prevents interaction
 */
defineProps({
  /** Bound checked state (v-model) */
  modelValue: {
    type: Boolean,
    default: false,
  },
  /** Text label displayed next to the checkbox */
  label: {
    type: String,
    default: '',
  },
  /** Disables the checkbox */
  disabled: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
.app-checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
  user-select: none;
}

.app-checkbox.is-disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

/* The clickable box */
.checkbox-root {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast);
  cursor: pointer;
}

.checkbox-root[data-state="checked"] {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.checkbox-root[data-disabled] {
  cursor: not-allowed;
}

/* The checkmark SVG */
.checkbox-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-navy);
}

/* Label text */
.checkbox-label {
  color: var(--color-body-text);
  font-size: var(--font-size-base);
  font-family: var(--font-family);
  line-height: 1.4;
}
</style>
