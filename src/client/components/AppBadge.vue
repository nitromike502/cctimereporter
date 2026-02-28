<template>
  <span class="app-badge" :class="`variant-${variant}`">
    <slot />
  </span>
</template>

<script setup>
/**
 * AppBadge — inline tag/badge component for status or category labels.
 *
 * @prop {string} variant - Color variant: 'default' | 'success' | 'danger' | 'muted'
 */
defineProps({
  /** Color coding variant */
  variant: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'success', 'danger', 'muted'].includes(v),
  },
})
</script>

<style scoped>
.app-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--spacing-sm);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-xs);
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

/* --- Variants --- */
.variant-default {
  background: color-mix(in srgb, var(--color-primary) 20%, transparent);
  color: var(--color-navy);
}

.variant-success {
  background: color-mix(in srgb, var(--color-success) 15%, transparent);
  color: var(--color-success);
}

.variant-danger {
  background: color-mix(in srgb, var(--color-danger) 15%, transparent);
  color: var(--color-danger);
}

.variant-muted {
  background: var(--color-bg-secondary);
  color: var(--color-muted);
}
</style>
