import { useCallback, useState } from 'react';
import type { CallVideoSignal, PublishCallVideoSignal } from './callVideoSignaling';
import { showAppToast } from '../../lib/appToast';

type Options = {
  peerName: string;
  startedAsVideo: boolean;
  publishSignal: PublishCallVideoSignal;
  enableLocalVideo: () => Promise<void>;
  disableLocalVideo: () => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
};

export function useVideoCallNegotiation({
  peerName,
  startedAsVideo,
  publishSignal,
  enableLocalVideo,
  disableLocalVideo,
  setCameraEnabled,
}: Options) {
  const [sharedVideo, setSharedVideo] = useState(startedAsVideo);
  const [videoEnabled, setVideoEnabled] = useState(startedAsVideo);
  const [outgoingRequest, setOutgoingRequest] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState(false);

  const enterSharedVideo = useCallback(async () => {
    await enableLocalVideo();
    setSharedVideo(true);
    setVideoEnabled(true);
    setOutgoingRequest(false);
    setIncomingRequest(false);
  }, [enableLocalVideo]);

  const revertToVoice = useCallback(async () => {
    publishSignal({ type: 'video_revert' });
    await disableLocalVideo();
    setSharedVideo(false);
    setVideoEnabled(false);
  }, [disableLocalVideo, publishSignal]);

  const handleSignal = useCallback(
    (signal: CallVideoSignal) => {
      switch (signal.type) {
        case 'video_request':
          setIncomingRequest(true);
          break;
        case 'video_accept':
          void enterSharedVideo();
          break;
        case 'video_decline':
          setOutgoingRequest(false);
          showAppToast(`${peerName} declined video`);
          break;
        case 'video_revert':
          void disableLocalVideo();
          setSharedVideo(false);
          setVideoEnabled(false);
          break;
        default:
          break;
      }
    },
    [disableLocalVideo, enterSharedVideo, peerName]
  );

  const acceptIncomingVideo = useCallback(async () => {
    publishSignal({ type: 'video_accept' });
    await enterSharedVideo();
  }, [enterSharedVideo, publishSignal]);

  const declineIncomingVideo = useCallback(() => {
    publishSignal({ type: 'video_decline' });
    setIncomingRequest(false);
  }, [publishSignal]);

  const toggleVideo = useCallback(async () => {
    if (!sharedVideo) {
      if (outgoingRequest) return;
      publishSignal({ type: 'video_request' });
      setOutgoingRequest(true);
      return;
    }

    if (startedAsVideo) {
      const next = !videoEnabled;
      await setCameraEnabled(next);
      setVideoEnabled(next);
      return;
    }

    if (videoEnabled) {
      await revertToVoice();
      return;
    }

    await enableLocalVideo();
    setVideoEnabled(true);
  }, [
    enableLocalVideo,
    outgoingRequest,
    publishSignal,
    revertToVoice,
    setCameraEnabled,
    sharedVideo,
    startedAsVideo,
    videoEnabled,
  ]);

  return {
    sharedVideo,
    videoEnabled,
    outgoingRequest,
    incomingRequest,
    handleSignal,
    toggleVideo,
    acceptIncomingVideo,
    declineIncomingVideo,
    enterSharedVideo,
  };
}
