import apiClient, { ACCESS_TOKEN_KEY } from '@/core/api/client';
import { USER_CACHE_KEY } from '@/core/auth/context';

interface DemoLoginPayload {
  access_token: string;
  exam_id: string;
}

/**
 * Starts a fresh demo sitting and hands the browser to it.
 *
 * The server clears the demo student's earlier attempts when this endpoint is
 * called, so every press of a "Try the demo" control gets a new clock, no
 * inherited warnings and no locked attempt from the previous sitting.
 *
 * The handover is a full document navigation rather than a client-side route
 * change. A demo session replaces the current identity, and the previous
 * identity's auth context, query cache and camera state must not survive into
 * the candidate's paper. Replacing the history entry also keeps the browser's
 * Back button from restoring the signed-in page a visitor came from.
 */
export async function startDemoSitting(): Promise<void> {
  const { data } = await apiClient.post('/exams/demo/login');
  const session = data.data as DemoLoginPayload;

  localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
  localStorage.removeItem(USER_CACHE_KEY);
  window.location.replace(`/exams/${session.exam_id}/take`);
}
