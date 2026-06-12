const API_URL = '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

const handleResponse = async (response) => {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // JSON 解析失败，使用默认错误信息
    }

    // 401 未授权 - 仅当本地有 token 时才清除（避免无 token 请求触发误跳转）
    if (response.status === 401 && localStorage.getItem('token')) {
      handleAuthError();
    }

    throw new Error(errorMessage);
  }
  return response;
};

// 仅在需要时手动调用，用于全局认证过期处理
export const handleAuthError = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/chat';
};

/**
 * 解构 options，将 headers 分离出来手动合并，防止 options 覆盖认证头
 */
const buildFetchOptions = (method, extraHeaders = {}, body, options = {}) => {
  const { headers: _ignored, ...rest } = options;
  const fetchOpts = {
    method,
    headers: {
      ...getAuthHeaders(),
      ...extraHeaders,
    },
    ...rest,
  };
  if (body !== undefined) fetchOpts.body = JSON.stringify(body);
  return fetchOpts;
};

export const apiGet = async (path, options = {}) => {
  const response = await fetch(`${API_URL}${path}`,
    buildFetchOptions('GET', options.headers, undefined, options));
  return handleResponse(response);
};

export const apiPost = async (path, body, options = {}) => {
  const response = await fetch(`${API_URL}${path}`,
    buildFetchOptions('POST', options.headers, body, options));
  return handleResponse(response);
};

export const apiPut = async (path, body, options = {}) => {
  const response = await fetch(`${API_URL}${path}`,
    buildFetchOptions('PUT', options.headers, body, options));
  return handleResponse(response);
};

export const apiDelete = async (path, options = {}) => {
  const response = await fetch(`${API_URL}${path}`,
    buildFetchOptions('DELETE', options.headers, undefined, options));
  return handleResponse(response);
};

// 无 JSON 序列化的 POST（用于流式请求等自定义场景）
export const apiPostRaw = async (path, body, options = {}) => {
  const token = localStorage.getItem('token');
  const { headers: _ignored, ...rest } = options;
  const fetchOpts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...rest,
  };
  if (body !== undefined) fetchOpts.body = JSON.stringify(body);
  const response = await fetch(`${API_URL}${path}`, fetchOpts);
  return handleResponse(response);
};

export { API_URL, getAuthHeaders };
