import { defineStore } from 'pinia';
import { ref } from 'vue';
import { User } from '../types/index.ts';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);

  const login = (userData: User) => {
    user.value = {
      college: '计算机科学与技术学院',
      grade: '2021级',
      ...userData
    };
  };

  const logout = () => {
    user.value = null;
  };

  const updateUser = (updates: Partial<User>) => {
    if (user.value) {
      user.value = { ...user.value, ...updates };
    }
  };

  return { user, login, logout, updateUser };
});