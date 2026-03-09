<template>
  <DialogRoot :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="modal-overlay" />
      <DialogContent class="modal-content">
        <DialogTitle class="modal-title">
          Session Messages
          <span v-if="totalCount > 0" class="modal-title-count">{{ totalCount }} messages with text</span>
        </DialogTitle>
        <DialogDescription class="sr-only">
          First and last messages from this session
        </DialogDescription>

        <button class="modal-close" @click="$emit('update:open', false)" aria-label="Close">
          &times;
        </button>

        <div v-if="loading" class="modal-loading">Loading messages&hellip;</div>
        <div v-else-if="error" class="modal-error">{{ error }}</div>
        <div v-else-if="messages.length === 0" class="modal-empty">No messages found.</div>
        <div v-else class="modal-messages">
          <div
            v-for="(msg, i) in firstMessages"
            :key="'first-' + i"
            class="message-item"
            :class="`message-item--${msg.role}`"
          >
            <span class="message-role">{{ msg.role === 'user' ? 'User' : 'Assistant' }}</span>
            <pre
              :ref="setContentRef('first-' + i)"
              class="message-content"
              :class="{ 'message-content--collapsed': !expandedMessages['first-' + i] }"
            >{{ truncateContent(formatContent(msg), expandedMessages['first-' + i]) }}</pre>
            <button
              v-if="isOverflow('first-' + i, formatContent(msg))"
              class="message-expand"
              @click="expandedMessages['first-' + i] = !expandedMessages['first-' + i]"
            >{{ expandedMessages['first-' + i] ? 'Show less' : 'Show more' }}</button>
          </div>

          <div v-if="skipped > 0" class="message-divider">
            <span class="divider-text">{{ skipped }} messages skipped</span>
          </div>

          <div
            v-for="(msg, i) in lastMessages"
            :key="'last-' + i"
            class="message-item"
            :class="`message-item--${msg.role}`"
          >
            <span class="message-role">{{ msg.role === 'user' ? 'User' : 'Assistant' }}</span>
            <pre
              :ref="setContentRef('last-' + i)"
              class="message-content"
              :class="{ 'message-content--collapsed': !expandedMessages['last-' + i] }"
            >{{ truncateContent(formatContent(msg), expandedMessages['last-' + i]) }}</pre>
            <button
              v-if="isOverflow('last-' + i, formatContent(msg))"
              class="message-expand"
              @click="expandedMessages['last-' + i] = !expandedMessages['last-' + i]"
            >{{ expandedMessages['last-' + i] ? 'Show less' : 'Show more' }}</button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onBeforeUpdate } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from 'reka-ui'
import { cleanUserMessage } from '../../utils/parse-command-xml.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  sessionId: { type: String, default: '' },
})

defineEmits(['update:open'])

const messages = ref([])
const totalCount = ref(0)
const skipped = ref(0)
const loading = ref(false)
const error = ref(null)

const HEAD_COUNT = 10
const MAX_COLLAPSED_CHARS = 2000
const expandedMessages = reactive({})
const overflowMessages = reactive({})

// Template refs for message content elements
const contentRefs = ref({})
function setContentRef(key) {
  return (el) => {
    if (el) {
      contentRefs.value[key] = el
    }
  }
}

// After messages render, check which ones overflow their 300px max-height
function detectOverflows() {
  nextTick(() => {
    for (const [key, el] of Object.entries(contentRefs.value)) {
      overflowMessages[key] = el.scrollHeight > el.clientHeight
    }
  })
}

const firstMessages = computed(() => {
  if (skipped.value === 0) return messages.value
  return messages.value.slice(0, HEAD_COUNT)
})

const lastMessages = computed(() => {
  if (skipped.value === 0) return []
  return messages.value.slice(HEAD_COUNT)
})

function formatContent(msg) {
  if (msg.role === 'user') {
    return cleanUserMessage(msg.content)
  }
  return msg.content
}

function isOverflow(key, text) {
  // Show button if DOM element overflows OR text exceeds hard cap
  return overflowMessages[key] || (text && text.length > MAX_COLLAPSED_CHARS)
}

function truncateContent(text, expanded) {
  if (!text || expanded || text.length <= MAX_COLLAPSED_CHARS) return text
  return text.slice(0, MAX_COLLAPSED_CHARS) + '...'
}

watch(
  () => [props.open, props.sessionId],
  async ([isOpen, id]) => {
    if (!isOpen || !id) return
    loading.value = true
    error.value = null
    messages.value = []
    totalCount.value = 0
    skipped.value = 0
    Object.keys(expandedMessages).forEach(k => delete expandedMessages[k])
    Object.keys(overflowMessages).forEach(k => delete overflowMessages[k])
    contentRefs.value = {}
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/messages`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      messages.value = data.messages
      totalCount.value = data.totalCount ?? data.messages.length
      skipped.value = data.skipped ?? 0
      detectOverflows()
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
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
}

.modal-title-count {
  font-size: var(--font-size-xs);
  font-weight: 400;
  color: var(--color-muted);
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
}

.message-item--user {
  background: var(--color-bg-secondary);
}

.message-item--assistant {
  background: var(--color-bg);
}

.message-role {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-muted);
  padding: var(--spacing-xs) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: color-mix(in srgb, var(--color-bg-secondary) 50%, var(--color-bg));
}

.message-item--user .message-role {
  color: var(--color-link);
  background: color-mix(in srgb, var(--color-bg-secondary) 70%, var(--color-bg));
}

.message-content {
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: var(--color-body-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: var(--spacing-sm) var(--spacing-md);
  line-height: 1.5;
}

.message-content--collapsed {
  max-height: 300px;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, black 240px, transparent 300px);
  mask-image: linear-gradient(to bottom, black 240px, transparent 300px);
}

.message-expand {
  display: block;
  width: 100%;
  padding: var(--spacing-xs) var(--spacing-md);
  background: none;
  border: none;
  border-top: 1px solid var(--color-border);
  color: var(--color-link);
  font-size: var(--font-size-xs);
  cursor: pointer;
  text-align: center;
}

.message-expand:hover {
  background: var(--color-bg-secondary);
}

.message-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-sm) 0;
}

.divider-text {
  font-size: var(--font-size-xs);
  color: var(--color-muted);
  white-space: nowrap;
  padding: var(--spacing-xs) var(--spacing-md);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  width: 100%;
  text-align: center;
}
</style>
