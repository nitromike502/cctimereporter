import { createRouter, createWebHistory } from 'vue-router'
import ComponentsPage from '../pages/ComponentsPage.vue'
import TimelinePage from '../pages/TimelinePage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/components', component: ComponentsPage },
    { path: '/timeline', component: TimelinePage },
    { path: '/', redirect: '/timeline' },
  ]
})
