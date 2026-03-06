#!/usr/bin/env python3
"""
Upgrade SaintSal Labs streaming to WebSocket + enhanced SSE.
- Adds WebSocket endpoint for real-time bidirectional streaming
- Enhances SSE with pipeline status events (searching, thinking, streaming)
- Improves frontend with phase indicators and smoother rendering
"""

# ============================================================
# 1. SERVER.PY — Add WebSocket endpoint + enhance SSE
# ============================================================
with open('/home/user/workspace/saintsal-app/server.py', 'r') as f:
    code = f.read()

# Add WebSocket import
if 'WebSocket' not in code:
    code = code.replace(
        'from fastapi import FastAPI, Request',
        'from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect'
    )

# Add websockets to imports if not present
if 'import asyncio' not in code:
    code = code.replace('import json', 'import json\nimport asyncio')

# Enhance the SSE chat endpoint to send pipeline phases
old_sse_chat = '''    # Step 3: Stream response
    def generate():
        # First send sources
        if sources:
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\\n\\n"
        
        # Then stream the AI response
        with client.messages.stream(
            model="claude_sonnet_4_6",
            max_tokens=2048,
            system=system_prompt,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield f"data: {json.dumps({'type': 'text', 'content': text})}\\n\\n"
        
        yield f"data: {json.dumps({'type': 'done'})}\\n\\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")'''

new_sse_chat = '''    # Step 3: Stream response with pipeline phases
    def generate():
        # Phase: sources found
        if sources:
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\\n\\n"
        
        # Phase: thinking
        yield f"data: {json.dumps({'type': 'phase', 'phase': 'generating'})}\\n\\n"
        
        # Stream the AI response token-by-token
        with client.messages.stream(
            model="claude_sonnet_4_6",
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield f"data: {json.dumps({'type': 'text', 'content': text})}\\n\\n"
        
        yield f"data: {json.dumps({'type': 'done'})}\\n\\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")'''

code = code.replace(old_sse_chat, new_sse_chat)

# Also enhance the search phase to send a status event
old_search = '''    # Step 1: Web search for context
    if use_search and query:
        topic_map = {"sports": "news", "news": "news", "finance": "news", "realestate": "general", "tech": "general", "search": "general"}
        search_results = await search_web(
            query,
            search_depth="basic",
            max_results=5,
            topic=topic_map.get(vertical, "general")
        )
        sources = search_results.get("results", [])'''

new_search = '''    # Step 1: Web search for RAG context
    if use_search and query:
        topic_map = {"sports": "news", "news": "news", "finance": "news", "realestate": "general", "tech": "general", "search": "general"}
        search_results = await search_web(
            query,
            search_depth="advanced",
            max_results=8,
            topic=topic_map.get(vertical, "general")
        )
        sources = search_results.get("results", [])'''

code = code.replace(old_search, new_search)

# Add WebSocket endpoint after the SSE endpoint
ws_endpoint = '''


# ─── WebSocket Chat with Real-Time Streaming ──────────────────────────────────

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """WebSocket endpoint for real-time bidirectional chat streaming."""
    await websocket.accept()
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            query = data.get("message", "")
            vertical = data.get("vertical", "search")
            history = data.get("history", [])
            use_search = data.get("search", True)
            
            if not query:
                await websocket.send_json({"type": "error", "message": "Empty query"})
                continue
            
            system_prompt = SYSTEM_PROMPTS.get(vertical, SYSTEM_PROMPTS["search"])
            sources = []
            
            # Phase 1: Searching
            if use_search:
                await websocket.send_json({"type": "phase", "phase": "searching", "query": query})
                
                topic_map = {"sports": "news", "news": "news", "finance": "news", "realestate": "general", "tech": "general", "search": "general"}
                try:
                    search_results = await search_web(
                        query,
                        search_depth="advanced",
                        max_results=8,
                        topic=topic_map.get(vertical, "general")
                    )
                    sources = search_results.get("results", [])
                except Exception as e:
                    print(f"[WS] Search error: {e}")
                
                if sources:
                    await websocket.send_json({"type": "sources", "sources": sources})
                    context = "\\n\\n".join([
                        f"[{i+1}] {s['title']} ({s['domain']})\\n{s['content']}"
                        for i, s in enumerate(sources)
                    ])
                    system_prompt += f"\\n\\nHere are relevant web search results for the user's query. Use these to inform your response and cite them using [1], [2], etc.:\\n\\n{context}"
            
            # Phase 2: Generating
            await websocket.send_json({"type": "phase", "phase": "generating"})
            
            # Build messages
            messages = []
            for msg in history[-10:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
            messages.append({"role": "user", "content": query})
            
            # Phase 3: Stream tokens
            try:
                with client.messages.stream(
                    model="claude_sonnet_4_6",
                    max_tokens=4096,
                    system=system_prompt,
                    messages=messages,
                ) as stream:
                    for text in stream.text_stream:
                        await websocket.send_json({"type": "text", "content": text})
            except Exception as e:
                print(f"[WS] Stream error: {e}")
                await websocket.send_json({"type": "error", "message": f"AI generation error: {str(e)[:200]}"})
            
            # Done
            await websocket.send_json({"type": "done"})
    
    except WebSocketDisconnect:
        print("[WS] Client disconnected")
    except Exception as e:
        print(f"[WS] Error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)[:200]})
        except:
            pass

'''

