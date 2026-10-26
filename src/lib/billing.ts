import { isDemo } from './demo';
import { errorMessage, pb } from '@/lib/db';
import { toast } from '@/lib/toast';

export interface BillingStatus {
  hosted: boolean;
  pro: boolean;
  paidUntil: string;
  autoRenews: boolean;
  openTodos: number;
  freeTodoLimit: number;
  priceMonthEur: number;
  priceYearEur: number;
  stripe: boolean;
  crypto: boolean;
  aiIncluded: boolean;
  aiOffered: boolean;
}

let current: BillingStatus | null = null;

/** The account's plan; cached for synchronous checks like aiAvailable(). */
export async function loadBilling(): Promise<BillingStatus | null> {
  if (isDemo) return null;
  try {
    current = await pb.send<BillingStatus>('/api/billing/status', {});
  } catch {
    current = null;
  }
  return current;
}

export const billing = () => current;

/** Send the browser to Stripe Checkout, the Stripe portal or a NOWPayments invoice. */
export async function goToPayment(path: string, body: object = {}) {
  try {
    const res = await pb.send<{ url: string }>(path, { method: 'POST', body });
    window.location.href = res.url;
  } catch (error) {
    toast.error(errorMessage(error, 'Payment is unavailable right now'));
  }
}
