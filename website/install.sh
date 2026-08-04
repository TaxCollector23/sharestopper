#!/bin/bash
#
# ShareStopper Installer
# Privacy firewall for screen sharing
#

set -e

INSTALL_DIR="$HOME/.sharestopper"
BIN_DIR="/usr/local/bin"
REPO_URL="https://github.com/TaxCollector23/sharestopper"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

log() { echo -e "  ${GREEN}▸${NC} $1"; }
warn() { echo -e "  ${YELLOW}▸${NC} $1"; }
error() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

echo ""
echo -e "${GREEN}${BOLD}  ShareStopper${NC}"
echo -e "${DIM}  Privacy firewall for screen sharing${NC}"
echo ""

if [[ "$(uname)" != "Darwin" ]]; then
  error "ShareStopper currently supports macOS only"
fi

if ! command -v node &>/dev/null; then
  error "Node.js is required. Install it: https://nodejs.org"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VERSION" -lt 18 ]]; then
  error "Node.js 18+ required (found v$NODE_VERSION)"
fi

log "Node $(node -v), npm $(npm -v)"

log "Installing to ${CYAN}${INSTALL_DIR}${NC}"

if [[ -d "$INSTALL_DIR" ]]; then
  warn "Existing installation found, updating..."
  rm -rf "$INSTALL_DIR"
fi

mkdir -p "$INSTALL_DIR"

if command -v git &>/dev/null; then
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || {
    error "Failed to clone repository"
  }
else
  curl -sL "${REPO_URL}/archive/refs/heads/main.tar.gz" | tar xz -C "$INSTALL_DIR" --strip-components=1
fi

cd "$INSTALL_DIR"
log "Installing dependencies..."
npm install --production 2>/dev/null | tail -1

cat > "$INSTALL_DIR/start.sh" << 'LAUNCHER'
#!/bin/bash
cd "$(dirname "$0")"
node website/server.mjs
LAUNCHER
chmod +x "$INSTALL_DIR/start.sh"

if [[ -d "$BIN_DIR" ]] && [[ -w "$BIN_DIR" ]]; then
  ln -sf "$INSTALL_DIR/start.sh" "$BIN_DIR/sharestopper"
  log "Installed ${CYAN}sharestopper${NC} command"
fi

PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.sharestopper.app.plist"
mkdir -p "$PLIST_DIR"

cat > "$PLIST_FILE" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sharestopper.app</string>
    <key>ProgramArguments</key>
    <array>
        <string>${INSTALL_DIR}/start.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${INSTALL_DIR}/logs/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${INSTALL_DIR}/logs/stderr.log</string>
</dict>
</plist>
PLIST

mkdir -p "$INSTALL_DIR/logs"
launchctl unload "$PLIST_FILE" 2>/dev/null || true
launchctl load "$PLIST_FILE" 2>/dev/null || true

echo ""
echo -e "  ${GREEN}${BOLD}Installed${NC}"
echo ""
echo -e "  ${DIM}Start:       sharestopper${NC}"
echo -e "  ${DIM}Dashboard:   http://localhost:1011${NC}"
echo -e "  ${DIM}Uninstall:   rm -rf ~/.sharestopper${NC}"
echo ""
