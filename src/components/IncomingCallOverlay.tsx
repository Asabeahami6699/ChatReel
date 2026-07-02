import React, { useEffect, useState } from 'react';
import { Modal } from 'react-native';
import { useIncomingCall } from '../hooks/useIncomingCall';
import IncomingCallScreen from '../screens/Call/IncomingCallScreen';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';

/**
 * Global ringer overlay. Rendered once at the app shell level.
 * Pops up an `IncomingCallScreen` whenever a `calls` row in 'ringing' state
 * targets the current user. Auto-dismisses if we navigate to ActiveCall, or
 * if the call leaves ringing.
 */
export function IncomingCallOverlay() {
  const incoming = useIncomingCall();
  const [peer, setPeer] = useState<{
    display_name: string | null;
    avatar_url: string | null;
  } | null>(null);

  useEffect(() => {
    if (!incoming || incoming.scope !== 'direct') {
      setPeer(null);
      return;
    }
    let alive = true;
    supabase.auth.getUser().then(async ({ data: meRes }) => {
      const myAuth = meRes.user?.id;
      const otherAuth =
        incoming.caller_id === myAuth ? incoming.callee_id : incoming.caller_id;
      if (!otherAuth) return;
      try {
        const { profile } = (await api.profiles.getByUserId(otherAuth)) as {
          profile: { display_name: string | null; avatar_url: string | null };
        };
        if (alive)
          setPeer({
            display_name: profile?.display_name ?? null,
            avatar_url: profile?.avatar_url ?? null,
          });
      } catch {
        /* ignore */
      }
    });
    return () => {
      alive = false;
    };
  }, [incoming]);

  const visible = !!incoming && incoming.status === 'ringing';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={() => {
        /* Decline is handled by IncomingCallScreen buttons only. */
      }}
    >
      {incoming ? (
        <IncomingCallScreen
          call={incoming}
          peer={peer}
          onDismiss={() => undefined}
        />
      ) : null}
    </Modal>
  );
}
