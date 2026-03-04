import { ref, watch } from 'vue'

/**
 * useTheme — shared dark mode state and toggle function.
 *
 * Module-level singletons ensure all consumers share the same reactive state.
 * The initial value is read from the data-theme attribute set by the FOWT
 * prevention inline script in index.html.
 *
 * @returns {{ isDark: import('vue').Ref<boolean>, toggle: () => void }}
 */
const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark')

watch(isDark, (val) => {
  const theme = val ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('cctimereporter:theme', theme)
})

export function useTheme() {
  function toggle() {
    isDark.value = !isDark.value
  }

  return { isDark, toggle }
}
