import { useMemo, useState } from 'react';
import { Image as ExpoImage } from 'expo-image';
import {
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Heart,
  MessageCircle,
  Send,
} from 'lucide-react-native';
import { useNanaStore } from '../stores/nanaStore';
import type { Moment, MomentComment } from '../types';
import { AnimatedPressable } from './primitives';
import {
  NeumorphicSurface,
  neumorphicPalette,
} from './neumorphic-surface';
import { wechatAssets } from './wechatAssets';
import { CharacterPortrait } from './CharacterPortrait';
import {
  cleanupReplacedWallpaper,
  pickMomentsCoverFromLibrary,
} from '../services/nativeImagePickerRuntime';
import {
  DEFAULT_MOMENTS_COVER_VALUE,
  isUserSocialAuthor,
  momentsCoverUsesBundledDefault,
  normalizeMomentsCoverValue,
  resolveMomentSocialIdentity,
} from '../services/socialIdentityRuntime';

interface AddMomentCommentInput {
  text: string;
  replyToCommentId?: string;
  replyToAuthorName?: string;
}

export interface MomentsViewProps {
  moments?: Moment[];
  onToggleLike?: (momentId: string) => void;
  onAddComment?: (momentId: string, input: AddMomentCommentInput) => void;
}

interface ActiveComposer {
  momentId: string;
  replyToCommentId?: string;
  replyToAuthorName?: string;
}

const createMomentCommentId = (momentId: string) => (
  `moment-comment:${momentId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`
);

