/* ============================================================
   SAINTSALLABS™ VOICE ENGINE
   ElevenLabs Integration — STT, TTS, Conversational AI
   17 languages · Auto-detect · Accessibility-first
   ============================================================ */

/* ─── Chat Mic — Speech-to-Text for main input ───────────── */

var chatSTT = {
  active: false,
  recognition: null,
  mediaRecorder: null,
  audioChunks: [],
  stream: null,
  finalTranscript: ''
};

function toggleChatMic() {
  if (chatSTT.active) {
    stopChatMic();
  } else {
    startChatMic();
  }
}

function startChatMic() {
  var micBtn = document.querySelector('.prompt-mic');
  var promptInput = document.getElementById('promptInput');
  if (!promptInput) return;

  // Try Web Speech API first (Chrome/Edge — free, instant, no server)
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    try {
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      var recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = ''; // empty = auto-detect

      chatSTT.recognition = recognition;
      chatSTT.active = true;
      chatSTT.finalTranscript = promptInput.value || '';

      if (micBtn) micBtn.classList.add('recording');
      promptInput.placeholder = '🎙 Listening... speak now';

      recognition.onresult = function(event) {
        var interim = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            chatSTT.finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        promptInput.value = chatSTT.finalTranscript + interim;
      };

      recognition.onerror = function(event) {
        console.log('[ChatMic] Error:', event.error);
        if (event.error === 'not-allowed') {
          if (typeof showToast === 'function') showToast('Microphone access denied. Please allow mic in browser settings.', 'error');
        }
        stopChatMic();
      };

      recognition.onend = function() {
        // Auto-restart if still active (handles Chrome's ~60s cutoff)
        if (chatSTT.active) {
          try { recognition.start(); } catch(e) { stopChatMic(); }
        }
      };

      recognition.start();
      if (typeof showToast === 'function') showToast('Listening... tap mic again to stop', 'info');
      return;
    } catch(e) {
      console.log('[ChatMic] Web Speech API unavailable, falling back to Deepgram');
    }
  }

  // Fallback: Record audio blob → send to server transcription endpoint
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    chatSTT.stream = stream;
    chatSTT.audioChunks = [];
    var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    var recorder = new MediaRecorder(stream, { mimeType: mimeType });
    chatSTT.mediaRecorder = recorder;
    chatSTT.active = true;

    if (micBtn) micBtn.classList.add('recording');
    promptInput.placeholder = '🎙 Recording... tap mic to stop & transcribe';

    recorder.ondataavailable = function(e) {
      if (e.data.size > 0) chatSTT.audioChunks.push(e.data);
    };

    recorder.onstop = async function() {
      promptInput.placeholder = 'Transcribing...';
      var blob = new Blob(chatSTT.audioChunks, { type: 'audio/webm' });
      try {
        var formData = new FormData();
        formData.append('audio', blob, 'voice.webm');
        var resp = await fetch('/api/studio/transcribe', { method: 'POST', body: formData });
        var data = await resp.json();
        if (data.text) {
          promptInput.value = (promptInput.value ? promptInput.value + ' ' : '') + data.text;
          promptInput.focus();
          if (typeof showToast === 'function') showToast('Voice transcribed via ' + (data.provider || 'AI'), 'success');
        } else {
          if (typeof showToast === 'function') showToast('Could not transcribe audio', 'error');
        }
      } catch(e) {
        if (typeof showToast === 'function') showToast('Transcription failed', 'error');
      }
      promptInput.placeholder = 'Ask SAL anything...';
    };

    recorder.start();
    if (typeof showToast === 'function') showToast('Recording... tap mic to stop', 'info');
  }).catch(function(e) {
    if (typeof showToast === 'function') showToast('Microphone access denied. Please allow mic in browser settings.', 'error');
  });
}

function stopChatMic() {
  var micBtn = document.querySelector('.prompt-mic');
  var promptInput = document.getElementById('promptInput');

  chatSTT.active = false;
  if (micBtn) micBtn.classList.remove('recording');
  if (promptInput) promptInput.placeholder = 'Ask SAL anything...';

  if (chatSTT.recognition) {
    chatSTT.recognition.onend = null; // prevent restart
    chatSTT.recognition.stop();
    chatSTT.recognition = null;
  }

  if (chatSTT.mediaRecorder && chatSTT.mediaRecorder.state !== 'inactive') {
    chatSTT.mediaRecorder.stop();
    chatSTT.mediaRecorder = null;
  }

  if (chatSTT.stream) {
    chatSTT.stream.getTracks().forEach(function(t) { t.stop(); });
    chatSTT.stream = null;
  }
}


/* ─── TTS — Read SAL responses aloud ──────────────────────── */

var ttsState = {
  playing: false,
  currentAudio: null,
  currentBtn: null
};

