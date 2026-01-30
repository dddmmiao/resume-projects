/**
 * 认证fetch工具
 * 自动添加JWT token到请求头
 * 支持重试、超时、统一错误处理
 */

interface AuthFetchOptions extends RequestInit {
  retry?: number;           // 重试次数，默认0
  retryDelay?: number;      // 重试延迟(ms)，默认1000
  timeout?: number;         // 超时时间(ms)，默认30000
  silent?: boolean;         // 静默模式，不抛出错误
}

// 错误类型
export class FetchError extends Error {
  status?: number;
  isTimeout?: boolean;
  isNetworkError?: boolean;
  
  constructor(message: string, options?: { status?: number; isTimeout?: boolean; isNetworkError?: boolean }) {
    super(message);
    this.name = 'FetchError';
    this.status = options?.status;
    this.isTimeout = options?.isTimeout;
    this.isNetworkError = options?.isNetworkError;
  }
}

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 带超时的fetch
const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * 封装fetch，自动添加Authorization header
 * 支持重试、超时、统一错误处理
 */
export async function authFetch(url: string, options: AuthFetchOptions = {}): Promise<Response> {
  const {
    retry = 0,
    retryDelay = 1000,
    timeout = 30000,
    silent = false,
    ...fetchOptions
  } = options;
  
  const token = localStorage.getItem('access_token');
  const headers = new Headers(fetchOptions.headers);
  
  // 自动添加token
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // 确保Content-Type
  if (!headers.has('Content-Type') && fetchOptions.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      const response = await fetchWithTimeout(url, { ...fetchOptions, headers }, timeout);
      
      // 统一处理401错误
      if (response.status === 401) {
        localStorage.removeItem('access_token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
      
      return response;
    } catch (error: any) {
      // 判断错误类型
      if (error.name === 'AbortError') {
        lastError = new FetchError('请求超时', { isTimeout: true });
      } else if (error.message === 'Failed to fetch' || error.message?.includes('NetworkError')) {
        lastError = new FetchError('网络错误', { isNetworkError: true });
      } else {
        lastError = error;
      }
      
      // 如果还有重试次数，等待后重试
      if (attempt < retry) {
        await delay(retryDelay * (attempt + 1)); // 指数退避
      }
    }
  }
  
  // 所有重试都失败
  if (!silent && lastError) {
    throw lastError;
  }
  
  throw lastError || new FetchError('请求失败');
}

export default authFetch;
