import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type {
  Character,
  ProactiveChatSchedules,
} from '../types';
import {
  createLocalProactiveMessage,
  PROACTIVE_GLOBAL_COOLDOWN_MS,
} from './proactiveChatRuntime';
import {
  CHAT_BUBBLE_SEPARATOR,
  resolveChatPresence,
} from './chatRhythmRuntime';
import {
  registerRemoteProactiveDevice,
  type RemoteProactiveEndpointConfig,
  type RemoteProactiveRegistrationResult,
} from './remoteProactiveClient';
import { remoteProactiveReceiptStore } from './remoteProactiveReceiptRepository';
import {
  REMOTE_PROACTIVE_NOTIFICATION_KIND,
  deliverRemoteProactiveEnvelope,
  parseRemoteProactiveEnvelope,
  type RemoteProactiveDeliveryResult,
  type RemoteProactiveDeliverySource,
  type RemoteProactiveMessageHandler,
} from './remoteProactiveRuntime';

export const PROACTIVE_NOTIFICATION_CHANNEL_ID = 'relationship-messages-v2';
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
  previewText: string;
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
  || notificationData(request)?.kind === REMOTE_PROACTIVE_NOTIFICATION_KIND
);

const isRemoteProactiveNotification = (request: Notifications.NotificationRequest) => (
  notificationData(request)?.kind === REMOTE_PROACTIVE_NOTIFICATION_KIND
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
  language,
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
    .map(character => {
      const dueAt = moveOutOfRestingWindow(
        character.id,
        Math.max(
          schedules[character.id].nextDueAt,
          globalReadyAt,
          now + MINIMUM_FUTURE_TRIGGER_MS,
        ),
      );
      return {
        characterId: character.id,
        characterName: character.name,
        dueAt,
        previewText: createLocalProactiveMessage({
          characterId: character.id,
          characterName: character.name,
          personaDescription: character.desc,
          language,
          now: dueAt,
          timeZone: character.timeZone,
        })
          .split(CHAT_BUBBLE_SEPARATOR)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      };
    })
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
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
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
  await Notifications.scheduleNotificationAsync({
    content: {
      title: plan.characterName,
      body: plan.previewText,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: {
        kind: PROACTIVE_NOTIFICATION_KIND,
        characterId: plan.characterId,
        dueAt: plan.dueAt,
        previewText: plan.previewText,
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

const expoProjectId = (explicitProjectId?: string) => {
  const projectId = explicitProjectId?.trim()
    || Constants.expoConfig?.extra?.eas?.projectId
    || Constants.easConfig?.projectId;
  return typeof projectId === 'string' && projectId.trim()
    ? projectId.trim()
    : null;
};

export const registerRemoteProactivePushDevice = async ({
  config,
  installationId,
  projectId: explicitProjectId,
  signal,
}: {
  config?: RemoteProactiveEndpointConfig | null;
  installationId: string;
  projectId?: string;
  signal?: AbortSignal;
}): Promise<RemoteProactiveRegistrationResult> => {
  if (!config) return { status: 'disabled' };
  if (!isNativeNotificationPlatform()) return { status: 'disabled' };
  if (signal?.aborted) {
    return { status: 'failed', kind: 'cancelled', retryable: false };
  }

  // Android 13 will not expose its notification permission prompt/token until
  // a channel exists. Permission remains user-driven by Settings; registration
  // never requests it on its own.
  await configureProactiveNotificationRuntime();
  if (await getProactiveNotificationPermission() !== 'granted') {
    return { status: 'failed', kind: 'configuration', retryable: false };
  }
  const projectId = expoProjectId(explicitProjectId);
  if (!projectId) {
    return { status: 'failed', kind: 'configuration', retryable: false };
  }

  try {
    const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (signal?.aborted) {
      return { status: 'failed', kind: 'cancelled', retryable: false };
    }
    return registerRemoteProactiveDevice({
      config,
      registration: {
        schemaVersion: 1,
        installationId,
        expoPushToken,
        projectId,
        platform: Platform.OS as 'android' | 'ios',
        ...(Constants.expoConfig?.version
          ? { appVersion: Constants.expoConfig.version }
          : {}),
      },
      signal,
    });
  } catch {
    return { status: 'failed', kind: 'network', retryable: true };
  }
};

const deliverRemoteNotificationRequest = (
  request: Notifications.NotificationRequest,
  source: RemoteProactiveDeliverySource,
  handler: RemoteProactiveMessageHandler,
): Promise<RemoteProactiveDeliveryResult> => deliverRemoteProactiveEnvelope({
  value: notificationData(request),
  source,
  receiptStore: remoteProactiveReceiptStore,
  handler,
});

/**
 * The UI/store supplies the canonical foreground commit callback. This native
 * boundary validates, expires, and deduplicates the server event before that
 * callback can write a character message. It intentionally does not generate
 * text or read model credentials.
 */
export const observeRemoteProactiveNotifications = (
  onMessage: RemoteProactiveMessageHandler,
) => {
  if (!isNativeNotificationPlatform()) return () => {};
  const received = Notifications.addNotificationReceivedListener(notification => {
    void deliverRemoteNotificationRequest(
      notification.request,
      'received',
      onMessage,
    );
  });
  const responded = Notifications.addNotificationResponseReceivedListener(response => {
    if (!isRemoteProactiveNotification(response.notification.request)) return;
    void deliverRemoteNotificationRequest(
      response.notification.request,
      'response',
      onMessage,
    ).then(result => {
      if (result.status !== 'handler-failed') {
        Notifications.clearLastNotificationResponse();
      }
    });
  });
  return () => {
    received.remove();
    responded.remove();
  };
};

export const consumeLastRemoteProactiveNotification = async (
  onMessage: RemoteProactiveMessageHandler,
) => {
  if (!isNativeNotificationPlatform()) return null;
  const response = Notifications.getLastNotificationResponse();
  if (!response || !isRemoteProactiveNotification(response.notification.request)) return null;
  const result = await deliverRemoteNotificationRequest(
    response.notification.request,
    'initial-response',
    onMessage,
  );
  if (result.status !== 'handler-failed') {
    Notifications.clearLastNotificationResponse();
  }
  return result;
};

export const proactiveNotificationCharacterId = (
  response: Notifications.NotificationResponse | null,
) => {
  if (!response) return null;
  const data = notificationData(response.notification.request);
  if (data?.kind === PROACTIVE_NOTIFICATION_KIND && typeof data.characterId === 'string') {
    return data.characterId;
  }
  const remote = parseRemoteProactiveEnvelope(data);
  return remote.ok ? remote.envelope.characterId : null;
};

export const consumeLastProactiveNotificationResponse = () => {
  if (!isNativeNotificationPlatform()) return null;
  const response = Notifications.getLastNotificationResponse();
  const characterId = proactiveNotificationCharacterId(response);
  if (characterId && response && !isRemoteProactiveNotification(response.notification.request)) {
    Notifications.clearLastNotificationResponse();
  }
  return characterId;
};

export const observeProactiveNotificationResponses = (
  onCharacterOpen: (characterId: string) => void,
) => {
  if (!isNativeNotificationPlatform()) return () => {};
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const characterId = proactiveNotificationCharacterId(response);
    if (!characterId) return;
    if (!isRemoteProactiveNotification(response.notification.request)) {
      Notifications.clearLastNotificationResponse();
    }
    onCharacterOpen(characterId);
  });
  return () => subscription.remove();
};
