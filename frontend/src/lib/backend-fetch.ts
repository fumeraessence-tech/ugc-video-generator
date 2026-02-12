import { createClient } from "@/lib/supabase/client";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

/**
 * Fetch wrapper that automatically attaches the Supabase access token
 * to requests sent to the Python backend.
 */
export async function backendFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);

  // Don't set Content-Type for FormData (browser sets it with boundary)
  const isFormData = init?.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
  });
}
