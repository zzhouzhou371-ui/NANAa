import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import { ChatListView } from './ChatListView';
import { ChatView } from './ChatView';
import { ProfileView } from './ProfileView';
import { MomentsView } from './MomentsView';
import { StickerManagerView } from './StickerManagerView';
import { WalletView } from './WalletView';
import { AIContextPreviewView } from './AIContextPreviewView';
import { AddFriendOverlay } from './AddFriendOverlay';
import { ComposeMomentOverlay } from './ComposeMomentOverlay';
import { PaymentModal } from './PaymentModal';
import { CallOverlay } from './CallOverlay';
import {
  discardPickedStickers,
  pickStickersFromLibrary,
} from '../services/nativeImagePickerRuntime';
import type { StickerAsset, StickerScope } from '../types';

export function WeChatRootView() {
  const { t } = useApp();
  const weChatPage = useNanaStore(s => s.weChatPage);
  const activeChatId = useNanaStore(s => s.activeChatId);
  const [retainedChatId, setRetainedChatId] = useState(activeChatId);
  const showAddFriend = useNanaStore(s => s.showAddFriend);
  const showComposeMoment = useNanaStore(s => s.showComposeMoment);
  const paymentModal = useNanaStore(s => s.paymentModal);
  const callOverlay = useNanaStore(s => s.callOverlay);
  const callIsActive = callOverlay.show;
  const moments = useNanaStore(s => s.momentsList);
  const stickers = useNanaStore(s => s.stickers);
  const characters = useNanaStore(s => s.characters);
  const friends = useNanaStore(s => s.friends);
  const stickerManagerCharacterId = useNanaStore(s => s.stickerManagerCharacterId);
  const publishMoment = useNanaStore(s => s.publishMoment);
  const toggleMomentLike = useNanaStore(s => s.toggleMomentLike);
  const addMomentComment = useNanaStore(s => s.addMomentComment);
  const addStickers = useNanaStore(s => s.addStickers);
  const updateSticker = useNanaStore(s => s.updateSticker);
  const removeSticker = useNanaStore(s => s.removeSticker);

  useEffect(() => {
    if (activeChatId) setRetainedChatId(activeChatId);
  }, [activeChatId]);

  const renderedChatId = activeChatId || retainedChatId;
  const chatVisible = weChatPage === 'chat' && !!activeChatId;

  const requestAddStickers = async (scope: StickerScope, characterId?: string) => {
    if (scope === 'relationship' && !characterId) return;
    const result = await pickStickersFromLibrary(
      scope === 'relationship'
        ? { scope, characterId: characterId! }
        : { scope },
    );
    if (result.canceled) return;
    if (result.errorMessage) {
      discardPickedStickers(result.assets);
      useNanaStore.setState({
        islandNotification: {
          title: '表情包',
          desc: result.errorMessage,
          status: 'error',
        },
      });
      return;
    }
    const createdAt = Date.now();
    const next: StickerAsset[] = result.assets.map((asset, index) => ({
      schemaVersion: 1,
      id: `sticker:${createdAt}:${index}:${Math.random().toString(36).slice(2, 8)}`,
      uri: asset.uri,
      name: asset.name || `表情 ${index + 1}`,
      tags: [],
      mimeType: asset.mimeType,
      animated: asset.animated,
      scope,
      ...(scope === 'relationship' && characterId ? { characterId } : {}),
      createdAt: createdAt + index,
    }));
    try {
      addStickers(next);
    } catch (error) {
      discardPickedStickers(result.assets);
      useNanaStore.setState({
        islandNotification: {
          title: t.stickers,
          desc: error instanceof Error ? error.message : 'Sticker import failed',
          status: 'error',
        },
      });
      return;
    }
    useNanaStore.setState({
      islandNotification: {
        title: '表情包',
        desc: result.rejectedCount > 0
          ? `已添加 ${next.length} 个，另有 ${result.rejectedCount} 个因格式或大小未加入`
          : `已添加 ${next.length} 个表情`,
        status: next.length > 0 ? 'success' : 'error',
      },
    });
    setTimeout(() => useNanaStore.setState({ islandNotification: null }), 2400);
  };

  return (
    <View className="flex-1" style={{ minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <View
        aria-hidden={callIsActive || undefined}
        accessibilityElementsHidden={callIsActive}
        importantForAccessibility={callIsActive ? 'no-hide-descendants' : 'auto'}
        pointerEvents={callIsActive ? 'none' : 'auto'}
        style={{ flex: 1, minHeight: 0 }}
      >
        {renderedChatId ? (
          <View
            pointerEvents={chatVisible ? 'auto' : 'none'}
            accessibilityElementsHidden={!chatVisible}
            importantForAccessibility={chatVisible ? 'auto' : 'no-hide-descendants'}
            style={[
              StyleSheet.absoluteFillObject,
              {
                opacity: chatVisible ? 1 : 0,
                zIndex: chatVisible ? 2 : 0,
              },
            ]}
          >
            <ChatView chatId={renderedChatId} />
          </View>
        ) : null}
        {weChatPage === 'root' && <ChatListView />}
        {weChatPage === 'profile' && <ProfileView />}
        {weChatPage === 'moments' && (
          <MomentsView
            moments={moments}
            onToggleLike={toggleMomentLike}
            onAddComment={(momentId, input) => {
              void addMomentComment(momentId, input.text, input.replyToCommentId);
            }}
          />
        )}
        {weChatPage === 'stickers' && (
          <StickerManagerView
            embedded
            stickers={stickers}
            relationships={characters
              .filter(character => friends.includes(character.id))
              .map(character => ({
                id: character.id,
                name: character.name,
                avatar: character.avatar.startsWith('http') || character.avatar.startsWith('file:')
                  ? character.avatar
                  : undefined,
              }))}
            initialCharacterId={stickerManagerCharacterId || undefined}
            labels={{
              title: t.stickers,
              global: t.globalStickers,
              relationship: t.relationshipStickers,
              add: t.add,
              emptyGlobal: t.emptyGlobalStickers,
              emptyRelationship: t.emptyRelationshipStickers,
              chooseRelationship: t.chooseStickerRelationship,
              edit: t.edit,
              delete: t.delete,
              name: t.stickerName,
              namePlaceholder: t.stickerNamePlaceholder,
              tags: t.stickerTags,
              tagsHint: t.stickerTagsHint,
              replace: t.replaceSticker,
              cancel: t.cancel,
              save: t.save,
              invalid: t.invalidStickerName,
            }}
            onRequestAdd={(scope, characterId) => requestAddStickers(scope, characterId)}
            onSave={updateSticker}
            onDelete={removeSticker}
          />
        )}
        {weChatPage === 'wallet' && <WalletView />}
        {weChatPage === 'context' && <AIContextPreviewView />}

        {showAddFriend && <AddFriendOverlay />}
        {showComposeMoment && (
          <ComposeMomentOverlay onPublish={draft => { publishMoment(draft); }} />
        )}
        {(paymentModal.type === 'transfer' || paymentModal.type === 'redpacket') && <PaymentModal />}
      </View>
      {callIsActive && <CallOverlay />}

    </View>
  );
}
