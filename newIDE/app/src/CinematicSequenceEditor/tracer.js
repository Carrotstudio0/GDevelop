// Lightweight JS tracer for the Cinematic Sequence editor.
// Emits structured events to console and to window.__gdTraces (for collection by tooling).

const Tracer = {
  traceEvent(name, data = {}) {
    const ts = new Date().toISOString();
    const event = { ts, name, data };
    // Console for immediate inspection
    console.debug('[CinematicTrace]', event);
    // Push to global array so external tooling (devtools or tests) can collect traces
    try {
      if (!window.__gdTraces) window.__gdTraces = [];
      window.__gdTraces.push(event);
    } catch (e) {
      // ignore (non-browser env)
    }
  },

  scope(name, fn) {
    this.traceEvent(name + '_start');
    try {
      return fn();
    } finally {
      this.traceEvent(name + '_end');
    }
  },
};

export default Tracer;
