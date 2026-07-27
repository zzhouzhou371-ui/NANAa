import { View } from 'react-native';
import { useNanaStore } from '../stores/nanaStore';
import { ChatListView } from './ChatListView';
import { ChatView } from './ChatView';
import { ProfileView } from './ProfileView';
import { MomentsView } from './MomentsView';
import { WalletView } from './WalletView';
import { AIContextPreviewView } from './AIContextPreviewView';
import { AddFriendOverlay } from './AddFriendOverlay';
import { ComposeMomentOverlay } from './ComposeMomentOverlay';
import { PaymentModal } from './PaymentModal';
import { CallOverlay } from './CallOverlay';

export function WeChatRootView() {
  const weChatPage = useNanaStore(s => s.weChatPage);
  const showAddFriend = useNanaStore(s => s.showAddFriend);
  const showComposeMoment = useNanaStore(s => s.showComposeMoment);
  const paymentModal = useNanaStore(s => s.paymentModal);
  const callOverlay = useNanaStore(s => s.callOverlay);
  const callIsActive = callOverlay.show;

  return (
    <View className="flex-1" style={{ minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <View
        aria-hidden={callIsActive || undefined}
        accessibilityElementsHidden={callIsActive}
        importantForAccessibility={callIsActive ? 'no-hide-descendants' : 'auto'}
        pointerEvents={callIsActive ? 'none' : 'auto'}
        style={{ flex: 1, minHeight: 0 }}
      >
        {weChatPage === 'root' && <ChatListView />}
        {weChatPage === 'chat' && <ChatView />}
        {weChatPage === 'profile' && <ProfileView />}
        {weChatPage === 'moments' && <MomentsView />}
        {weChatPage === 'wallet' && <WalletView />}
        {weChatPage === 'context' && <AIContextPreviewView />}

        {showAddFriend && <AddFriendOverlay />}
        {showComposeMoment && <ComposeMomentOverlay />}
        {(paymentModal.type === 'transfer' || paymentModal.type === 'redpacket') && <PaymentModal />}
      </View>
      {callIsActive && <CallOverlay />}

    </View>
  );
}
