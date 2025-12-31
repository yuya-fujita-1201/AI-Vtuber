(() => {
  const statusEl = document.getElementById('dashboard-status');
  const subtitleEl = document.getElementById('dashboard-subtitle');
  const metaEl = document.getElementById('dashboard-meta');
  const logEl = document.getElementById('dashboard-log');

  const emotionButtons = Array.from(document.querySelectorAll('[data-emotion]'));
  const emotionDurationEl = document.getElementById('emotion-duration');
  const monologueButton = document.getElementById('trigger-monologue');
  const ngWordInput = document.getElementById('ng-word-input');
  const ngWordDurationEl = document.getElementById('ng-word-duration');
  const ngWordSubmit = document.getElementById('ng-word-submit');
  const muteUserInput = document.getElementById('mute-user-input');
  const muteUserDurationEl = document.getElementById('mute-user-duration');
  const muteUserSubmit = document.getElementById('mute-user-submit');

  let state = 'connecting';

  const labels = {
    connecting: 'Connecting',
    listening: 'Listening',
    thinking: 'Thinking',
    speaking: 'Speaking'
  };

  const setState = (next) => {
    state = next;
    statusEl.textContent = labels[next] || next;
    statusEl.dataset.state = next;
  };

  const addLog = (event, payload) => {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'log-line';
    const summary = payload ? JSON.stringify(payload).slice(0, 180) : '';
    line.innerHTML = `<span>${time} · ${event}</span>${summary}`;
    logEl.appendChild(line);
    while (logEl.children.length > 60) {
      logEl.removeChild(logEl.firstChild);
    }
    logEl.scrollTop = logEl.scrollHeight;
  };

  const toDurationMs = (inputEl, fallbackSeconds) => {
    const raw = inputEl?.value ?? '';
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 1000);
    }
    return fallbackSeconds * 1000;
  };

  const socket = io();

  socket.on('connect', () => {
    setState('listening');
    addLog('connected', { id: socket.id });
  });

  socket.on('disconnect', () => {
    setState('connecting');
    addLog('disconnected', null);
  });

  socket.on('comment', (payload) => {
    if (state !== 'speaking' && state !== 'thinking') {
      setState('listening');
    }
    addLog('comment', {
      author: payload?.message?.authorName,
      content: payload?.message?.content
    });
  });

  socket.on('thinking', (payload) => {
    if (state !== 'speaking') {
      setState('thinking');
    }
    addLog('thinking', payload);
  });

  socket.on('speaking_start', (payload) => {
    setState('speaking');
    subtitleEl.textContent = payload?.text || '';
    metaEl.textContent = `Duration: ${Math.round((payload?.durationMs || 0) / 100) / 10}s`;
    addLog('speaking_start', {
      text: payload?.text,
      durationMs: payload?.durationMs
    });
  });

  socket.on('speaking_end', () => {
    setState('listening');
    subtitleEl.textContent = 'Waiting for speech...';
    metaEl.textContent = 'No active speech.';
    addLog('speaking_end', null);
  });

  socket.on('emotion_changed', (payload) => {
    addLog('emotion_changed', payload);
  });

  emotionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const state = button.dataset.emotion;
      if (!state) return;
      const durationMs = toDurationMs(emotionDurationEl, 30);
      socket.emit('force_emotion', { state, durationMs });
      addLog('force_emotion', { state, durationMs });
    });
  });

  if (monologueButton) {
    monologueButton.addEventListener('click', () => {
      socket.emit('trigger_monologue');
      addLog('trigger_monologue', null);
    });
  }

  if (ngWordSubmit) {
    ngWordSubmit.addEventListener('click', () => {
      const word = ngWordInput?.value?.trim();
      if (!word) {
        addLog('set_ng_word', { error: 'empty' });
        return;
      }
      const durationMs = toDurationMs(ngWordDurationEl, 300);
      socket.emit('set_ng_word', { word, durationMs });
      addLog('set_ng_word', { word, durationMs });
      if (ngWordInput) ngWordInput.value = '';
    });
  }

  if (muteUserSubmit) {
    muteUserSubmit.addEventListener('click', () => {
      const user = muteUserInput?.value?.trim();
      if (!user) {
        addLog('mute_user', { error: 'empty' });
        return;
      }
      const durationMs = toDurationMs(muteUserDurationEl, 300);
      socket.emit('mute_user', { user, durationMs });
      addLog('mute_user', { user, durationMs });
      if (muteUserInput) muteUserInput.value = '';
    });
  }
})();
