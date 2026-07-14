/** Skip hangup while switching / answering waiting (LiveKit may disconnect twice). */
let skipHangupUntil = 0;

export function beginCallHoldDisconnect(): void {
  // Cover remount + delayed RoomEvent.Disconnected from the old session.
  skipHangupUntil = Date.now() + 4000;
}

export function consumeCallHoldDisconnect(): boolean {
  return Date.now() < skipHangupUntil;
}

export function clearCallHoldDisconnect(): void {
  skipHangupUntil = 0;
}
