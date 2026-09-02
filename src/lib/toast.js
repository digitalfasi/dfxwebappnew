let listeners = [];

export function toast(message) {
  listeners.forEach((fn) => fn(message));
}

export function subscribe(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}
