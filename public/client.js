(() => {
  const statusEl = document.getElementById('status');
  const statusLabelEl = document.getElementById('status-label');
  const subtitleEl = document.getElementById('subtitle');
  const subtitleTextEl = document.getElementById('subtitle-text');
  const progressEl = document.getElementById('subtitle-progress');
  const commentEl = document.getElementById('comment-pop');
  const commentTextEl = document.getElementById('comment-text');

  if (!statusEl || !subtitleEl || !subtitleTextEl) {
    return;
  }

  let state = 'connecting';
  let clearTimer = null;
  let thinkingTimer = null;
  let typingTimer = null;
  let commentTimer = null;
  let typingToken = 0;

  const labels = {
    connecting: 'Connecting...',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Speaking'
  };

  const setState = (next) => {
    state = next;
    statusEl.dataset.state = next;
    if (statusLabelEl) {
      statusLabelEl.textContent = labels[next] || next;
    } else {
      statusEl.textContent = labels[next] || next;
    }
  };

  const stopTyping = () => {
    typingToken += 1;
    if (typingTimer) {
      window.clearInterval(typingTimer);
      typingTimer = null;
    }
  };

  const scheduleClear = (delayMs) => {
    if (clearTimer) {
      window.clearTimeout(clearTimer);
    }
    clearTimer = window.setTimeout(() => {
      clearSubtitle();
      if (state === 'speaking') {
        setState('listening');
      }
    }, delayMs);
  };

  const clearSubtitle = () => {
    subtitleEl.classList.remove('is-active');
    subtitleEl.dataset.empty = 'true';
    stopTyping();
    if (clearTimer) {
      window.clearTimeout(clearTimer);
      clearTimer = null;
    }
    window.setTimeout(() => {
      subtitleTextEl.textContent = 'Waiting for speech...';
    }, 240);
  };

  const setSubtitleText = (text, useTypewriter = true) => {
    const safeText = (text || '').trim();
    stopTyping();

    if (!useTypewriter || safeText.length > 160) {
      subtitleTextEl.textContent = safeText || '...';
      return;
    }

    subtitleTextEl.textContent = '';
    let index = 0;
    const token = typingToken;
    const speed = Math.max(14, Math.min(36, Math.round(420 / Math.max(1, safeText.length))));

    typingTimer = window.setInterval(() => {
      if (token !== typingToken) {
        window.clearInterval(typingTimer);
        typingTimer = null;
        return;
      }

      subtitleTextEl.textContent = safeText.slice(0, index + 1);
      index += 1;

      if (index >= safeText.length) {
        window.clearInterval(typingTimer);
        typingTimer = null;
      }
    }, speed);
  };

  const showSubtitle = (text, durationMs) => {
    const safeText = (text || '').trim();
    subtitleEl.dataset.empty = safeText ? 'false' : 'true';
    subtitleEl.classList.add('is-active');
    setSubtitleText(safeText || '...');

    const safeDuration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 2800;
    subtitleEl.style.setProperty('--duration', `${safeDuration}ms`);

    if (progressEl) {
      progressEl.classList.remove('run');
      void progressEl.offsetWidth;
      progressEl.classList.add('run');
    }

    scheduleClear(safeDuration + 800);
  };

  const showComment = (payload) => {
    if (!commentEl || !commentTextEl) {
      return;
    }

    const author =
      payload?.message?.authorName || payload?.authorName || payload?.author || payload?.name || '';
    const content = payload?.message?.content || payload?.content || payload?.text || '';
    const safeContent = (content || '').trim();

    if (!safeContent) {
      return;
    }

    const prefix = author ? `${author}: ` : '';
    commentTextEl.textContent = `${prefix}${safeContent}`;
    commentEl.classList.add('is-visible');
    commentEl.setAttribute('aria-hidden', 'false');

    if (commentTimer) {
      window.clearTimeout(commentTimer);
    }
    commentTimer = window.setTimeout(() => {
      commentEl.classList.remove('is-visible');
      commentEl.setAttribute('aria-hidden', 'true');
    }, 6000);
  };

  const socket = io();

  socket.on('connect', () => {
    setState('listening');
  });

  socket.on('disconnect', () => {
    setState('connecting');
  });

  socket.on('comment', (payload) => {
    showComment(payload);
    if (state !== 'speaking' && state !== 'thinking') {
      setState('listening');
    }
  });

  socket.on('thinking', () => {
    if (state !== 'speaking') {
      setState('thinking');
      if (thinkingTimer) {
        window.clearTimeout(thinkingTimer);
      }
      thinkingTimer = window.setTimeout(() => {
        if (state === 'thinking') {
          setState('listening');
        }
      }, 6000);
    }
  });

  socket.on('speaking_start', (payload) => {
    if (thinkingTimer) {
      window.clearTimeout(thinkingTimer);
    }
    setState('speaking');
    showSubtitle(payload?.text || '', payload?.durationMs);
    if (commentEl) {
      commentEl.classList.remove('is-visible');
      commentEl.setAttribute('aria-hidden', 'true');
    }
  });

  socket.on('speaking_end', () => {
    scheduleClear(2200);
  });
})();
