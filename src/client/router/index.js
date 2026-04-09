import { createRouter, createWebHistory } from 'vue-router'
import ComponentsPage from '../pages/ComponentsPage.vue'
import TimelinePage from '../pages/TimelinePage.vue'

const TokensPage = () => import('../pages/TokensPage.vue')

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/components', component: ComponentsPage },
    { path: '/timeline', component: TimelinePage },
    { path: '/tokens', component: TokensPage },
    { path: '/', redirect: '/timeline' },
  ]
})
