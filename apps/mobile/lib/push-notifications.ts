import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiJson } from "./api-client";

/** Foreground notifications show as a banner rather than being silently swallowed -- the default Expo behavior on some platforms is to suppress them while the app is open. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationEntityData {
  projectId: string;
  entityType: string;
  entityId: string;
  summary: string;
}

const ENTITY_PATH_BY_TYPE: Record<string, string> = {
  rfi: "rfis",
  submittal: "submittals",
  punch_item: "punch-list",
  change_order: "change-orders",
};

/** Mirrors apps/web's NotificationBell.entityPath -- the same payload shape, the same three modules with a detail screen a push can deep-link into today. */
export function entityPath(data: NotificationEntityData): string | null {
  const segment = ENTITY_PATH_BY_TYPE[data.entityType];
  if (!segment) return null;
  return `/projects/${data.projectId}/${segment}/${data.entityId}`;
}

/**
 * Requests permission, gets this device's Expo push token, and registers
 * it against the logged-in user. Every failure is swallowed -- a denied
 * permission, an emulator with no push credentials, or a dev environment
 * with no EAS project configured must never block using the rest of the
 * app, the same "best-effort side effect" posture the API's own push
 * dispatch takes (apps/api/src/lib/push.ts).
 */
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const { data: token } = await Notifications.getExpoPushTokenAsync();
    await apiJson("/push-tokens", {
      method: "POST",
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
  } catch (err) {
    console.warn("Failed to register for push notifications", err);
  }
}

/** Called on logout, while the session is still valid, so this device stops receiving the outgoing user's notifications. Best-effort like registration -- a failure here just leaves a stale row that a future login elsewhere will eventually reassign. */
export async function unregisterForPushNotifications(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    await apiJson("/push-tokens", { method: "DELETE", body: JSON.stringify({ token }) });
  } catch (err) {
    console.warn("Failed to unregister push token", err);
  }
}
