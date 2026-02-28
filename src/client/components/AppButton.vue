<template>
  <button
    class="app-button"
    :class="[`variant-${variant}`, `size-${size}`]"
    :disabled="disabled || loading"
    :aria-disabled="disabled || loading ? 'true' : undefined"
    v-bind="$attrs"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<script setup>
/**
 * AppButton — primary interactive button component.
 *
 * @prop {string} variant - Visual style: 'primary' | 'secondary' | 'ghost'
 * @prop {string} size    - Size scale: 'sm' | 'md' | 'lg'
 * @prop {boolean} disabled - Disables the button and prevents interaction
 * @prop {boolean} loading  - Shows inline spinner and disables the button
 */
defineProps({
  /** Visual style variant */
  variant: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'secondary', 'ghost'].includes(v),
  },
  /** Size scale */
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg'].includes(v),
  },
  /** Disables the button */
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Shows a loading spinner and disables interaction */
  loading: {
    type: Boolean,
    default: false,
  },
})
</script>

<style scoped>
.app-button {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-family);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast), opacity var(--transition-fast);
  line-height: 1.25;
  white-space: nowrap;
  text-decoration: none;
}

/* --- Variants --- */
.variant-primary {
  background: var(--color-primary);
  color: var(--color-navy);
}
.variant-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary) 85%, var(--color-navy));
}

.variant-secondary {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  color: var(--color-body-text);
}
.variant-secondary:hover:not(:disabled) {
  background: var(--color-bg);
  border-color: var(--color-muted);
}

.variant-ghost {
  background: transparent;
  color: var(--color-link);
}
.variant-ghost:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-link) 10%, transparent);
}

/* --- Sizes --- */
.size-sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
}
.size-md {
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-base);
}
.size-lg {
  padding: var(--spacing-sm) var(--spacing-lg);
  font-size: var(--font-size-lg);
}

/* --- Disabled / Loading --- */
.app-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* --- Spinner --- */
.spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 600ms linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
