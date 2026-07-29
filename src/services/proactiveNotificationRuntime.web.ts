import type { ProactiveNotificationSnapshot } from './proactiveNotificationRuntime.native';

export type ProactiveNotificationPermission = 'unavailable';

export const configureProactiveNotificationRuntime = async () => {};

export const requestProactiveNotificationPermission = async (
): Promise<ProactiveNotificationPermission> => 'unavailable';

export const dismissPresentedProactiveNotifications = async () => {};

export const queueProactiveSystemNotificationSync = async (
  _snapshot: ProactiveNotificationSnapshot,
) => {};

export const consumeLastProactiveNotificationResponse = () => null;

export const observeProactiveNotificationResponses = (
  _onCharacterOpen: (characterId: string) => void,
) => () => {};
