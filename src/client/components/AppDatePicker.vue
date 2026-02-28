<template>
  <div class="datepicker-wrapper">
    <VueDatePicker
      v-model="model"
      :disabled="disabled"
      :placeholder="placeholder"
      auto-apply
      :enable-time-picker="false"
      :dark="isDark"
    />
  </div>
</template>

<script setup>
/**
 * AppDatePicker — date picker wrapping @vuepic/vue-datepicker with design token overrides.
 *
 * @prop {Date|String|null} modelValue - The selected date
 * @prop {boolean} disabled - Disables the picker
 * @prop {string} placeholder - Placeholder text when no date is selected
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'

const props = defineProps({
  /** The selected date value */
  modelValue: {
    type: [Date, String],
    default: null,
  },
  /** Disables the date picker */
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Placeholder text when no date selected */
  placeholder: {
    type: String,
    default: 'Select date',
  },
})

const emit = defineEmits(['update:modelValue'])

/** Two-way bound model value */
const model = ref(props.modelValue)

/** Dark mode detection via matchMedia */
const isDark = ref(false)

let mediaQuery = null

function handleThemeChange(e) {
  isDark.value = e.matches
}

onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  isDark.value = mediaQuery.matches
  mediaQuery.addEventListener('change', handleThemeChange)
})

onUnmounted(() => {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', handleThemeChange)
  }
})
</script>

<!-- Non-scoped: must penetrate @vuepic/vue-datepicker internal DOM -->
<style>
.dp__theme_light {
  --dp-primary-color:      var(--color-primary);
  --dp-primary-text-color: var(--color-navy);
  --dp-hover-color:        color-mix(in srgb, var(--color-primary) 25%, transparent);
  --dp-hover-text-color:   var(--color-heading);
  --dp-border-color:       var(--color-border);
  --dp-background-color:   var(--color-bg);
  --dp-text-color:         var(--color-body-text);
  --dp-border-radius:      var(--radius-md);
  --dp-font-family:        var(--font-family);
  --dp-font-size:          var(--font-size-sm);
}

.dp__theme_dark {
  --dp-primary-color:      var(--color-primary);
  --dp-primary-text-color: var(--color-navy);
  --dp-hover-color:        color-mix(in srgb, var(--color-primary) 25%, transparent);
  --dp-hover-text-color:   var(--color-heading);
  --dp-border-color:       var(--color-border);
  --dp-background-color:   var(--color-bg);
  --dp-text-color:         var(--color-body-text);
  --dp-border-radius:      var(--radius-md);
  --dp-font-family:        var(--font-family);
  --dp-font-size:          var(--font-size-sm);
}
</style>

<style scoped>
.datepicker-wrapper {
  max-width: 280px;
}
</style>