# Insert after the SSE endpoint
code = code.replace(
    '# ─── Finance Market Data',
    ws_endpoint + '# ─── Finance Market Data'
)

with open('/home/user/workspace/saintsal-app/server.py', 'w') as f:
    f.write(code)
print("server.py upgraded with WebSocket endpoint ✓")


# ============================================================
# 2. APP.JS — Upgrade frontend for WebSocket + phase indicators
# ============================================================
with open('/home/user/workspace/saintsal-app/app.js', 'r') as f:
    js = f.read()

# Replace the entire sendMessage function with WebSocket-first approach
old_send = '''function sendMessage(query) {
  isStreaming = true;
  document.getElementById('sendBtn').disabled = true;

  // Switch to chat thread view
  document.getElementById('discoverArea').classList.add('hidden');
  document.getElementById('chatThreadArea').classList.add('active');

  // Add user query to history
  chatHistory.push({ role: 'user', content: query });

  // Build message HTML
  var messagesEl = document.getElementById('chatMessages');
  var msgBlock = document.createElement('div');
  msgBlock.className = 'chat-msg';

  var queryEl = document.createElement('div');
  queryEl.className = 'chat-msg-query';
  queryEl.textContent = query;
  msgBlock.appendChild(queryEl);

  var sourcesEl = document.createElement('div');
  sourcesEl.className = 'chat-msg-sources';
  sourcesEl.style.display = 'none';
  msgBlock.appendChild(sourcesEl);

  var answerEl = document.createElement('div');
  answerEl.className = 'chat-msg-answer';
  msgBlock.appendChild(answerEl);

  // Typing indicator
  var typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator';
  typingEl.innerHTML = '<span></span><span></span><span></span>';
  answerEl.appendChild(typingEl);

  messagesEl.appendChild(msgBlock);

  // Scroll to bottom
  var threadArea = document.getElementById('chatThreadArea');
  threadArea.scrollTop = threadArea.scrollHeight;

  var allSources = [];
  var rawText = '';
  var buffer = '';

  fetch(API + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: query,
      vertical: currentVertical,
      history: chatHistory.slice(-10),
      search: true
    })
  })
  .then(function(response) {
    if (!response.ok) throw new Error('API error: ' + response.status);
    var reader = response.body.getReader();
    var decoder = new TextDecoder();

    function processStream() {
      return reader.read().then(function(result) {
        if (result.done) {
          finalizeResponse(answerEl, rawText, typingEl, allSources);
          return;
        }

        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\\n');
        buffer = lines.pop(); // Keep incomplete last line in buffer

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line.startsWith('data: ')) continue;
          var jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') {
            finalizeResponse(answerEl, rawText, typingEl, allSources);
            return;
          }
          try {
            var data = JSON.parse(jsonStr);

            if (data.type === 'sources' && data.sources) {
              allSources = data.sources;
              renderSourcePills(sourcesEl, data.sources);
            } else if (data.type === 'text' && data.content) {
              if (typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
              rawText += data.content;
              answerEl.innerHTML = formatMarkdown(rawText);
              threadArea.scrollTop = threadArea.scrollHeight;
            } else if (data.type === 'done') {
              finalizeResponse(answerEl, rawText, typingEl, allSources);
              return;
            }
          } catch(e) {
            // Skip malformed JSON
          }
        }

        return processStream();
      });
    }

    return processStream();
  })
  .catch(function(err) {
    console.error('Chat error:', err);
    if (typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    answerEl.innerHTML = '<p style="color:var(--accent-red);">Unable to reach SAL. The backend may be starting up. Please try again in a moment.</p>';
    isStreaming = false;
    document.getElementById('sendBtn').disabled = false;
  });
}'''

