<script setup lang="ts">
import { useToastStore, Toast } from '../../stores/toast.store'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-vue-next'

const store = useToastStore()

const getIcon = (type: Toast['type']) => {
  switch (type) {
    case 'success': return CheckCircle
    case 'error': return XCircle
    case 'warning': return AlertTriangle
    case 'info': return Info
  }
}

const getStyles = (type: Toast['type']) => {
  switch (type) {
    case 'success': return 'bg-white dark:bg-gray-800 border-green-500 text-green-600 dark:text-green-400'
    case 'error': return 'bg-white dark:bg-gray-800 border-red-500 text-red-600 dark:text-red-400'
    case 'warning': return 'bg-white dark:bg-gray-800 border-yellow-500 text-yellow-600 dark:text-yellow-400'
    case 'info': return 'bg-white dark:bg-gray-800 border-blue-500 text-blue-600 dark:text-blue-400'
  }
}
</script>

<template>
  <div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 w-full max-w-sm pointer-events-none px-4">
    <TransitionGroup 
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 -translate-y-4 scale-95"
    >
      <div 
        v-for="toast in store.toasts" 
        :key="toast.id"
        class="pointer-events-auto flex items-center w-full p-4 rounded-xl shadow-lg border-l-4 backdrop-blur-sm"
        :class="getStyles(toast.type)"
      >
        <component :is="getIcon(toast.type)" class="w-5 h-5 flex-shrink-0 mr-3" />
        <p class="text-sm font-medium text-slate-700 dark:text-gray-200 flex-1 break-words">{{ toast.message }}</p>
        <button 
          @click="store.remove(toast.id)" 
          class="ml-3 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors text-slate-400 hover:text-slate-600"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
