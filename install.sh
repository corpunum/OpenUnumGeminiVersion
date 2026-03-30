#!/bin/bash
set -e

echo "--- OpenUnum Gemini One-Line Installer ---"

# 1. Install Bun if not present
if ! command -v bun &> /dev/null; then
    echo "Installing Bun runtime..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
else
    echo "Bun is already installed."
fi

# 2. Setup project directory
PROJECT_DIR="/home/corp-unum/OpenUnumGeminiVersion"
cd "$PROJECT_DIR"

# 3. Install Dependencies
echo "Installing project dependencies..."
bun install

# 4. Setup Systemd Service
echo "Configuring OpenUnum service..."
mkdir -p ~/.config/systemd/user/
cat <<EOF > ~/.config/systemd/user/openunum.service
[Unit]
Description=OpenUnum Gemini Version - Minimalist AI Assistant
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$HOME/.bun/bin/bun run src/index.ts
Environment=PATH=$HOME/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

# 5. Start Service
systemctl --user daemon-reload
systemctl --user enable openunum.service
systemctl --user restart openunum.service

echo ""
echo "--- Installation Complete! ---"
echo "OpenUnum is now running as a background service."
echo "Access the Control Center at: http://localhost:3000"
echo "Check status: systemctl --user status openunum.service"
echo "View logs: journalctl --user -u openunum.service -f"
