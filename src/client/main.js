import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router/index.js'
import './styles/tokens.css'
import 'driver.js/dist/driver.css'
import './styles/driver-overrides.css'

createApp(App).use(router).mount('#app')
