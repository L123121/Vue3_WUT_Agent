import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { sha256, DEFAULT_PASSWORD_HASH } from '../utils/crypto.js';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const PASSWORD_HASH_KEY = 'app_login_password_hash';
const IS_LOCAL_AUTH_KEY = 'is_local_auth';

/**
 * 确保应用始终有本地身份（免登录，打开即用）
 * 如果 localStorage 没有用户数据，自动创建一个本地用户
 */
function ensureLocalIdentity() {
  if (!localStorage.getItem(TOKEN_KEY)) {
    const localToken = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(TOKEN_KEY, localToken);
    localStorage.setItem(IS_LOCAL_AUTH_KEY, 'true');
  }
  if (!localStorage.getItem(USER_KEY)) {
    localStorage.setItem(USER_KEY, JSON.stringify({
      id: `u_${Date.now()}`,
      name: '武理学子',
      college: '计算机科学与技术学院',
      grade: '2021级',
    }));
  }
}
ensureLocalIdentity();

export const useAuthStore = defineStore('auth', () => {
  const user = ref(JSON.parse(localStorage.getItem(USER_KEY)));
  const token = ref(localStorage.getItem(TOKEN_KEY));

  // Migrate from plaintext to hash (one-time)
  const legacyPassword = localStorage.getItem('app_login_password');
  if (legacyPassword) {
    sha256(legacyPassword).then((hash) => {
      localStorage.setItem(PASSWORD_HASH_KEY, hash);
      localStorage.removeItem('app_login_password');
    });
  }

  const storedHash = localStorage.getItem(PASSWORD_HASH_KEY) || DEFAULT_PASSWORD_HASH;

  const storedIsLocalAuth = localStorage.getItem(IS_LOCAL_AUTH_KEY);
  const isLocalAuth = ref(
    storedIsLocalAuth !== null ? storedIsLocalAuth === 'true' : token.value.startsWith('local_')
  );

  const isAuthenticated = computed(() => true); // 免登录，始终为 true

  const login = (userData, authToken) => {
    user.value = {
      college: '计算机科学与技术学院',
      grade: '2021级',
      ...userData,
    };

    if (authToken) {
      token.value = authToken;
      isLocalAuth.value = false;
      localStorage.setItem(TOKEN_KEY, authToken);
      localStorage.setItem(IS_LOCAL_AUTH_KEY, 'false');
    } else {
      const localToken = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      token.value = localToken;
      isLocalAuth.value = true;
      localStorage.setItem(TOKEN_KEY, localToken);
      localStorage.setItem(IS_LOCAL_AUTH_KEY, 'true');
    }

    localStorage.setItem(USER_KEY, JSON.stringify(user.value));
  };

  const logout = () => {
    user.value = null;
    token.value = '';
    isLocalAuth.value = false;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(IS_LOCAL_AUTH_KEY);
  };

  const updateUser = (updates) => {
    if (user.value) {
      user.value = { ...user.value, ...updates };
      localStorage.setItem(USER_KEY, JSON.stringify(user.value));
    }
  };

  const verifyPassword = async (value) => {
    const hash = await sha256(value);
    return hash === storedHash;
  };

  const changePassword = async (currentPassword, newPassword) => {
    const isValid = await verifyPassword(currentPassword);
    if (!isValid) {
      return { success: false, message: '旧密码错误' };
    }

    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: '新密码长度至少需要6位' };
    }

    const newHash = await sha256(newPassword);
    localStorage.setItem(PASSWORD_HASH_KEY, newHash);
    return { success: true, message: '密码修改成功！' };
  };

  return {
    user,
    token,
    isLocalAuth,
    isAuthenticated,
    login,
    logout,
    updateUser,
    verifyPassword,
    changePassword,
  };
});