new_send = '''// WebSocket connection manager
var wsConnection = null;
var wsReconnectAttempts = 0;
var wsMaxReconnects = 3;
var pendingWSCallback = null;

function getWSUrl() {
  // Build WebSocket URL from API base
  var base = API.replace('__PORT_8000__', location.origin + location.pathname.replace(/\\/[^/]*$/, '') + '/__PORT_8000__');
  if (base.startsWith('http://')) return base.replace('http://', 'ws://') + '/ws/chat';
  if (base.startsWith('https://')) return base.replace('https://', 'wss://') + '/ws/chat';
  // For relative paths or proxied deployments
  var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + location.host + base + '/ws/chat';
}

function connectWebSocket() {
  try {
    var wsUrl = getWSUrl();
    wsConnection = new WebSocket(wsUrl);
    wsConnection.onopen = function() { wsReconnectAttempts = 0; };
    wsConnection.onclose = function() { wsConnection = null; };
    wsConnection.onerror = function() { wsConnection = null; };
  } catch(e) {
    wsConnection = null;
  }
}

function sendMessage(query) {
  isStreaming = true;
  document.getElementById('sendBtn').disabled = true;

  // Switch to chat thread view
  document.getElementById('discoverArea').classList.add('hidden');
  document.getElementById('chatThreadArea').classList.add('active');

  // Add user query to history
  chatHistory.push({ role: 'user', content: query });

  // Build message HTML
  var messagesEl = document.getElementById('chatMessages');
  var msgBlock = document.createElement('div');
  msgBlock.className = 'chat-msg';

  var queryEl = document.createElement('div');
  queryEl.className = 'chat-msg-query';
  queryEl.textContent = query;
  msgBlock.appendChild(queryEl);

  // Phase indicator (searching / thinking)
  var phaseEl = document.createElement('div');
  phaseEl.className = 'chat-phase-indicator';
  phaseEl.innerHTML = '<svg class="phase-spinner" viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="31.4" stroke-dashoffset="10"><animateTransform attributeName="transform" type="rotate" dur="0.8s" from="0 12 12" to="360 12 12" repeatCount="indefinite"/></circle></svg><span class="phase-text">Searching the web...</span>';
  msgBlock.appendChild(phaseEl);

  var sourcesEl = document.createElement('div');
  sourcesEl.className = 'chat-msg-sources';
  sourcesEl.style.display = 'none';
  msgBlock.appendChild(sourcesEl);

  var answerEl = document.createElement('div');
  answerEl.className = 'chat-msg-answer';
  msgBlock.appendChild(answerEl);

  messagesEl.appendChild(msgBlock);

  // Scroll to bottom
  var threadArea = document.getElementById('chatThreadArea');
  threadArea.scrollTop = threadArea.scrollHeight;

  var allSources = [];
  var rawText = '';

  // Unified message handler for both WS and SSE
  function handleEvent(data) {
    if (data.type === 'phase') {
      var phaseLabels = { searching: 'Searching the web...', generating: 'SAL is thinking...', streaming: 'Writing response...' };
      phaseEl.querySelector('.phase-text').textContent = phaseLabels[data.phase] || data.phase;
      phaseEl.style.display = 'flex';
    } else if (data.type === 'sources' && data.sources) {
      allSources = data.sources;
      renderSourcePills(sourcesEl, data.sources);
      phaseEl.querySelector('.phase-text').textContent = data.sources.length + ' sources found';
    } else if (data.type === 'text' && data.content) {
      if (phaseEl.style.display !== 'none') {
        phaseEl.style.display = 'none';
      }
      rawText += data.content;
      answerEl.innerHTML = formatMarkdown(rawText);
      threadArea.scrollTop = threadArea.scrollHeight;
    } else if (data.type === 'done') {
      phaseEl.style.display = 'none';
      finalizeResponse(answerEl, rawText, null, allSources);
    } else if (data.type === 'error') {
      phaseEl.style.display = 'none';
      answerEl.innerHTML = '<p style="color:var(--accent-red);">' + escapeHtml(data.message || 'An error occurred') + '</p>';
      isStreaming = false;
      document.getElementById('sendBtn').disabled = false;
    }
  }

  // Try WebSocket first, fall back to SSE
  var useWS = false;
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    useWS = true;
  }

  if (useWS) {
    // WebSocket path
    wsConnection.onmessage = function(event) {
      try { handleEvent(JSON.parse(event.data)); } catch(e) {}
    };
    wsConnection.send(JSON.stringify({
      message: query,
      vertical: currentVertical,
      history: chatHistory.slice(-10),
      search: true
    }));
  } else {
    // SSE fallback (works everywhere including proxied deployments)
    var buffer = '';
    fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: query,
        vertical: currentVertical,
        history: chatHistory.slice(-10),
        search: true
      })
    })
    .then(function(response) {
      if (!response.ok) throw new Error('API error: ' + response.status);
      var reader = response.body.getReader();
      var decoder = new TextDecoder();

      // Show searching phase
      phaseEl.querySelector('.phase-text').textContent = 'Searching the web...';

      function processStream() {
        return reader.read().then(function(result) {
          if (result.done) {
            if (rawText) finalizeResponse(answerEl, rawText, null, allSources);
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\\n');
          buffer = lines.pop();

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line.startsWith('data: ')) continue;
            var jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') {
              finalizeResponse(answerEl, rawText, null, allSources);
              return;
            }
            try { handleEvent(JSON.parse(jsonStr)); } catch(e) {}
          }

          return processStream();
        });
      }

      return processStream();
    })
    .catch(function(err) {
      console.error('Chat error:', err);
      phaseEl.style.display = 'none';
      answerEl.innerHTML = '<p style="color:var(--accent-red);">Unable to reach SAL. The backend may be starting up. Please try again in a moment.</p>';
      isStreaming = false;
      document.getElementById('sendBtn').disabled = false;
    });
  }
}

// Try to connect WebSocket on load (non-blocking)
setTimeout(function() { try { connectWebSocket(); } catch(e) {} }, 2000);'''

