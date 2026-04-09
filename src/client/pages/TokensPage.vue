<template>
  <div class="tokens-page">
    <TimelineToolbar
      :date="selectedDate"
      :import-running="false"
      @navigate="navigateToDate"
    />

    <div v-if="loading" class="tokens-loading">
      Loading token data&hellip;
    </div>

    <div v-else-if="error" class="tokens-error">
      <span>Error: {{ error }}</span>
      <AppButton variant="ghost" size="sm" @click="fetchTokenData">Retry</AppButton>
    </div>

    <div v-else-if="!tokensData || tokensData.sessions.length === 0" class="tokens-empty">
      <p>No token data for <strong>{{ selectedDate }}</strong>.</p>
      <p class="tokens-empty-hint">Try navigating to a different date, or re-import sessions.</p>
    </div>

    <div v-else class="tokens-content">
      <!-- Chart and controls will be added in Plan 35-02 -->
      <p>{{ tokensData.sessions.length }} sessions with token data</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TimelineToolbar from '../components/TimelineToolbar.vue'
import AppButton from '../components/AppButton.vue'

// --- Router ---

const route = useRoute()
const router = useRouter()

// --- State ---

const tokensData = ref(null)
const loading = ref(false)
const error = ref(null)

// --- Date management (URL-synced, mirrors TimelinePage) ---

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const selectedDate = computed(() => route.query.date ?? todayStr())

function navigateToDate(dateStr) {
  router.push({ path: '/tokens', query: { date: dateStr } })
}

// --- Data fetching ---

async function fetchTokenData() {
  loading.value = true
  error.value = null
  tokensData.value = null
  try {
    const res = await fetch(`/api/tokens?date=${selectedDate.value}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    tokensData.value = data
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// --- Lifecycle ---

onMounted(fetchTokenData)
watch(() => route.query.date, fetchTokenData)
</script>

<style scoped>
.tokens-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.tokens-loading {
  padding: var(--spacing-xl) var(--spacing-lg);
  color: var(--color-muted);
  text-align: center;
  font-size: var(--font-size-base);
}

.tokens-error {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: color-mix(in srgb, var(--color-danger, #e05c5c) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-danger, #e05c5c) 30%, transparent);
  color: var(--color-danger, #e05c5c);
  font-size: var(--font-size-sm);
}

.tokens-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl);
  color: var(--color-muted);
  text-align: center;
}

.tokens-empty strong {
  color: var(--color-heading);
}

.tokens-empty-hint {
  font-size: var(--font-size-sm);
  opacity: 0.7;
}

.tokens-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  flex: 1;
}
</style>
