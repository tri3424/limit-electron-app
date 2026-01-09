import { v4 as uuidv4 } from 'uuid';
import { db, IntegrityEvent, IntegrityEventType } from '@/lib/db';

let integrityChannel: BroadcastChannel | null = null;

function getChannel() {
  if (typeof window === 'undefined') return null;
  if (!integrityChannel) {
    try {
      integrityChannel = new BroadcastChannel('exam-sync');
    } catch {
      integrityChannel = null;
    }
  }
  return integrityChannel;
}

export async function logIntegrityEvent(
  attemptId: string,
  type: IntegrityEventType,
  details?: string
): Promise<IntegrityEvent | null> {
  const event: IntegrityEvent = {
    id: uuidv4(),
    attemptId,
    type,
    timestamp: Date.now(),
    details,
  };

  try {
    await db.transaction('rw', db.integrityEvents, db.attempts, async () => {
      await db.integrityEvents.add(event);
      await db.attempts.where('id').equals(attemptId).modify((attempt) => {
        attempt.integrityEvents = [...(attempt.integrityEvents || []), event];
      });
    });
    try {
      const channel = getChannel();
      channel?.postMessage({ type: 'integrity-event', event });
    } catch (err) {
      // Silently handle BroadcastChannel errors (channel may be closed)
    }
    return event;
  } catch (error) {
    console.error('Failed to log integrity event', error);
    return null;
  }
}

export async function incrementVisibilityLoss(attemptId: string): Promise<number | null> {
  try {
    let nextValue: number | null = null;
    await db.attempts.where('id').equals(attemptId).modify((attempt) => {
      const value = (attempt.visibilityLosses ?? 0) + 1;
      attempt.visibilityLosses = value;
      nextValue = value;
    });
    return nextValue;
  } catch (error) {
    console.error('Failed to update visibility loss counter', error);
    return null;
  }
}

export function closeIntegrityChannel() {
  integrityChannel?.close();
  integrityChannel = null;
}

