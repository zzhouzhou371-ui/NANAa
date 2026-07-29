import type { Moment } from '../types';

export interface UserIdentityDraft {
  name: string;
  avatar: string;
  description: string;
}

export interface UserSocialIdentity {
  name: string;
  avatar: string;
}

export const DEFAULT_MOMENTS_COVER_VALUE = '';

export const normalizeUserIdentityDraft = (
  draft: UserIdentityDraft,
  fallback: { name: string; avatar: string; description: string },
): UserIdentityDraft => ({
  name: draft.name.trim() || fallback.name,
  avatar: draft.avatar.trim() || fallback.avatar,
  description: draft.description.trim() || fallback.description,
});

export const isUserSocialAuthor = (authorId: unknown): boolean => {
  if (typeof authorId !== 'string') return false;
  const normalized = authorId.trim().toLowerCase();
  return normalized === 'me' || normalized === 'user';
};

/**
 * Persisted posts keep stable ownership IDs, while the rendered identity always
 * follows the user's current global profile. This avoids rewriting social
 * history merely because the user changed their name or portrait.
 */
export const resolveMomentSocialIdentity = (
  moment: Moment,
  identity: UserSocialIdentity,
): Moment => {
  const userCommentIds = new Set(
    (moment.comments || [])
      .filter(comment => isUserSocialAuthor(comment.authorId))
      .map(comment => comment.id),
  );
  return {
    ...moment,
    ...(isUserSocialAuthor(moment.authorId)
      ? {
          authorName: identity.name,
          avatar: identity.avatar,
        }
      : {}),
    likes: moment.likes?.map(like => (
      isUserSocialAuthor(like.authorId)
        ? {
            ...like,
            authorName: identity.name,
            avatar: identity.avatar,
          }
        : like
    )),
    comments: moment.comments?.map(comment => ({
      ...comment,
      ...(isUserSocialAuthor(comment.authorId)
        ? {
            authorName: identity.name,
            avatar: identity.avatar,
          }
        : {}),
      ...(comment.replyToCommentId && userCommentIds.has(comment.replyToCommentId)
        ? { replyToAuthorName: identity.name }
        : {}),
    })),
  };
};

export const normalizeMomentsCoverValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : DEFAULT_MOMENTS_COVER_VALUE
);

export const momentsCoverUsesBundledDefault = (value: unknown): boolean => (
  normalizeMomentsCoverValue(value) === DEFAULT_MOMENTS_COVER_VALUE
);
