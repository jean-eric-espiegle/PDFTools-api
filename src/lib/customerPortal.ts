import { CUSTOMER_PORTAL_SERVICE_KEY, CUSTOMER_PORTAL_URL } from "../config.js";

export const customerPortalEnabled = CUSTOMER_PORTAL_URL.length > 0 && CUSTOMER_PORTAL_SERVICE_KEY.length > 0;

export interface CentralBaseUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  billingAddress: string | null;
  emailVerifiedAt: string | null;
}

export interface CentralCustomerProfile {
  customer: { id: string; baseUserId: string };
  baseUser?: CentralBaseUser;
  subscriptions: unknown[];
}

export interface ProfileFields {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  city: string;
  country: string;
  address: string;
  billingAddress: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T | undefined> {
  const res = await fetch(`${CUSTOMER_PORTAL_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, "x-service-key": CUSTOMER_PORTAL_SERVICE_KEY, "Content-Type": "application/json" },
  });

  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Customer Portal returned ${res.status} for ${path}`);

  const body = (await res.json()) as { data: T };
  return body.data;
}

/**
 * Best-effort throughout: Customer Portal being briefly unreachable should
 * never block registration or login. Every export here catches its own
 * errors, logs, and returns undefined rather than throwing — callers treat
 * "couldn't reach it" the same as "not configured".
 */
async function safely<T>(label: string, fn: () => Promise<T | undefined>): Promise<T | undefined> {
  if (!customerPortalEnabled) return undefined;
  try {
    return await fn();
  } catch (err) {
    console.error(`Customer Portal call failed (${label}):`, err);
    return undefined;
  }
}

export function lookupCentralCustomer(email: string): Promise<CentralCustomerProfile | undefined> {
  return safely("lookup", () => call<CentralCustomerProfile>(`/customers/lookup?email=${encodeURIComponent(email)}`));
}

export function createCentralCustomer(email: string): Promise<CentralCustomerProfile | undefined> {
  return safely("create", () =>
    call<CentralCustomerProfile>("/customers", {
      method: "POST",
      body: JSON.stringify({ email }),
    })
  );
}

export function updateCentralProfile(customerId: string, fields: ProfileFields): Promise<{ baseUser: CentralBaseUser } | undefined> {
  return safely("update profile", () =>
    call<{ baseUser: CentralBaseUser }>(`/customers/${customerId}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    })
  );
}
