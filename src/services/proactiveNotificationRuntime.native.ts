import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type {
  Character,
  ProactiveChatSchedules,
} from '../types';
import { PROACTIVE_GLOBAL_COOLDOWN_MS } from './proactiveChatRuntime';
import { resolveChatPresence } from './chatRhythmRuntime';

export const PROACTIVE_NOTIFICATION_CHANNEL_ID = 'relationship-messages';
export const PROACTIVE_NOTIFICATION_KIND = 'nana-proactive-chat';

const MINIMUM_FUTURE_TRIGGER_MS = 60_000;
const PRESENCE_RECHECK_MS = 30 * 60 * 1_000;
const MAX_PRESENCE_RECHECKS = 24;

export type ProactiveNotificationPermission =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unavailable';

export interface ProactiveNotificationSnapshot {
  enabled: boolean;
  language: string;
  characters: Character[];
  friends: string[];
  blockedUsers: string[];
  schedules: ProactiveChatSchedules;
  now?: number;
}

export interface ProactiveNotificationPlan {
  characterId: string;
  characterName: string;
  dueAt: number;
}

const isNativeNotificationPlatform = () => (
  Platform.OS === 'android' || Platform.OS === 'ios'
);

const isGranted = (status: Notifications.NotificationPermissionsStatus) => (
  status.granted
  || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
);

const notificationData = (request: Notifications.NotificationRequest) => (
  request.content.data as Record<string, unknown> | undefined
);

const isNanaProactiveNotification = (request: Notifications.NotificationRequest) => (
  notificationData(request)?.kind === PROACTIVE_NOTIFICATION_KIND
);

const moveOutOfRestingWindow = (characterId: string, proposedDueAt: number) => {
  let dueAt = proposedDueAt;
  for (let index = 0; index < MAX_PRESENCE_RECHECKS; index += 1) {
    if (resolveChatPresence(characterId, dueAt) !== 'resting') return dueAt;
    dueAt += PRESENCE_RECHECK_MS;
  }
  return dueAt;
};

export const selectNextProactiveNotificationPlan = ({
  enabled,
  characters,
  friends,
  blockedUsers,
  schedules,
  now = Date.now(),
}: ProactiveNotificationSnapshot): ProactiveNotificationPlan | null => {
  if (!enabled) return null;

  const friendIds = new Set(friends);
  const blockedIds = new Set(blockedUsers);
  const latestSentAt = Object.values(schedules).reduce(
    (latest, schedule) => Math.max(latest, schedule.lastSentAt || 0),
    0,
  );
  const globalReadyAt = latestSentAt + PROACTIVE_GLOBAL_COOLDOWN_MS;

  return characters
    .filter(character => (
      friendIds.has(character.id)
      && !blockedIds.has(character.id)
      && character.proactiveMessagingEnabled !== false
      && !!schedules[character.id]
    ))
    .map(character => ({
      characterId: character.id,
      characterName: character.name,
      dueAt: moveOutOfRestingWindow(
        character.id,
        Math.max(
          schedules[character.id].nextDueAt,
          globalReadyAt,
          now + MINIMUM_FUTURE_TRIGGER_MS,
        ),
      ),
    }))
    .sort((left, right) => (
      left.dueAt - right.dueAt
      || left.characterId.localeCompare(right.characterId)
    ))[0] || null;
};

export const configureProactiveNotificationRuntime = async () => {
  if (!isNativeNotificationPlatform()) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(
      PROACTIVE_NOTIFICATION_CHANNEL_ID,
      {
        name: 'Relationship messages',
        description: 'Reminders when a Nana character wants to reconnect.',
        importance: Notifications.AndroidImportance.DEFAULT,
        enableVibrate: true,
        vibrationPattern: [0, 180],
        lightColor: '#B886A5',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        showBadge: true,
      },
    );
  }
};

export const getProactiveNotificationPermission = async (
): Promise<ProactiveNotificationPermission> => {
  if (!isNativeNotificationPlatform()) return 'unavailable';
  const status = await Notifications.getPermissionsAsync();
  if (isGranted(status)) return 'granted';
  if (status.status === 'denied') return 'denied';
  return 'undetermined';
};

