<template>
  <DialogRoot :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="modal-overlay" />
      <DialogContent class="modal-content">
        <DialogTitle class="modal-title">Session Messages</DialogTitle>
        <DialogDescription class="sr-only">
          First messages from this session
        </DialogDescription>

        <button class="modal-close" @click="$emit('update:open', false)" aria-label="Close">
          &times;
        </button>

        <div v-if="loading" class="modal-loading">Loading messages&hellip;</div>
        <div v-else-if="error" class="modal-error">{{ error }}</div>
        <div v-else-if="messages.length === 0" class="modal-empty">No messages found.</div>
        <div v-else class="modal-messages">
          <div
            v-for="(msg, i) in messages"
            :key="i"
            class="message-item"
            :class="`message-item--${msg.role}`"
          >
            <span class="message-role">{{ msg.role === 'user' ? 'User' : 'Assistant' }}</span>
            <pre class="message-content">{{ msg.content }}</pre>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup>
import { ref, watch } from 'vue'
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
  sessionId: { type: String, default: '' },
})

defineEmits(['update:open'])

const messages = ref([])
const loading = ref(false)
const error = ref(null)

watch(
  () => [props.open, props.sessionId],
  async ([isOpen, id]) => {
    if (!isOpen || !id) return
    loading.value = true
    error.value = null
    messages.value = []
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/messages`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      messages.value = data.messages
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
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
  width: min(720px, 90vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
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

.modal-loading,
.modal-empty {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
}

.modal-error {
  padding: var(--spacing-md);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.modal-messages {
  overflow-y: auto;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.message-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
}

.message-item--user {
  background: var(--color-bg-secondary);
}

.message-item--assistant {
  background: var(--color-bg);
}

.message-role {
  display: inline-block;
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-muted);
  margin-bottom: var(--spacing-xs);
}

.message-item--user .message-role {
  color: var(--color-link);
}

.message-content {
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: var(--color-body-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  line-height: 1.5;
  max-height: 200px;
  overflow-y: auto;
}
</style>
