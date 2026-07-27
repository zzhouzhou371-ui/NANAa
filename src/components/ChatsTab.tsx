import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import {
  Banknote,
  ChevronRight,
  Clock3,
  Image as ImageIcon,
  Mic,
  MoonStar,
  Phone,
  Sparkles,
} from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useNanaStore } from '../stores/nanaStore';
import type { Message, Payment, RelationshipTrace } from '../types';
import { SearchBar } from './SearchBar';
import { AnimatedPressable } from './primitives';
import { EmptyState } from './EmptyState';
import { wechatTheme } from './wechatTheme';
import { wechatAssets } from './wechatAssets';
import { CharacterPortrait } from './CharacterPortrait';
import { ThickGlassContainer, ThickGlassSurface } from './thick-glass-surface';

function messagePreview(message: Message | undefined, t: Record<string, string>, payment?: Payment) {
  if (!message) return t.quietBeginning;
  if (message.type === 'voice') {
    const duration = message.audioDurationSec ? ` · ${message.audioDurationSec}s` : '';
    return `${t.voiceMessage}${duration}`;
  }
  if (message.type === 'image') return t.sharedPhoto;
  if (message.type === 'payment') return payment?.note || (payment?.kind === 'transfer' ? t.transfer : t.redPacket);
  if (message.type === 'transfer' || message.type === 'transfer_received') return message.note || t.transfer;
  if (message.type === 'redpacket' || message.type === 'redpacket_received') return message.note || t.redPacket;
  return message.text || t.quietBeginning;
}

function MessageKindIcon({ message }: { message?: Message }) {
  const color = wechatTheme.inkMuted;
  if (message?.type === 'voice') return <Mic size={13} color={color} strokeWidth={1.8} />;
  if (message?.type === 'image') return <ImageIcon size={13} color={color} strokeWidth={1.8} />;
  if (message?.type === 'payment' || message?.type === 'transfer' || message?.type === 'transfer_received' || message?.type === 'redpacket' || message?.type === 'redpacket_received') {
    return <Banknote size={13} color={color} strokeWidth={1.8} />;
  }
  if (message?.sender === 'system' && /(call|通话)/i.test(message.text)) return <Phone size={13} color={color} strokeWidth={1.8} />;
  return null;
}

function latestTraceFor(characterId: string, traces: RelationshipTrace[]) {
  return traces
    .filter(trace => trace.characterId === characterId && trace.remember && trace.state === 'digested')
    .sort((left, right) => right.occurredAt - left.occurredAt)[0];
}