function speakMessage(btn, text) {
  // If already playing this message, stop it
  if (ttsState.playing && ttsState.currentBtn === btn) {
    stopTTS();
    return;
  }

  // Stop any current playback
  if (ttsState.playing) stopTTS();

  // Strip markdown/HTML for cleaner speech
  var cleanText = text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`[^`]+`/g, function(m) { return m.replace(/`/g, ''); })
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#+\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim();

  if (!cleanText) return;

  // Visual feedback
  btn.classList.add('tts-loading');
  btn.title = 'Loading audio...';

  fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: cleanText })
  })
  .then(function(resp) { return resp.json(); })
  .then(function(data) {
    if (data.audio) {
      var audio = new Audio(data.audio);
      ttsState.currentAudio = audio;
      ttsState.currentBtn = btn;
      ttsState.playing = true;

      btn.classList.remove('tts-loading');
      btn.classList.add('tts-playing');
      btn.title = 'Stop reading';

      audio.onended = function() {
        stopTTS();
      };
      audio.onerror = function() {
        if (typeof showToast === 'function') showToast('Audio playback error', 'error');
        stopTTS();
      };
      audio.play();
    } else {
      btn.classList.remove('tts-loading');
      if (typeof showToast === 'function') showToast('TTS: ' + (data.error || 'Failed'), 'error');
    }
  })
  .catch(function(e) {
    btn.classList.remove('tts-loading');
    if (typeof showToast === 'function') showToast('TTS request failed', 'error');
  });
}

function stopTTS() {
  if (ttsState.currentAudio) {
    ttsState.currentAudio.pause();
    ttsState.currentAudio.currentTime = 0;
    ttsState.currentAudio = null;
  }
  if (ttsState.currentBtn) {
    ttsState.currentBtn.classList.remove('tts-playing', 'tts-loading');
    ttsState.currentBtn.title = 'Read aloud';
    ttsState.currentBtn = null;
  }
  ttsState.playing = false;
}

/**
 * Injects a speaker icon button into a SAL response message element.
 * Call this after each SAL message is rendered in the chat.
 * @param {HTMLElement} msgEl - The message container element
 * @param {string} text - The raw text content of the message
 */
function addTTSButton(msgEl, text) {
  if (!msgEl || !text) return;
  // Don't double-add
  if (msgEl.querySelector('.tts-btn')) return;

  var btn = document.createElement('button');
  btn.className = 'tts-btn';
  btn.title = 'Read aloud';
  btn.setAttribute('aria-label', 'Read message aloud');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
  btn.onclick = function(e) {
    e.stopPropagation();
    speakMessage(btn, text);
  };

  // Find or create action bar
  var actions = msgEl.querySelector('.msg-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'msg-actions';
    msgEl.appendChild(actions);
  }
  actions.insertBefore(btn, actions.firstChild);
}


/* ─── Voice AI Orb — ElevenLabs Conversational AI ─────────── */

var voiceAI = {
  active: false,
  ws: null,
  audioContext: null,
  mediaStream: null,
  processor: null,
  playbackQueue: [],
  isPlaying: false
};

async function toggleVoiceAI() {
  if (voiceAI.active) {
    disconnectVoiceAI();
  } else {
    await connectVoiceAI();
  }
}

