import { pb } from '@/lib/db';

// The signed-in user's private, read-only .ics feed. `scheme: 'webcal'` swaps
// http(s) for the webcal:// scheme that Apple/Google recognise as "subscribe".
// `download: true` asks for a Content-Disposition attachment (one-time import).
export function buildFeedUrl(opts: { scheme?: 'http' | 'webcal'; download?: boolean } = {}): string {
  const url = new URL(pb.buildURL('/api/feed.ics'), window.location.href);
  url.searchParams.set('token', pb.authStore.record?.feedToken ?? '');
  if (opts.download) url.searchParams.set('download', '1');
  return opts.scheme === 'webcal' ? url.href.replace(/^https?:/, 'webcal:') : url.href;
}

