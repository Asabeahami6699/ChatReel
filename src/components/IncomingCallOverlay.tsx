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
  const [suppressedCallId, setSuppressedCallId] = useState<string | null>(null);
  const [peer, setPeer] = useState<{
    display_name: string | null;
    avatar_url: string | null;
  } | null>(null);

  // New incoming call → clear prior dismiss so the next ring can show.
  useEffect(() => {
    if (incoming && suppressedCallId && incoming.id !== suppressedCallId) {
      setSuppressedCallId(null);
    }
    if (!incoming) setSuppressedCallId(null);
  }, [incoming, suppressedCallId]);

  const activeCall =
    incoming && incoming.id !== suppressedCallId ? incoming : null;

  useEffect(() => {
    if (!activeCall) {
      setPeer(null);
      return;
    }
    let alive = true;
    supabase.auth.getUser().then(async ({ data: meRes }) => {
      const myAuth = meRes.user?.id;
      if (activeCall.scope === 'group' && activeCall.group_id) {
        try {
          const { group } = await api.groups.get(activeCall.group_id);
          if (!alive) return;
          const g = group as { name?: string; avatar_url?: string | null };
          setPeer({
            display_name: g.name?.trim() || 'Group call',
            avatar_url: g.avatar_url ?? null,
          });
        } catch {
          if (alive) setPeer({ display_name: 'Group call', avatar_url: null });
        }
        return;
      }
      const otherAuth =
        activeCall.caller_id === myAuth ? activeCall.callee_id : activeCall.caller_id;
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
  }, [activeCall]);

  const visible =
    !!activeCall &&
    (activeCall.status === 'ringing' || activeCall.status === 'accepted');

  const dismiss = () => {
    if (activeCall?.id) setSuppressedCallId(activeCall.id);
  };

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
      {activeCall ? (
        <IncomingCallScreen call={activeCall} peer={peer} onDismiss={dismiss} />
      ) : null}
    </Modal>
  );
}
