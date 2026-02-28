<template>
  <TooltipProvider :delay-duration="300">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <!-- Trigger element passed via default slot -->
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          class="tooltip-content"
          :side="side"
          :side-offset="6"
        >
          {{ content }}
          <TooltipArrow class="tooltip-arrow" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<script setup>
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
  TooltipArrow,
} from 'reka-ui'

/**
 * AppTooltip — accessible tooltip wrapping Reka UI primitives.
 *
 * Usage:
 *   <AppTooltip content="Helpful text">
 *     <button>Hover me</button>
 *   </AppTooltip>
 *
 * @prop {string} content - Text content displayed inside the tooltip
 * @prop {string} side    - Preferred placement: 'top' | 'bottom' | 'left' | 'right'
 */
defineProps({
  /** Tooltip text content */
  content: {
    type: String,
    required: true,
  },
  /** Preferred side relative to trigger */
  side: {
    type: String,
    default: 'top',
    validator: (v) => ['top', 'bottom', 'left', 'right'].includes(v),
  },
})
</script>

<style scoped>
.tooltip-content {
  background: var(--color-navy);
  color: #fff;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
  line-height: 1.4;
  max-width: 250px;
  z-index: 1000;
  /* Animate in/out via Reka UI data attributes */
  opacity: 1;
  transition: opacity var(--transition-fast);
}

.tooltip-content[data-state="delayed-open"] {
  opacity: 1;
}

.tooltip-content[data-state="closed"] {
  opacity: 0;
}

.tooltip-arrow {
  fill: var(--color-navy);
}
</style>
