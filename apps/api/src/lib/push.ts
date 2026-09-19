const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Fire-and-forget delivery to Expo's push service -- callers never await
 * this, mirroring auth.service.ts's `sendInviteEmail(...).catch(...)`
 * precedent for invite emails: a down or slow push provider must never
 * hold up, or fail, the business operation that triggered the
 * notification. The 5s timeout exists only so an unreachable/hung
 * endpoint can't leak an unresolved request.
 */
export async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  await fetch(EXPO_PUSH_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(5000),
  });
}
