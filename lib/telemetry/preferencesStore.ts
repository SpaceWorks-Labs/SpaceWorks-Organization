/** A tiny external store so a footer link can reopen the panel without sharing React state or touching storage. */
type State = { available: boolean; open: boolean };
const server: State = { available: false, open: false };
let state: State = server;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  const merged = { ...state, ...next };
  if (merged.available === state.available && merged.open === state.open) return;
  state = merged;
  for (const listener of listeners) listener();
}

export const preferencesStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: () => state,
  serverSnapshot: () => server,
  /** The panel applies to this page: something is configured and the page is on the public list. */
  setAvailable: (available: boolean) => set(available ? { available } : { available, open: false }),
  open: () => set({ open: true }),
  close: () => set({ open: false }),
};
