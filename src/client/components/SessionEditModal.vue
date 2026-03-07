<template>
  <DialogRoot :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="modal-overlay" />
      <DialogContent class="modal-content">
        <DialogTitle class="modal-title">Edit Session</DialogTitle>
        <DialogDescription class="sr-only">
          Edit session name and ticket ID
        </DialogDescription>

        <button class="modal-close" @click="$emit('update:open', false)" aria-label="Close">
          &times;
        </button>

        <form class="edit-form" @submit.prevent="save">
          <div class="form-field">
            <label for="edit-name">Session Name</label>
            <div class="input-wrapper">
              <input
                id="edit-name"
                v-model="nameValue"
                :disabled="nameReadOnly"
                :placeholder="namePlaceholder"
                type="text"
              />
              <button
                v-if="nameValue && !nameReadOnly"
                type="button"
                class="clear-btn"
                @click="nameValue = ''"
                aria-label="Clear name"
              >&times;</button>
            </div>
            <span v-if="nameReadOnly" class="field-note">Named in Claude Code</span>
          </div>

          <div class="form-field">
            <label for="edit-ticket">Ticket ID</label>
            <div class="input-wrapper">
              <input
                id="edit-ticket"
                v-model="ticketValue"
                :placeholder="ticketPlaceholder"
                type="text"
              />
              <button
                v-if="ticketValue"
                type="button"
                class="clear-btn"
                @click="ticketValue = ''"
                aria-label="Clear ticket"
              >&times;</button>
            </div>
          </div>

          <p class="persistence-notice">Changes are local to CC Time Reporter and do not persist to Claude Code.</p>

          <div class="cli-command">
            <code>claude --session-id {{ session?.sessionId }}</code>
            <button type="button" @click="copyCommand" class="copy-btn">{{ copied ? 'Copied!' : 'Copy' }}</button>
          </div>

          <button type="submit" class="save-btn">Save</button>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from 'reka-ui'

const props = defineProps({
  open: { type: Boolean, default: false },
  session: { type: Object, default: null },
})

const emit = defineEmits(['update:open', 'saved'])

const nameValue = ref('')
const ticketValue = ref('')
const copied = ref(false)

/** Read-only when Claude Code named it AND user hasn't set a custom name */
const nameReadOnly = computed(() =>
  !!(props.session?.summary && !props.session?.userLabel)
)

const namePlaceholder = computed(() =>
  props.session?.customTitle || props.session?.ticket || props.session?.branch || 'Session name'
)

const ticketPlaceholder = computed(() =>
  props.session?.ticket || 'e.g. PROJ-123'
)

function copyCommand() {
  const text = `claude --session-id ${props.session?.sessionId}`
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
  } else {
    fallbackCopy(text)
  }
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

async function save() {
  const res = await fetch(`/api/sessions/${encodeURIComponent(props.session.sessionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userLabel: nameValue.value || null,
      userTicket: ticketValue.value || null,
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  emit('saved', { userLabel: nameValue.value || null, userTicket: ticketValue.value || null })
  emit('update:open', false)
}

// Reset form values when modal opens or session changes
watch(
  [() => props.open, () => props.session],
  ([isOpen, session]) => {
    if (!isOpen || !session) return
    nameValue.value = session.userLabel ?? ''
    ticketValue.value = session.userTicket ?? ''
    copied.value = false
  }
)
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.modal-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  width: min(480px, 90vw);
  z-index: 101;
}

.modal-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-heading);
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  margin: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.modal-close {
  position: absolute;
  top: var(--spacing-sm);
  right: var(--spacing-sm);
  background: none;
  border: none;
  font-size: var(--font-size-xl);
  color: var(--color-muted);
  cursor: pointer;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  line-height: 1;
}

.modal-close:hover {
  background: var(--color-bg-secondary);
  color: var(--color-heading);
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-field label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-heading);
}

.input-wrapper {
  position: relative;
}

.form-field input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-sm);
  padding-right: var(--spacing-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-body-text);
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
  box-sizing: border-box;
}

.form-field input:focus {
  outline: none;
  border-color: var(--color-link);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-link) 20%, transparent);
}

.form-field input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.clear-btn {
  position: absolute;
  right: var(--spacing-xs);
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--color-muted);
  cursor: pointer;
  font-size: var(--font-size-lg);
  line-height: 1;
  padding: 2px 4px;
}

.clear-btn:hover {
  color: var(--color-heading);
}

.field-note {
  font-size: var(--font-size-xs);
  font-style: italic;
  color: var(--color-muted);
}

.persistence-notice {
  font-size: var(--font-size-xs);
  font-style: italic;
  color: var(--color-muted);
  margin: 0;
}

.cli-command {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
}

.cli-command code {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-body-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-btn {
  flex-shrink: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-xs);
  font-family: var(--font-family);
  color: var(--color-body-text);
  cursor: pointer;
}

.copy-btn:hover {
  background: var(--color-bg-secondary);
}

.save-btn {
  width: 100%;
  padding: var(--spacing-sm);
  background: var(--color-link);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: 500;
  font-family: var(--font-family);
  cursor: pointer;
}

.save-btn:hover {
  opacity: 0.9;
}
</style>
