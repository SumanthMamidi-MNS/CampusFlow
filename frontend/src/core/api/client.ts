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

// Endpoints that establish or end a session must never refresh themselves.
// `/auth/me` is deliberately absent: it is exactly the call a page reload makes
// with a possibly stale access token, so it has to be allowed to refresh.
const NO_REFRESH_PREFIXES = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/password/'];

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

    const isCredentialEndpoint = NO_REFRESH_PREFIXES.some((prefix) =>
      Boolean(originalRequest?.url?.startsWith(prefix))
    );
    const canRetry =
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isCredentialEndpoint;

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
      } catch (refreshError) {
        // Only a definitive rejection ends the session. A refresh that failed
        // for an infrastructural reason (offline, backend 5xx) must not delete
        // the stored token, so a later reload can still recover the session.
        const status = (refreshError as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          forceSignOut();
        }
      }
    }

    return Promise.reject(error);
  }
);

export { apiClient };
export default apiClient;
