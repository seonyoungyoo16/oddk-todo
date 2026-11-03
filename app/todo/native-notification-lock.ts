// Task-start and timer-boundary schedulers share the same OS reservation queue.
let queue: Promise<unknown> = Promise.resolve();
export function withNativeNotificationLock<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work);
  queue = next.catch(() => {});
  return next;
}
