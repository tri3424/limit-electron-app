const attempts = new Map();

function getAttemptState(attemptId) {
  return attempts.get(attemptId);
}

function ensureAttempt(attemptId) {
  if (!attempts.has(attemptId)) {
    attempts.set(attemptId, {
      attemptId,
      moduleId: null,
      expectedDurationMs: 0,
      startUtc: 0,
      elapsedBase: 0,
      paused: false,
      startPerf: 0,
      mode: 'perModule',
      subscribers: new Set(),
      intervalId: null,
      lastDriftNotified: 0,
    });
  }
  return attempts.get(attemptId);
}

function startTicker(state) {
  stopTicker(state);
  state.startPerf = performance.now();
  state.intervalId = setInterval(() => tick(state), 1000);
  tick(state);
}

function stopTicker(state) {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
}

function tick(state) {
  if (!state) return;
  if (state.paused) {
    broadcast(state, {
      type: 'tick',
      elapsedMs: state.elapsedBase,
      remainingTimeMs: Math.max(state.expectedDurationMs - state.elapsedBase, 0),
      paused: true,
      attemptId: state.attemptId,
      mode: state.mode,
    });
    return;
  }
  const nowPerf = performance.now();
  const elapsed = state.elapsedBase + (nowPerf - state.startPerf);
  state.elapsedBase = elapsed;
  const remaining = Math.max(state.expectedDurationMs - elapsed, 0);

  const clockNow = Date.now();
  const elapsedUsingClock = clockNow - state.startUtc;
  const drift = Math.abs(elapsedUsingClock - elapsed);
  if (drift > 5000 && nowPerf - state.lastDriftNotified > 10000) {
    state.lastDriftNotified = nowPerf;
    broadcast(state, {
      type: 'clock-drift',
      attemptId: state.attemptId,
      driftMs: drift,
    });
  }

  broadcast(state, {
    type: 'tick',
    elapsedMs: elapsed,
    remainingTimeMs: remaining,
    paused: false,
    attemptId: state.attemptId,
    mode: state.mode,
  });

  if (remaining <= 0) {
    broadcast(state, {
      type: 'timeup',
      attemptId: state.attemptId,
    });
    stopTicker(state);
  }
}

function broadcast(state, message) {
  state.subscribers.forEach((port) => {
    try {
      port.postMessage(message);
    } catch (error) {
      console.error('Failed to post to port', error);
    }
  });
}

function handleMessage(port, data) {
  const { type, attemptId, payload } = data || {};
  if (!attemptId) return;
  const state = ensureAttempt(attemptId);

  switch (type) {
    case 'subscribe': {
      state.subscribers.add(port);
      port.postMessage({
        type: 'state',
        attemptId,
        remainingTimeMs: Math.max(state.expectedDurationMs - state.elapsedBase, 0),
        elapsedMs: state.elapsedBase,
        paused: state.paused,
        mode: state.mode,
      });
      break;
    }
    case 'unsubscribe': {
      state.subscribers.delete(port);
      if (state.subscribers.size === 0) {
        stopTicker(state);
        attempts.delete(attemptId);
      }
      break;
    }
    case 'start': {
      state.moduleId = payload.moduleId;
      state.expectedDurationMs = payload.expectedDurationMs;
      state.startUtc = payload.startUtc;
      state.elapsedBase = payload.elapsedMs || 0;
      state.mode = payload.mode || 'perModule';
      state.paused = !!payload.paused;
      startTicker(state);
      break;
    }
    case 'pause': {
      if (!state.paused) {
        state.elapsedBase = state.elapsedBase + (performance.now() - state.startPerf);
        state.paused = true;
        stopTicker(state);
        broadcast(state, {
          type: 'paused',
          attemptId,
          elapsedMs: state.elapsedBase,
        });
      }
      break;
    }
    case 'resume': {
      if (state.paused) {
        state.paused = false;
        startTicker(state);
        broadcast(state, {
          type: 'resumed',
          attemptId,
          elapsedMs: state.elapsedBase,
        });
      }
      break;
    }
    case 'restart': {
      state.expectedDurationMs = payload.expectedDurationMs;
      state.startUtc = payload.startUtc;
      state.elapsedBase = payload.elapsedMs || 0;
      state.mode = payload.mode || 'perModule';
      state.paused = false;
      startTicker(state);
      break;
    }
    case 'stop': {
      stopTicker(state);
      state.subscribers.delete(port);
      if (state.subscribers.size === 0) {
        attempts.delete(attemptId);
      }
      broadcast(state, { type: 'stopped', attemptId });
      break;
    }
    default:
      break;
  }
}

self.addEventListener('connect', (event) => {
  const port = event.ports[0];
  port.addEventListener('message', (messageEvent) => handleMessage(port, messageEvent.data));
  port.start();
});