export function MomentsView({
  moments,
  onToggleLike,
  onAddComment,
}: MomentsViewProps = {}) {
  const storedMoments = useNanaStore(s => s.momentsList);
  const myName = useNanaStore(s => s.myName);
  const myAvatar = useNanaStore(s => s.myAvatar);
  const momentsBg = useNanaStore(s => s.momentsBg);
  const setMomentsCover = useNanaStore(s => s.setMomentsCover);
  const resetMomentsCover = useNanaStore(s => s.resetMomentsCover);
  const language = useNanaStore(s => s.themeConfig.language);
  const [activeComposer, setActiveComposer] = useState<ActiveComposer | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [coverPickerBusy, setCoverPickerBusy] = useState(false);
  const momentsList = (moments ?? storedMoments).map(moment => (
    resolveMomentSocialIdentity(moment, {
      name: myName || (language === 'zh' ? '我' : 'Me'),
      avatar: myAvatar,
    })
  ));
  const isChinese = language === 'zh';
  const normalizedCover = normalizeMomentsCoverValue(momentsBg);
  const bundledCover = momentsCoverUsesBundledDefault(normalizedCover);
  const copy = useMemo(() => ({
    like: isChinese ? '赞' : 'Like',
    unlike: isChinese ? '取消赞' : 'Unlike',
    comment: isChinese ? '评论' : 'Comment',
    reply: isChinese ? '回复' : 'Reply',
    send: isChinese ? '发送评论' : 'Send comment',
    placeholder: isChinese ? '写下评论…' : 'Write a comment…',
    noMoments: isChinese ? '还没有动态' : 'No moments yet',
    noMomentsHint: isChinese
      ? '角色和你的新动态会留在这里。'
      : 'New posts from you and your characters will stay here.',
    changeCover: isChinese ? '从相册更换朋友圈封面' : 'Choose Moments cover from photos',
    resetCover: isChinese ? '恢复默认朋友圈封面' : 'Restore default Moments cover',
    coverUpdated: isChinese ? '朋友圈封面已更新' : 'Moments cover updated',
    coverReset: isChinese ? '已恢复默认封面' : 'Default cover restored',
    coverFailed: isChinese ? '无法更换朋友圈封面' : 'Could not update Moments cover',
  }), [isChinese]);
  const coverAccessibilityHint = bundledCover
    ? copy.changeCover
    : `${copy.changeCover}. ${isChinese ? '长按可恢复默认封面' : 'Long press to restore the default cover.'}`;

  const handleChooseCover = async () => {
    if (coverPickerBusy) return;
    setCoverPickerBusy(true);
    try {
      const result = await pickMomentsCoverFromLibrary();
      if (result.canceled) return;
      if (result.phase !== 'ready' || !result.localUri) {
        useNanaStore.setState({
          islandNotification: {
            title: copy.coverFailed,
            desc: result.errorMessage || copy.coverFailed,
            status: 'error',
          },
        });
        return;
      }
      const previousCover = normalizeMomentsCoverValue(
        useNanaStore.getState().momentsBg,
      );
      setMomentsCover(result.localUri);
      cleanupReplacedWallpaper(previousCover, result.localUri);
      useNanaStore.setState({
        islandNotification: {
          title: copy.coverUpdated,
          desc: copy.coverUpdated,
          status: 'success',
        },
      });
    } finally {
      setCoverPickerBusy(false);
      setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2200);
    }
  };

  const handleResetCover = () => {
    const state = useNanaStore.getState();
    const previousCover = normalizeMomentsCoverValue(state.momentsBg);
    resetMomentsCover();
    cleanupReplacedWallpaper(previousCover, DEFAULT_MOMENTS_COVER_VALUE);
    useNanaStore.setState({
      islandNotification: {
        title: copy.coverReset,
        desc: copy.coverReset,
        status: 'success',
      },
    });
    setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2200);
  };

  const toggleLike = (moment: Moment) => {
    if (onToggleLike) {
      onToggleLike(moment.id);
      return;
    }
    const currentUserId = 'me';
    useNanaStore.setState(state => ({
      momentsList: state.momentsList.map(item => {
        if (item.id !== moment.id) return item;
        const likes = item.likes || [];
        const alreadyLiked = likes.some(like => isUserSocialAuthor(like.authorId));
        return {
          ...item,
          likes: alreadyLiked
            ? likes.filter(like => !isUserSocialAuthor(like.authorId))
            : [
                ...likes,
                {
                  authorId: currentUserId,
                  authorName: myName || (isChinese ? '我' : 'Me'),
                  avatar: myAvatar,
                  timestamp: Date.now(),
                },
              ],
        };
      }),
    }));
  };

  const openCommentComposer = (
    momentId: string,
    replyTo?: Pick<MomentComment, 'id' | 'authorName'>,
  ) => {
    setActiveComposer({
      momentId,
      ...(replyTo
        ? {
            replyToCommentId: replyTo.id,
            replyToAuthorName: replyTo.authorName,
          }
        : {}),
    });
    setCommentDraft('');
  };

  const submitComment = () => {
    const text = commentDraft.trim();
    if (!text || !activeComposer) return;
    const input: AddMomentCommentInput = {
      text,
      ...(activeComposer.replyToCommentId
        ? {
            replyToCommentId: activeComposer.replyToCommentId,
            replyToAuthorName: activeComposer.replyToAuthorName,
          }
        : {}),
    };
    if (onAddComment) {
      onAddComment(activeComposer.momentId, input);
    } else {
      useNanaStore.setState(state => ({
        momentsList: state.momentsList.map(item => (
          item.id === activeComposer.momentId
            ? {
                ...item,
                comments: [
                  ...(item.comments || []),
                  {
                    id: createMomentCommentId(item.id),
                    authorId: 'me',
                    authorName: myName || (isChinese ? '我' : 'Me'),
                    avatar: myAvatar,
                    text,
                    timestamp: Date.now(),
                    ...(input.replyToCommentId
                      ? {
                          replyToCommentId: input.replyToCommentId,
                          replyToAuthorName: input.replyToAuthorName,
                        }
                      : {}),
                  },
                ],
              }
            : item
        )),
      }));
    }
    setCommentDraft('');
    setActiveComposer(null);
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 28 }}
    >
      <AnimatedPressable
        testID="moments-change-cover"
        accessibilityRole="button"
        accessibilityLabel={copy.changeCover}
        accessibilityHint={coverAccessibilityHint}
        accessibilityState={{ busy: coverPickerBusy }}
        disabled={coverPickerBusy}
        onPress={() => { void handleChooseCover(); }}
        onLongPress={bundledCover ? undefined : handleResetCover}
        scale={0.99}
        style={{
          width: 'auto',
          height: 142,
          marginHorizontal: 3,
          borderRadius: 20,
          borderCurve: 'continuous',
          overflow: 'hidden',
          opacity: coverPickerBusy ? 0.72 : 1,
        }}
      >
        <ExpoImage
          source={bundledCover ? wechatAssets.momentsCover : { uri: normalizedCover }}
          contentFit="cover"
          transition={160}
          style={{ width: '100%', height: 142 }}
          accessible={false}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            left: 0,
            height: 62,
            backgroundColor: 'rgba(42,31,54,0.16)',
          }}
        />
      </AnimatedPressable>

      <View style={{ paddingHorizontal: 3, paddingTop: 16 }}>
        {momentsList.length === 0 ? (
          <NeumorphicSurface
            depth="raisedSmall"
            tone="base"
            radius={18}
            fill={false}
            contentStyle={{ alignItems: 'center', paddingHorizontal: 20, paddingVertical: 26 }}
          >
            <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 16, fontWeight: '800' }}>
              {copy.noMoments}
            </Text>
            <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 }}>
              {copy.noMomentsHint}
            </Text>
          </NeumorphicSurface>
        ) : null}

        {momentsList.map(moment => {
          const likes = moment.likes || [];
          const comments = moment.comments || [];
          const likedByMe = likes.some(like => isUserSocialAuthor(like.authorId));
          const composerOpen = activeComposer?.momentId === moment.id;
          return (
            <NeumorphicSurface
              key={moment.id}
              testID={`moment-card-${moment.id}`}
              depth="raisedSmall"
              tone="base"
              radius={18}
              fill={false}
              style={{ marginBottom: 14 }}
              contentStyle={{ paddingHorizontal: 13, paddingVertical: 13 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 9 }}>
                <View style={{ width: 42, height: 42, borderRadius: 14, overflow: 'hidden' }}>
                  <CharacterPortrait
                    characterId={moment.authorId}
                    avatar={moment.avatar}
                    fallback={moment.authorName[0] || 'N'}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, fontWeight: '800' }}>
                    {moment.authorName}
                  </Text>
                  <Text style={{ color: neumorphicPalette.onLightSecondary, fontSize: 11, marginTop: 2 }}>
                    {new Date(moment.timestamp).toLocaleString(isChinese ? 'zh-CN' : 'en-US')}
                  </Text>
                </View>
              </View>

              {moment.text.trim() ? (
                <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 15, lineHeight: 22, marginBottom: moment.images?.length ? 10 : 4 }}>
                  {moment.text}
                </Text>
              ) : null}

              {moment.images?.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 }}>
                  {moment.images.map((uri, index) => (
                    <MomentImage
                      key={`${uri}-${index}`}
                      uri={uri}
                      imageCount={moment.images.length}
                      accessibilityLabel={`${moment.authorName} ${isChinese ? '发布的图片' : 'posted image'} ${index + 1}`}
                    />
                  ))}
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 }}>
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={likedByMe ? copy.unlike : copy.like}
                  accessibilityState={{ selected: likedByMe }}
                  onPress={() => toggleLike(moment)}
                  style={{
                    minWidth: 68,
                    minHeight: 44,
                    borderRadius: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: likedByMe
                      ? 'rgba(150,81,106,0.20)'
                      : 'rgba(255,255,255,0.12)',
                  }}
                >
                  <Heart
                    size={17}
                    color={likedByMe ? neumorphicPalette.berry : neumorphicPalette.onLightSecondary}
                    fill={likedByMe ? neumorphicPalette.berry : 'transparent'}
                  />
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>
                    {likes.length || copy.like}
                  </Text>
                </AnimatedPressable>
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.comment}
                  onPress={() => openCommentComposer(moment.id)}
                  style={{
                    minWidth: 76,
                    minHeight: 44,
                    borderRadius: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                  }}
                >
                  <MessageCircle size={17} color={neumorphicPalette.onLightSecondary} />
                  <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 12, fontWeight: '800' }}>
                    {comments.length || copy.comment}
                  </Text>
                </AnimatedPressable>
              </View>

              {likes.length > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 3 }}>
                  <Heart size={14} color={neumorphicPalette.berry} fill={neumorphicPalette.berry} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, color: neumorphicPalette.onLightSecondary, fontSize: 12, lineHeight: 18 }}>
                    {likes.map(like => like.authorName).join('、')}
                  </Text>
                </View>
              ) : null}

              {comments.length > 0 ? (
                <View
                  style={{
                    marginTop: 8,
                    borderRadius: 14,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    backgroundColor: 'rgba(48,37,55,0.09)',
                  }}
                >
                  {comments.map(comment => (
                    <AnimatedPressable
                      key={comment.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${copy.reply} ${comment.authorName}`}
                      onPress={() => openCommentComposer(moment.id, comment)}
                      style={{ minHeight: 40, justifyContent: 'center', paddingVertical: 5 }}
                    >
                      <Text style={{ color: neumorphicPalette.onLightPrimary, fontSize: 13, lineHeight: 19 }}>
                        <Text style={{ fontWeight: '900' }}>{comment.authorName}</Text>
                        {comment.replyToAuthorName ? (
                          <Text style={{ color: neumorphicPalette.onLightSecondary }}>
                            {` ${copy.reply} ${comment.replyToAuthorName}`}
                          </Text>
                        ) : null}
                        <Text>{`：${comment.text}`}</Text>
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              ) : null}

              {composerOpen ? (
                <NeumorphicSurface
                  depth="inset"
                  tone="composer"
                  radius={15}
                  fill={false}
                  style={{ marginTop: 10 }}
                  contentStyle={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingLeft: 11, paddingRight: 5, paddingVertical: 5 }}
                >
                  <TextInput
                    autoFocus
                    value={commentDraft}
                    onChangeText={setCommentDraft}
                    onSubmitEditing={submitComment}
                    placeholder={activeComposer?.replyToAuthorName
                      ? `${copy.reply} ${activeComposer.replyToAuthorName}…`
                      : copy.placeholder}
                    placeholderTextColor="rgba(55,46,63,0.62)"
                    multiline
                    style={{
                      flex: 1,
                      minHeight: 34,
                      maxHeight: 86,
                      color: neumorphicPalette.onLightPrimary,
                      fontSize: 14,
                      lineHeight: 19,
                      paddingVertical: 7,
                    }}
                  />
                  <AnimatedPressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.send}
                    accessibilityState={{ disabled: !commentDraft.trim() }}
                    disabled={!commentDraft.trim()}
                    onPress={submitComment}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: commentDraft.trim() ? 1 : 0.42,
                      backgroundColor: neumorphicPalette.berry,
                    }}
                  >
                    <Send size={17} color={neumorphicPalette.onBerry} />
                  </AnimatedPressable>
                </NeumorphicSurface>
              ) : null}
            </NeumorphicSurface>
          );
        })}
      </View>
    </ScrollView>
  );
}

function MomentImage({
  uri,
  imageCount,
  accessibilityLabel,
}: {
  uri: string;
  imageCount: number;
  accessibilityLabel: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!uri.trim() || failed) return null;
  return (
    <ExpoImage
      source={{ uri }}
      contentFit="cover"
      transition={120}
      cachePolicy="memory-disk"
      recyclingKey={uri}
      onError={() => setFailed(true)}
      accessibilityLabel={accessibilityLabel}
      style={{
        width: imageCount === 1 ? '100%' : '48%',
        flexGrow: imageCount === 1 ? 0 : 1,
        height: imageCount === 1 ? 196 : 132,
        borderRadius: 13,
        backgroundColor: 'rgba(48,37,55,0.10)',
      }}
    />
  );
}
