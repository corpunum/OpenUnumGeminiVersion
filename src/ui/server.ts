import { serve } from "bun";
import { ConfigManager } from "../core/config.ts";
import { fetchOllamaModels } from "../core/ollama.ts";
import { OpenUnumAgent } from "../core/agent.ts";

export function startUiServer(configManager: ConfigManager, agent: OpenUnumAgent) {
  const port = configManager.get().ui.port;
  
  serve({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);
      
      // Upgrade to WebSocket for Chat
      if (url.pathname === "/ws") {
        if (server.upgrade(req)) {
          return;
        }
        return new Response("Upgrade failed", { status: 400 });
      }

      // API Endpoints
      if (url.pathname === "/api/config" && req.method === "GET") {
        return Response.json(configManager.get());
      }
      
      if (url.pathname === "/api/config" && req.method === "POST") {
        const body = await req.json();
        configManager.set(body);
        return Response.json({ success: true });
      }

      if (url.pathname === "/api/ollama/models" && req.method === "GET") {
        const models = await fetchOllamaModels(configManager.get().model.baseUrl);
        return Response.json(models);
      }

      // Main UI
      if (url.pathname === "/") {
        return new Response(getHtml(), { headers: { "Content-Type": "text/html" } });
      }
      
      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      async open(ws) {
        agent.onStatus = (status) => {
          ws.send(JSON.stringify({ type: 'status', text: status }));
        };
      },
      async message(ws, message) {
        const data = JSON.parse(message.toString());
        if (data.type === 'chat') {
          ws.send(JSON.stringify({ type: 'status', text: 'Analyzing environment and planning task...' }));
          try {
            const response = await agent.step(data.text);
            ws.send(JSON.stringify({ type: 'response', text: response }));
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', text: err.message }));
          }
        }
      },
    },
  });
  console.log(`UI Server running at http://localhost:${port}`);
}

