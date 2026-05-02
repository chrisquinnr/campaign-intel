/**
 * Shared in-process pub/sub for pushed questions.
 * Lives as a server-only module; adapter-node keeps it in memory for the
 * lifetime of the process, so all route handlers share the same subscriber set.
 */

const subscribers = new Set<(question: string) => void>();

/** Register a callback; returns an unsubscribe function. */
export function subscribe(cb: (question: string) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** Push a question to all currently connected browser tabs. */
export function broadcast(question: string): void {
  for (const cb of subscribers) cb(question);
}

/** Number of currently connected browser tabs. */
export function subscriberCount(): number {
  return subscribers.size;
}
