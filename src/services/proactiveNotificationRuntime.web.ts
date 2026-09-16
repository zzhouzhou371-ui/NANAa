import type { ProactiveNotificationSnapshot } from './proactiveNotificationRuntime.native';
import type {
  RemoteProactiveEndpointConfig,
  RemoteProactiveRegistrationResult,
} from './remoteProactiveClient';
import type {
  RemoteProactiveMessageHandler,
} from './remoteProactiveRuntime';

export type ProactiveNotificationPermission = 'unavailable';

export const configureProactiveNotificationRuntime = async () => {};

export const requestProactiveNotificationPermission = async (
): Promise<ProactiveNotificationPermission> => 'unavailable';

export const dismissPresentedProactiveNotifications = async () => {};

export const queueProactiveSystemNotificationSync = async (
  _snapshot: ProactiveNotificationSnapshot,
) => {};

export const registerRemoteProactivePushDevice = async (
  _input: {
    config?: RemoteProactiveEndpointConfig | null;
    installationId: string;
    projectId?: string;
    signal?: AbortSignal;
  },
): Promise<RemoteProactiveRegistrationResult> => ({ status: 'disabled' });

export const observeRemoteProactiveNotifications = (
  _onMessage: RemoteProactiveMessageHandler,
) => () => {};

export const consumeLastRemoteProactiveNotification = async (
  _onMessage: RemoteProactiveMessageHandler,
) => null;

export const consumeLastProactiveNotificationResponse = () => null;

export const observeProactiveNotificationResponses = (
  _onCharacterOpen: (characterId: string) => void,
) => () => {};