js = js.replace(old_send, new_send)

# Update finalizeResponse to handle null typingEl
old_finalize = '''function finalizeResponse(answerEl, rawText, typingEl, sources) {
  if (typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);'''
new_finalize = '''function finalizeResponse(answerEl, rawText, typingEl, sources) {
  if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);'''
js = js.replace(old_finalize, new_finalize)

with open('/home/user/workspace/saintsal-app/app.js', 'w') as f:
    f.write(js)
print("app.js upgraded with WebSocket + phase indicators ✓")


# ============================================================
# 3. STYLE.CSS — Add phase indicator styles
# ============================================================
with open('/home/user/workspace/saintsal-app/style.css', 'r') as f:
    css = f.read()

if '.chat-phase-indicator' not in css:
    css += '''
/* Chat phase indicators — searching, thinking, streaming */
.chat-phase-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  animation: phaseFadeIn 0.3s ease;
}
.phase-spinner { color: var(--accent-gold); flex-shrink: 0; }
.phase-text { font-weight: 500; letter-spacing: 0.01em; }

@keyframes phaseFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Smoother answer text appearance */
.chat-msg-answer p, .chat-msg-answer h2, .chat-msg-answer h3, .chat-msg-answer ul, .chat-msg-answer li {
  animation: textFadeIn 0.15s ease;
}
@keyframes textFadeIn {
  from { opacity: 0.7; }
  to { opacity: 1; }
}

/* Source pills upgrade — more polished */
.chat-msg-sources {
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 0;
  animation: phaseFadeIn 0.3s ease;
}
'''

with open('/home/user/workspace/saintsal-app/style.css', 'w') as f:
    f.write(css)
print("style.css upgraded with phase indicator styles ✓")

print("\n=== STREAMING UPGRADE COMPLETE ===")
print("Backend:")
print("  - WebSocket endpoint: /ws/chat")
print("  - Enhanced SSE with pipeline phases")
print("  - Advanced search (8 results, advanced depth)")
print("  - 4096 max tokens")
print("Frontend:")
print("  - WebSocket-first with SSE fallback")
print("  - Phase indicators: Searching → Sources Found → Thinking → Streaming")
print("  - Smooth animations on text appearance")
print("  - Unified event handler for both transport layers")
