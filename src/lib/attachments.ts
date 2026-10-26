import { pb } from '@/lib/db';
import { toast } from '@/lib/toast';

/**
 * Attachments upload straight to the server (no offline queue: files are too
 * big for localStorage). The realtime echo brings the new file names back to
 * every open device.
 */
export async function attach(todoId: string, files: File[]) {
  if (!files.length) return;
  try {
    await pb.collection('todos').update(todoId, { 'attachments+': files });
  } catch {
    toast.error(navigator.onLine ? 'Upload failed (max 25 MB per file)' : 'Attachments need a connection');
  }
}

export async function detach(todoId: string, name: string) {
  try {
    await pb.collection('todos').update(todoId, { 'attachments-': [name] });
  } catch {
    toast.error('Could not remove the attachment');
  }
}

let cached: { token: string; at: number } | null = null;

/** Protected files need a file token; one is good for a couple of minutes. */
export async function fileToken(): Promise<string> {
  if (cached && Date.now() - cached.at < 60_000) return cached.token;
  cached = { token: await pb.files.getToken(), at: Date.now() };
  return cached.token;
}

export const isImage = (name: string) => /\.(png|jpe?g|gif|webp|avif|heic|svg)$/i.test(name);

export function fileUrl(todoId: string, name: string, token: string, thumb = false) {
  return pb.files.getURL({ id: todoId, collectionName: 'todos' }, name, { token, ...(thumb && !/\.svg$/i.test(name) ? { thumb: '240x240' } : {}) });
}

/** "photo_ab12cd34ef.png" → "photo.png": PocketBase appends a random suffix. */
export const displayName = (name: string) => name.replace(/_[a-z0-9]{10}(\.[^.]+)?$/i, '$1');