function getHtml() {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenUnum Control UI</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&family=Inter:wght@300;400;600&display=swap');
      
      :root { --bg: #0a0a0a; --card: #141414; --primary: #00E676; --secondary: #2979FF; --text: #f0f0f0; --border: #222; --accent: #FFD600; }
      
      body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
      
      /* Sidebar */
      .sidebar { width: 300px; background: var(--card); border-right: 1px solid var(--border); display: flex; flex-direction: column; z-index: 10; }
      .sidebar-header { padding: 25px; border-bottom: 1px solid var(--border); font-weight: 600; color: var(--primary); font-size: 1.1em; letter-spacing: 1px; }
      .nav { flex: 1; padding: 15px; }
      .nav-item { padding: 12px 16px; border-radius: 8px; cursor: pointer; margin-bottom: 8px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); font-size: 0.95em; border: 1px solid transparent; }
      .nav-item:hover { background: #1e1e1e; border-color: #333; }
      .nav-item.active { background: rgba(0, 230, 118, 0.1); color: var(--primary); border-color: var(--primary); font-weight: 600; }

      /* Main Content */
      .main { flex: 1; display: flex; flex-direction: column; background: var(--bg); position: relative; }
      .content-area { flex: 1; overflow-y: auto; padding: 30px; display: none; }
      .content-area.active { display: block; animation: fadeIn 0.3s ease-out; }

      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

      /* Chat UI */
      #chat-area { display: flex; flex-direction: column; height: 100%; max-width: 900px; margin: 0 auto; width: 100%; }
      #messages { flex: 1; overflow-y: auto; padding-bottom: 30px; scroll-behavior: smooth; }
      
      .msg { margin-bottom: 20px; max-width: 85%; padding: 14px 18px; border-radius: 12px; line-height: 1.6; font-size: 0.95em; position: relative; }
      .msg.user { align-self: flex-end; background: var(--secondary); color: white; border-bottom-right-radius: 4px; box-shadow: 0 4px 15px rgba(41, 121, 255, 0.2); }
      .msg.ai { align-self: flex-start; background: var(--card); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
      
      /* Status & Tool Animations */
      .msg.status { align-self: center; background: rgba(0, 230, 118, 0.05); color: var(--primary); font-style: italic; font-size: 0.85em; border: 1px dashed rgba(0, 230, 118, 0.3); padding: 8px 16px; border-radius: 20px; animation: pulse 2s infinite ease-in-out; margin: 15px 0; max-width: 90%; }
      
      @keyframes pulse { 0% { opacity: 0.6; transform: scale(0.98); } 50% { opacity: 1; transform: scale(1); } 100% { opacity: 0.6; transform: scale(0.98); } }

      .tool-call { margin-top: 10px; border: 1px solid var(--border); border-radius: 8px; background: #080808; overflow: hidden; }
      .tool-header { padding: 8px 12px; background: #1a1a1a; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-family: 'JetBrains Mono', monospace; font-size: 0.8em; color: var(--accent); }
      .tool-header:hover { background: #252525; }
      .tool-content { padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 0.85em; background: #050505; border-top: 1px solid var(--border); display: none; color: #aaa; white-space: pre-wrap; word-break: break-all; }
      .tool-call.expanded .tool-content { display: block; }
      .tool-call.expanded .tool-header { background: #222; border-bottom: 1px solid var(--border); }
      .tool-header::after { content: '▸'; transition: transform 0.2s; }
      .tool-call.expanded .tool-header::after { transform: rotate(90deg); }

      .composer { padding: 25px 0; border-top: 1px solid var(--border); display: flex; gap: 12px; background: var(--bg); }
      input[type="text"] { flex: 1; background: var(--card); border: 1px solid var(--border); color: white; padding: 14px 20px; border-radius: 10px; outline: none; transition: border-color 0.2s; font-size: 0.95em; }
      input[type="text"]:focus { border-color: var(--primary); }
      button.send-btn { background: var(--primary); color: black; border: none; padding: 0 25px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: transform 0.1s; display: flex; align-items: center; justify-content: center; }
      button.send-btn:active { transform: scale(0.95); }

      /* Settings & Browser */
      .settings-card { background: var(--card); padding: 25px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
      h2 { margin-top: 0; font-size: 1.1em; color: var(--primary); font-weight: 600; }
      label { display: block; margin: 18px 0 8px; font-size: 0.85em; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
      select, .settings-input { width: 100%; padding: 12px; background: #0a0a0a; border: 1px solid #333; color: white; border-radius: 8px; box-sizing: border-box; }

      @media (max-width: 768px) {
        body { flex-direction: column; }
        .sidebar { width: 100%; height: auto; border-right: none; border-bottom: 1px solid var(--border); }
        .sidebar-header { padding: 15px 20px; }
        .nav { display: flex; overflow-x: auto; padding: 10px; }
        .nav-item { margin-bottom: 0; margin-right: 8px; white-space: nowrap; padding: 8px 15px; font-size: 0.85em; }
        .content-area { padding: 20px; }
      }
    </style>
  </head>
  <body>
    <div class="sidebar">
      <div class="sidebar-header">OPENUNUM<span style="font-weight:300; opacity:0.6; margin-left:5px;">GEMINI</span></div>
      <div class="nav">
        <div class="nav-item active" onclick="showPage('chat')">Control Center</div>
        <div class="nav-item" onclick="showPage('settings')">Configuration</div>
        <div class="nav-item" onclick="showPage('browser')">Live Telemetry</div>
      </div>
    </div>

    <div class="main">
      <div id="chat" class="content-area active">
        <div id="chat-area">
          <div id="messages">
            <div class="msg ai">SYSTEM INITIALIZED: Hardware ownership verified. Tactical memory active. How shall I serve you, Master?</div>
          </div>
          <div class="composer">
            <input type="text" id="userInput" placeholder="Deploy a task or system command..." autocomplete="off">
            <button class="send-btn" onclick="sendMessage()">DEPLOY</button>
          </div>
        </div>
      </div>

      <div id="settings" class="content-area">
        <h1>Configuration</h1>
        <div class="settings-card">
          <h2>Neural Core</h2>
          <label>Provider</label>
          <select id="provider">
            <option value="ollama">Ollama (Local)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="nvidia">NVIDIA</option>
            <option value="openai">OpenAI</option>
          </select>
          <label>Base URL</label>
          <input type="text" id="baseUrl" class="settings-input">
          <label>Neural Model ID</label>
          <input type="text" id="modelId" list="modelList" class="settings-input">
          <datalist id="modelList"></datalist>
          <button onclick="saveConfig()" style="margin-top: 25px; background: var(--primary); color:black; border:none; padding:12px 24px; border-radius:8px; font-weight:700; cursor:pointer;">APPLY CHANGES</button>
        </div>
      </div>

      <div id="browser" class="content-area">
        <h1>Live Telemetry</h1>
        <div class="settings-card" style="text-align: center; border-style: dashed;">
          <p style="color: #666; font-size: 0.9em;">Browser Port 9222 Active. Awaiting navigation signals.</p>
          <div id="browser-view" style="width: 100%; height: 450px; background: #000; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 1px solid #222;">
            <div class="msg status" style="animation: pulse 1s infinite;">AWAITING SIGNAL</div>
          </div>
        </div>
      </div>
    </div>

    <script>
      let ws;
      function connectWS() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(protocol + '//' + location.host + '/ws');
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'response') {
            addMessage(data.text, 'ai');
          } else if (data.type === 'status') {
            addStatus(data.text);
          } else if (data.type === 'error') {
            addMessage('SYSTEM ERROR: ' + data.text, 'ai');
          }
        };
        ws.onclose = () => setTimeout(connectWS, 1000);
      }

      function showPage(pageId) {
        document.querySelectorAll('.content-area').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
        event.currentTarget.classList.add('active');
        if (pageId === 'settings') loadConfig();
      }

      function addMessage(text, role) {
        const div = document.createElement('div');
        div.className = 'msg ' + role;
        div.innerText = text;
        document.getElementById('messages').appendChild(div);
        div.scrollIntoView({behavior: 'smooth'});
      }

      function addStatus(text) {
        const messages = document.getElementById('messages');
        
        // Check if this is a tool execution or thought
        if (text.startsWith('Executing tool:')) {
          const toolName = text.split(':')[1].split('with')[0].trim();
          const args = text.split('args:')[1].trim();
          
          const toolDiv = document.createElement('div');
          toolDiv.className = 'tool-call';
          toolDiv.innerHTML = \`
            <div class="tool-header" onclick="this.parentElement.classList.toggle('expanded')">
              <span>DEPLOYED TOOL: \${toolName}</span>
            </div>
            <div class="tool-content">\${args}</div>
          \`;
          messages.appendChild(toolDiv);
        } else {
          const div = document.createElement('div');
          div.className = 'msg status';
          div.innerText = text;
          messages.appendChild(div);
        }
        messages.scrollTop = messages.scrollHeight;
      }

      function sendMessage() {
        const input = document.getElementById('userInput');
        const text = input.value.trim();
        if (!text) return;
        addMessage(text, 'user');
        ws.send(JSON.stringify({ type: 'chat', text: text }));
        input.value = '';
      }

      document.getElementById('userInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
      });

      async function loadConfig() {
        const res = await fetch('/api/config');
        const config = await res.json();
        document.getElementById('provider').value = config.model.provider;
        document.getElementById('baseUrl').value = config.model.baseUrl;
        document.getElementById('modelId').value = config.model.modelId;
      }

      async function saveConfig() {
        const config = {
          model: {
            provider: document.getElementById('provider').value,
            baseUrl: document.getElementById('baseUrl').value,
            modelId: document.getElementById('modelId').value
          }
        };
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
        alert('NEURAL CONFIGURATION UPDATED');
      }

      connectWS();
    </script>
  </body>
  </html>
  `;
}