async function connectVoiceAI() {
  var orb = document.getElementById('voiceOrb');
  var label = document.getElementById('voiceCtaLabel');
  var statusDot = document.getElementById('voiceStatusDot');
  var statusText = document.getElementById('voiceStatusText');
  var waveform = document.getElementById('voiceWaveform');

  if (label) label.textContent = 'Connecting...';
  if (statusText) statusText.textContent = 'Connecting...';

  try {
    // 1. Get signed URL from server (keeps API key server-side)
    var resp = await fetch('/api/voice/signed-url');
    var data = await resp.json();
    if (!data.signed_url) {
      throw new Error(data.error || 'No signed URL returned');
    }

    // 2. Get microphone access
    var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceAI.mediaStream = stream;

    // 3. Set up AudioContext for processing mic input
    voiceAI.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    var source = voiceAI.audioContext.createMediaStreamSource(stream);
    var scriptNode = voiceAI.audioContext.createScriptProcessor(4096, 1, 1);
    voiceAI.processor = scriptNode;

    // 4. Connect WebSocket to ElevenLabs Conversational AI
    var ws = new WebSocket(data.signed_url);
    voiceAI.ws = ws;

    ws.onopen = function() {
      console.log('[VoiceAI] WebSocket connected');
      voiceAI.active = true;

      if (orb) orb.classList.add('active');
      if (label) label.textContent = 'Listening...';
      if (statusDot) statusDot.style.background = 'var(--accent-green)';
      if (statusText) statusText.textContent = 'Connected';
      if (waveform) waveform.classList.add('active');
      if (typeof animateWaveform === 'function') animateWaveform(true);
      if (typeof appendVoiceTranscript === 'function') {
        appendVoiceTranscript('system', 'SAL Voice connected. Speak now...');
      }
    };

    // Process incoming messages from ElevenLabs
    ws.onmessage = function(event) {
      try {
        var msg = JSON.parse(event.data);

        if (msg.type === 'audio') {
          // Agent audio response — queue for playback
          if (msg.audio && msg.audio.chunk) {
            playAgentAudio(msg.audio.chunk);
          }
        } else if (msg.type === 'agent_response') {
          // Agent text transcript
          if (typeof appendVoiceTranscript === 'function') {
            appendVoiceTranscript('sal', msg.agent_response || msg.text || '');
          }
        } else if (msg.type === 'user_transcript') {
          // User speech transcript
          if (typeof appendVoiceTranscript === 'function') {
            appendVoiceTranscript('user', msg.user_transcript || msg.text || '');
          }
        } else if (msg.type === 'interruption') {
          // User interrupted agent
          stopAgentAudio();
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch(e) {
        // Binary audio data
        if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
          playAgentAudioBlob(event.data);
        }
      }
    };

    ws.onerror = function(e) {
      console.error('[VoiceAI] WebSocket error:', e);
      if (typeof showToast === 'function') showToast('Voice AI connection error', 'error');
      disconnectVoiceAI();
    };

    ws.onclose = function(e) {
      console.log('[VoiceAI] WebSocket closed:', e.code, e.reason);
      if (voiceAI.active) {
        disconnectVoiceAI();
        if (typeof showToast === 'function') showToast('Voice AI disconnected', 'info');
      }
    };

    // 5. Stream mic audio to WebSocket
    scriptNode.onaudioprocess = function(event) {
      if (!voiceAI.active || !voiceAI.ws || voiceAI.ws.readyState !== WebSocket.OPEN) return;

      var inputData = event.inputBuffer.getChannelData(0);
      // Convert Float32 to Int16 PCM
      var pcm = new Int16Array(inputData.length);
      for (var i = 0; i < inputData.length; i++) {
        var s = Math.max(-1, Math.min(1, inputData[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      // Send as base64
      var b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm.buffer)));
      voiceAI.ws.send(JSON.stringify({
        user_audio_chunk: b64
      }));
    };

    source.connect(scriptNode);
    scriptNode.connect(voiceAI.audioContext.destination);

  } catch(e) {
    console.error('[VoiceAI] Connection error:', e);
    if (typeof showToast === 'function') showToast('Voice AI: ' + (e.message || 'Connection failed'), 'error');
    if (label) label.textContent = 'Tap to Talk to SAL';
    if (statusText) statusText.textContent = 'Ready';
    disconnectVoiceAI();
  }
}

function disconnectVoiceAI() {
  var orb = document.getElementById('voiceOrb');
  var label = document.getElementById('voiceCtaLabel');
  var statusDot = document.getElementById('voiceStatusDot');
  var statusText = document.getElementById('voiceStatusText');
  var waveform = document.getElementById('voiceWaveform');

  voiceAI.active = false;

  if (voiceAI.ws) {
    voiceAI.ws.close();
    voiceAI.ws = null;
  }
  if (voiceAI.processor) {
    voiceAI.processor.disconnect();
    voiceAI.processor = null;
  }
  if (voiceAI.audioContext) {
    voiceAI.audioContext.close().catch(function(){});
    voiceAI.audioContext = null;
  }
  if (voiceAI.mediaStream) {
    voiceAI.mediaStream.getTracks().forEach(function(t) { t.stop(); });
    voiceAI.mediaStream = null;
  }
  stopAgentAudio();

  if (orb) orb.classList.remove('active');
  if (label) label.textContent = 'Tap to Talk to SAL';
  if (statusDot) statusDot.style.background = '';
  if (statusText) statusText.textContent = 'Ready';
  if (waveform) waveform.classList.remove('active');
  if (typeof animateWaveform === 'function') animateWaveform(false);
}

// Agent audio playback
var agentAudioCtx = null;
var agentAudioQueue = [];
var agentPlaying = false;

function playAgentAudio(base64Chunk) {
  if (!agentAudioCtx) {
    agentAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Decode base64 to ArrayBuffer
  var binary = atob(base64Chunk);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  agentAudioCtx.decodeAudioData(bytes.buffer.slice(0), function(buffer) {
    agentAudioQueue.push(buffer);
    if (!agentPlaying) drainAgentAudioQueue();
  }, function(err) {
    console.log('[VoiceAI] Audio decode error, trying raw PCM');
  });
}

function playAgentAudioBlob(data) {
  if (!agentAudioCtx) {
    agentAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  var reader = new FileReader();
  reader.onload = function() {
    agentAudioCtx.decodeAudioData(reader.result, function(buffer) {
      agentAudioQueue.push(buffer);
      if (!agentPlaying) drainAgentAudioQueue();
    });
  };
  if (data instanceof Blob) {
    reader.readAsArrayBuffer(data);
  } else {
    // Already ArrayBuffer
    agentAudioCtx.decodeAudioData(data, function(buffer) {
      agentAudioQueue.push(buffer);
      if (!agentPlaying) drainAgentAudioQueue();
    });
  }
}

function drainAgentAudioQueue() {
  if (agentAudioQueue.length === 0) {
    agentPlaying = false;
    return;
  }
  agentPlaying = true;
  var buffer = agentAudioQueue.shift();
  var source = agentAudioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(agentAudioCtx.destination);
  source.onended = function() { drainAgentAudioQueue(); };
  source.start();
}

function stopAgentAudio() {
  agentAudioQueue = [];
  agentPlaying = false;
}