export function ChatsTab() {
  const { t } = useApp();
  const friends = useNanaStore(s => s.friends);
  const characters = useNanaStore(s => s.characters);
  const chatHistory = useNanaStore(s => s.chatHistory);
  const unreadCounts = useNanaStore(s => s.unreadCounts);
  const relationshipTraces = useNanaStore(s => s.relationshipTraces);
  const paymentsById = useNanaStore(s => s.paymentsById);
  const searchQuery = useNanaStore(s => s.searchQuery);
  const set = useNanaStore.setState;
  const { width, height } = useWindowDimensions();
  const compact = width <= 360 || height < 700;
  const gutter = compact ? 0 : 4;
  const friendChars = characters.filter(character => friends.includes(character.id));
  const filtered = searchQuery
    ? friendChars.filter(character => character.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : friendChars;
  const sorted = [...filtered].sort((left, right) => (
    (chatHistory[right.id]?.at(-1)?.id || 0) - (chatHistory[left.id]?.at(-1)?.id || 0)
  ));
  const featured = sorted[0];
  const featuredMessages = featured ? (chatHistory[featured.id] || []) : [];
  const featuredLastMessage = featuredMessages.at(-1);
  const featuredLatestTrace = featured ? latestTraceFor(featured.id, relationshipTraces) : undefined;
  const showFeatured = false;
  const openChat = (characterId: string) => set(state => ({
    activeChatId: characterId,
    weChatPage: 'chat',
    unreadCounts: { ...state.unreadCounts, [characterId]: 0 },
  }));

  const callFeatured = () => {
    if (!featured) return;
    set({ activeChatId: featured.id, weChatPage: 'chat' });
    useNanaStore.getState().startOutgoingCall('voice');
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <SearchBar value={searchQuery} onChange={(value) => set({ searchQuery: value })} placeholder={t.search} />
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: compact ? 8 : 12, paddingBottom: 92 }}
      >
        {showFeatured && featured && !searchQuery ? (
          <ThickGlassContainer
            sharedMaterial="pearl"
            spacing={12}
            style={{
              minHeight: compact ? 112 : 158,
              marginHorizontal: gutter,
              marginBottom: compact ? 12 : 18,
              flexDirection: 'row',
              alignItems: 'stretch',
            }}
          >
            <AnimatedPressable
              testID={`chat-featured-${featured.id}`}
              accessibilityLabel={t.continueChatWith.replace('{name}', featured.name)}
              onPress={() => openChat(featured.id)}
              scale={0.988}
              style={{ flex: 1, minWidth: 0 }}
            >
              <ThickGlassSurface
                variant="row"
                tint="pearl"
                inheritMaterial
                nativeInteractive
                style={{
                  width: '100%',
                  minHeight: compact ? 112 : 158,
                  paddingLeft: compact ? 8 : 12,
                  paddingRight: 4,
                  paddingVertical: 0,
                }}
                contentStyle={{ alignItems: 'center' }}
              >
              <View style={{ width: compact ? 88 : 118, height: compact ? 96 : 132, alignItems: 'center', justifyContent: 'center' }}>
                <View
                  style={{
                    width: compact ? 60 : 82,
                    height: compact ? 60 : 82,
                    borderRadius: compact ? 30 : 41,
                    overflow: 'hidden',
                    backgroundColor: 'rgba(28, 35, 69, 0.56)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CharacterPortrait
                    characterId={featured.id}
                    avatar={featured.avatar}
                    fallback={featured.name[0]}
                    fontSize={compact ? 25 : 31}
                  />
                </View>
                <Image
                  source={wechatAssets.avatarFrame}
                  contentFit="contain"
                  style={{ position: 'absolute', width: compact ? 88 : 118, height: compact ? 96 : 132 }}
                />
              </View>

              <View style={{ flex: 1, minWidth: 0, paddingVertical: compact ? 10 : 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MoonStar size={compact ? 12 : 14} color={wechatTheme.peach} strokeWidth={1.7} />
                  <Text style={{ color: wechatTheme.peach, fontSize: compact ? 9 : 10, fontWeight: '800', letterSpacing: 1.1 }}>
                    {t.continueTogether.toUpperCase()}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={{ color: wechatTheme.ink, fontSize: compact ? 22 : 28, lineHeight: compact ? 28 : 34, fontFamily: 'PlayfairDisplay_700Bold', marginTop: 2 }}
                >
                  {featured.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: compact ? 1 : 3 }}>
                  <Clock3 size={11} color={wechatTheme.inkSoft} strokeWidth={1.7} />
                  <Text numberOfLines={1} style={{ flex: 1, color: wechatTheme.inkMuted, fontSize: compact ? 10 : 11 }}>
                    {featuredLastMessage?.time || t.noMessagesYet} · {t.messageCount.replace('{n}', String(featuredMessages.length))}
                  </Text>
                </View>
                <View
                  style={{
                    marginTop: compact ? 7 : 10,
                    paddingTop: compact ? 6 : 8,
                    borderTopWidth: 0.75,
                    borderTopColor: 'rgba(255, 255, 255, 0.1)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Sparkles size={12} color={featuredLatestTrace ? '#AFC6EA' : wechatTheme.inkSoft} strokeWidth={1.7} />
                  <Text numberOfLines={1} style={{ flex: 1, color: featuredLatestTrace ? wechatTheme.inkMuted : wechatTheme.inkSoft, fontSize: compact ? 10 : 11 }}>
                    {featuredLatestTrace?.summary || messagePreview(featuredLastMessage, t, featuredLastMessage?.paymentId ? paymentsById[featuredLastMessage.paymentId] : undefined)}
                  </Text>
                </View>
              </View>
              </ThickGlassSurface>
            </AnimatedPressable>

            <View style={{ width: compact ? 46 : 54, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: compact ? 9 : 13, paddingRight: compact ? 6 : 10 }}>
              <AnimatedPressable
                accessibilityLabel={`${t.voiceCall}: ${featured.name}`}
                onPress={callFeatured}
                scale={0.92}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  overflow: 'hidden',
                }}
              >
                <ThickGlassSurface
                  variant="action"
                  tint="peach"
                  nativeInteractive
                  style={{ width: 44, height: 44, minHeight: 44, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 22 }}
                >
                  <Phone size={18} color={wechatTheme.peach} strokeWidth={1.8} />
                </ThickGlassSurface>
              </AnimatedPressable>
            </View>
          </ThickGlassContainer>
        ) : null}

        <View style={{ marginHorizontal: gutter + 2, marginBottom: compact ? 8 : 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: wechatTheme.ink, fontSize: compact ? 16 : 18, lineHeight: 22, fontWeight: '800' }}>{t.conversations}</Text>
            {!compact ? <Text style={{ color: wechatTheme.inkSoft, fontSize: 10, marginTop: 2 }}>{t.conversationsSubtitle}</Text> : null}
          </View>
          <Text style={{ color: wechatTheme.inkSoft, fontSize: 11 }}>{t.bondCount.replace('{n}', String(sorted.length))}</Text>
        </View>

        {sorted.length === 0 ? (
          <EmptyState icon="Chat" title={t.startChatting} subtitle={t.startRelationshipStory} />
        ) : (
          <ThickGlassContainer
            sharedMaterial="peach"
            spacing={10}
            style={{
              marginHorizontal: gutter,
              borderRadius: 24,
              borderCurve: 'continuous',
              overflow: 'hidden',
              boxShadow:
                '0 6px 12px rgba(4,10,28,0.12), inset 0 1px 1px rgba(255,242,246,0.34), inset -1px -1px 2px rgba(231,160,175,0.14)',
            }}
          >
          {sorted.map((character, index) => {
          const last = chatHistory[character.id]?.at(-1);
          const unread = unreadCounts[character.id] || 0;
          const trace = latestTraceFor(character.id, relationshipTraces);
          return (
            <AnimatedPressable
              key={character.id}
              testID={`chat-row-${character.id}`}
              accessibilityLabel={`${t.openChatWith.replace('{name}', character.name)}${unread ? `, ${t.unreadCount.replace('{n}', String(unread))}` : ''}`}
              onPress={() => openChat(character.id)}
              scale={0.992}
              style={{
                minHeight: compact ? 70 : 78,
                position: 'relative',
              }}
            >
              <ThickGlassSurface
                variant="row"
                tint="pearl"
                inheritMaterial
                nativeInteractive
                style={{
                  width: '100%',
                  minHeight: compact ? 70 : 78,
                  paddingHorizontal: compact ? 12 : 16,
                  paddingVertical: compact ? 10 : 12,
                  borderRadius: 0,
                }}
                contentStyle={{ gap: compact ? 10 : 12 }}
              >
              <View
                style={{
                  width: compact ? 46 : 52,
                  height: compact ? 46 : 52,
                  borderRadius: compact ? 23 : 26,
                  overflow: 'hidden',
                  backgroundColor: wechatTheme.navyRaised,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CharacterPortrait
                  characterId={character.id}
                  avatar={character.avatar}
                  fallback={character.name[0]}
                  fontSize={compact ? 20 : 22}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text numberOfLines={1} style={{ color: wechatTheme.ink, fontSize: 15, fontWeight: '800', flex: 1 }}>{character.name}</Text>
                  <Text style={{ color: wechatTheme.inkMuted, fontSize: 10, fontVariant: ['tabular-nums'] }}>{last?.time || ''}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}>
                  <MessageKindIcon message={last} />
                  <Text numberOfLines={1} style={{ color: wechatTheme.inkMuted, fontSize: 12, lineHeight: 16, flex: 1 }}>
                    {messagePreview(last, t, last?.paymentId ? paymentsById[last.paymentId] : undefined)}
                  </Text>
                </View>
                {trace && !compact ? (
                  <Text numberOfLines={1} style={{ color: '#AFC6EA', fontSize: 9, marginTop: 3 }}>
                    {t.rememberedLabel} · {trace.title}
                  </Text>
                ) : null}
              </View>
              {unread > 0 ? (
                <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: wechatTheme.rose, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{unread}</Text>
                </View>
              ) : (
                <ChevronRight size={16} color="rgba(248, 237, 241, 0.58)" strokeWidth={1.7} />
              )}
              </ThickGlassSurface>
              {index < sorted.length - 1 ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    right: compact ? 12 : 16,
                    bottom: 0,
                    left: compact ? 68 : 80,
                    height: 0.75,
                    backgroundColor: 'rgba(255, 232, 238, 0.16)',
                  }}
                />
              ) : null}
            </AnimatedPressable>
          );
          })}
          </ThickGlassContainer>
        )}
      </ScrollView>
    </View>
  );
}
