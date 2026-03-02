<template>
  <div class="number-stepper" :class="{ 'is-focused': focused }">
    <button
      class="stepper-btn decrement"
      type="button"
      :disabled="modelValue <= min"
      :aria-label="`Decrease ${label}`"
      @click="decrement"
    >−</button>
    <input
      ref="inputEl"
      type="text"
      class="stepper-value"
      inputmode="numeric"
      :value="modelValue"
      :aria-label="label"
      :aria-valuenow="modelValue"
      :aria-valuemin="min"
      :aria-valuemax="max"
      role="spinbutton"
      @focus="focused = true"
      @blur="onBlur"
      @keydown="onKeydown"
      @change="onInput"
    />
    <button
      class="stepper-btn increment"
      type="button"
      :disabled="modelValue >= max"
      :aria-label="`Increase ${label}`"
      @click="increment"
    >+</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: Number, required: true },
  min: { type: Number, default: 1 },
  max: { type: Number, default: 60 },
  step: { type: Number, default: 1 },
  label: { type: String, default: 'Value' },
})

const emit = defineEmits(['update:modelValue'])
const focused = ref(false)
const inputEl = ref(null)

function clamp(n) {
  return Math.max(props.min, Math.min(props.max, n))
}

function increment() {
  emit('update:modelValue', clamp(props.modelValue + props.step))
}

function decrement() {
  emit('update:modelValue', clamp(props.modelValue - props.step))
}

function onInput(e) {
  const n = parseInt(e.target.value, 10)
  emit('update:modelValue', isNaN(n) ? props.modelValue : clamp(n))
}

function onBlur(e) {
  focused.value = false
  // Reset display if user typed something invalid
  const n = parseInt(e.target.value, 10)
  if (isNaN(n)) e.target.value = props.modelValue
}

function onKeydown(e) {
  if (e.key === 'ArrowUp') { e.preventDefault(); increment() }
  else if (e.key === 'ArrowDown') { e.preventDefault(); decrement() }
  else if (e.key === 'Home') { e.preventDefault(); emit('update:modelValue', props.min) }
  else if (e.key === 'End') { e.preventDefault(); emit('update:modelValue', props.max) }
}
</script>

<style scoped>
.number-stepper {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  overflow: hidden;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.number-stepper.is-focused {
  border-color: var(--color-link);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-link) 20%, transparent);
}

.stepper-btn {
  flex: 0 0 28px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--color-bg-secondary);
  color: var(--color-body-text);
  font-size: 16px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.stepper-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-link) 15%, var(--color-bg-secondary));
  color: var(--color-link);
}

.stepper-btn:active:not(:disabled) {
  background: color-mix(in srgb, var(--color-link) 25%, var(--color-bg-secondary));
}

.stepper-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.stepper-btn.decrement {
  border-right: 1px solid var(--color-border);
}

.stepper-btn.increment {
  border-left: 1px solid var(--color-border);
}

.stepper-value {
  width: 32px;
  min-width: 32px;
  max-width: 32px;
  height: 34px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-heading);
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-align: center;
  outline: none;
  -moz-appearance: textfield;
}

.stepper-value::-webkit-outer-spin-button,
.stepper-value::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
