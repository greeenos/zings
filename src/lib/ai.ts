import { errorMessage, pb } from '@/lib/db';
import { toast } from '@/lib/toast';
import { billing } from '@/lib/billing';

/** AI runs on the user's own key (Account → AI) or on a hosted plan's. */
export const aiAvailable = () => !!(pb.authStore.record?.aiKeyHint || billing()?.aiIncluded);

async function call<T>(path: string, body: object): Promise<T | null> {
  try {
    return await pb.send<T>(path, { method: 'POST', body });
  } catch (error) {
    toast.error(errorMessage(error, 'The AI request failed'));
    return null;
  }
}

/** Checklist steps for a to-do. */
export const breakDown = async (title: string, notes?: string | null) =>
  (await call<{ steps: string[] }>('/api/ai/breakdown', { title, notes: notes ?? '' }))?.steps ?? null;

/** Separate to-do titles (with plain-word scheduling) from dictated or pasted text. */
export const captureTodos = async (text: string) =>
  (await call<{ todos: string[] }>('/api/ai/capture', { text }))?.todos ?? null;
