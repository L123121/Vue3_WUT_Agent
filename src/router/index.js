import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    redirect: '/chat'
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('../views/AIChat.vue')
  },
  {
    path: '/knowledge',
    name: 'Knowledge',
    component: () => import('../views/KnowledgeBase.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/chat'
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