export const requestProactiveNotificationPermission = async (
): Promise<ProactiveNotificationPermission> => {
  if (!isNativeNotificationPlatform()) return 'unavailable';
  await configureProactiveNotificationRuntime();
  const current = await Notifications.getPermissionsAsync();
  if (isGranted(current)) return 'granted';
  if (current.status === 'denied' && !current.canAskAgain) return 'denied';
  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  if (isGranted(requested)) return 'granted';
  return requested.status === 'undetermined' ? 'undetermined' : 'denied';
};

const cancelScheduledProactiveNotifications = async () => {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter(isNanaProactiveNotification)
    .map(request => Notifications.cancelScheduledNotificationAsync(request.identifier)));
};

export const dismissPresentedProactiveNotifications = async () => {
  if (!isNativeNotificationPlatform()) return;
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(presented
    .filter(notification => isNanaProactiveNotification(notification.request))
    .map(notification => Notifications.dismissNotificationAsync(
      notification.request.identifier,
    )));
};

const syncProactiveSystemNotification = async (
  snapshot: ProactiveNotificationSnapshot,
) => {
  if (!isNativeNotificationPlatform()) return;
  await configureProactiveNotificationRuntime();
  await cancelScheduledProactiveNotifications();

  if (!snapshot.enabled) {
    await dismissPresentedProactiveNotifications();
    return;
  }
  if (await getProactiveNotificationPermission() !== 'granted') return;

  const plan = selectNextProactiveNotificationPlan(snapshot);
  if (!plan) return;
  const isChinese = snapshot.language.toLowerCase().startsWith('zh');
  await Notifications.scheduleNotificationAsync({
    content: {
      title: plan.characterName,
      body: isChinese
        ? '好像有话想对你说。'
        : 'Wants to talk with you.',
      data: {
        kind: PROACTIVE_NOTIFICATION_KIND,
        characterId: plan.characterId,
        dueAt: plan.dueAt,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(60, Math.ceil((plan.dueAt - Date.now()) / 1_000)),
      repeats: false,
      channelId: PROACTIVE_NOTIFICATION_CHANNEL_ID,
    },
  });
};

let pendingSnapshot: ProactiveNotificationSnapshot | null = null;
let syncPromise: Promise<void> | null = null;

export const queueProactiveSystemNotificationSync = (
  snapshot: ProactiveNotificationSnapshot,
) => {
  pendingSnapshot = snapshot;
  if (!syncPromise) {
    syncPromise = (async () => {
      while (pendingSnapshot) {
        const nextSnapshot = pendingSnapshot;
        pendingSnapshot = null;
        await syncProactiveSystemNotification(nextSnapshot);
      }
    })().finally(() => {
      syncPromise = null;
      if (pendingSnapshot) {
        void queueProactiveSystemNotificationSync(pendingSnapshot);
      }
    });
  }
  return syncPromise;
};

export const proactiveNotificationCharacterId = (
  response: Notifications.NotificationResponse | null,
) => {
  if (!response) return null;
  const data = notificationData(response.notification.request);
  return data?.kind === PROACTIVE_NOTIFICATION_KIND
    && typeof data.characterId === 'string'
    ? data.characterId
    : null;
};

export const consumeLastProactiveNotificationResponse = () => {
  if (!isNativeNotificationPlatform()) return null;
  const response = Notifications.getLastNotificationResponse();
  const characterId = proactiveNotificationCharacterId(response);
  if (characterId) Notifications.clearLastNotificationResponse();
  return characterId;
};

export const observeProactiveNotificationResponses = (
  onCharacterOpen: (characterId: string) => void,
) => {
  if (!isNativeNotificationPlatform()) return () => {};
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const characterId = proactiveNotificationCharacterId(response);
    if (!characterId) return;
    Notifications.clearLastNotificationResponse();
    onCharacterOpen(characterId);
  });
  return () => subscription.remove();
};
