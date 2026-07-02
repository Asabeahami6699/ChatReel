import { useEffect, useMemo, useState } from 'react';
import {
  getReelUploadQueueSnapshot,
  subscribeReelUploadQueue,
  type ReelUploadTask,
} from '../lib/reelUploadQueue';

export function useReelUploadQueue() {
  const [tasks, setTasks] = useState<ReelUploadTask[]>(() => getReelUploadQueueSnapshot());

  useEffect(() => subscribeReelUploadQueue(setTasks), []);

  const summary = useMemo(() => {
    let queued = 0;
    let uploading = 0;
    let publishing = 0;
    let done = 0;
    let error = 0;
    for (const task of tasks) {
      if (task.status === 'queued') queued += 1;
      else if (task.status === 'uploading') uploading += 1;
      else if (task.status === 'publishing') publishing += 1;
      else if (task.status === 'done') done += 1;
      else if (task.status === 'error') error += 1;
    }
    return { queued, uploading, publishing, done, error };
  }, [tasks]);

  const activeCount = summary.queued + summary.uploading + summary.publishing;

  const activeProgress = useMemo(() => {
    const active = tasks.filter(
      (t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'publishing'
    );
    if (active.length === 0) return 0;
    return Math.round(active.reduce((sum, t) => sum + (t.progress ?? 0), 0) / active.length);
  }, [tasks]);

  return { tasks, summary, activeCount, activeProgress };
}
