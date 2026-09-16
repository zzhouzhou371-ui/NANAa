import type {
  Character,
  ProactiveChatSchedules,
} from '../types';
import { createInitialProactiveSchedule } from './proactiveChatRuntime';

export interface FriendshipState {
  friends: string[];
  proactiveChatSchedules: ProactiveChatSchedules;
}

/**
 * Keeps every "add friend" surface on the same relationship clock.
 * The pure patch is safe to pass directly to Zustand's functional setter.
 */
export const createAddFriendPatch = (
  state: FriendshipState,
  character: Pick<Character, 'id' | 'proactiveMessagingFrequency'>,
  now = Date.now(),
): FriendshipState => ({
  friends: state.friends.includes(character.id)
    ? state.friends
    : [...state.friends, character.id],
  proactiveChatSchedules: state.proactiveChatSchedules[character.id]
    ? state.proactiveChatSchedules
    : {
        ...state.proactiveChatSchedules,
        [character.id]: createInitialProactiveSchedule(
          character.id,
          now,
          character.proactiveMessagingFrequency || 'normal',
        ),
      },
});
