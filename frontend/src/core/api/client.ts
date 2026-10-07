import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

export const ACCESS_TOKEN_KEY = 'access_token';

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

/** True when the current route is already the sign-in screen. */
function onLoginRoute(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/login');
}

/** Clear the session and send the user to sign-in exactly once. */
function forceSignOut(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  if (!onLoginRoute()) {
    window.location.href = '/auth/login';
  }
}

// Request interceptor: attach access token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: refresh once on 401, then fail loudly.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    const isAuthEndpoint = Boolean(originalRequest?.url?.startsWith('/auth/'));
    const canRetry =
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint;

    if (canRetry && originalRequest) {
      originalRequest._retry = true;
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', null, {
          withCredentials: true,
        });
        const token = data?.data?.access_token;
        if (!token) {
          throw new Error('Refresh response did not include an access token.');
        }
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      } catch {
        forceSignOut();
      }
    }

    return Promise.reject(error);
  }
);

export { apiClient };
export default apiClient;
