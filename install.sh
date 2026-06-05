#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/bacli/cli"
BIN_NAME="bacli"
VERSION="${1:-latest}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Installing bacli...${NC}"

# Detect OS and arch
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
  x86_64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo -e "${RED}Unsupported architecture: $ARCH${NC}"; exit 1 ;;
esac

case "$OS" in
  linux) OS="linux" ;;
  darwin) OS="darwin" ;;
  mingw*|msys*|cygwin*) OS="windows" ;;
  *) echo -e "${RED}Unsupported OS: $OS${NC}"; exit 1 ;;
esac

# Determine install directory
if [ -n "${BACLI_INSTALL_DIR:-}" ]; then
  INSTALL_DIR="$BACLI_INSTALL_DIR"
elif [ -n "${XDG_BIN_DIR:-}" ]; then
  INSTALL_DIR="$XDG_BIN_DIR"
elif [ -d "$HOME/bin" ]; then
  INSTALL_DIR="$HOME/bin"
else
  INSTALL_DIR="$HOME/.bacli/bin"
fi

mkdir -p "$INSTALL_DIR"

# Prefer npm global install if available
if command -v npm &> /dev/null; then
  echo -e "${BLUE}Installing via npm...${NC}"
  if npm install -g @bacli/cli 2>/dev/null; then
    echo -e "${GREEN}bacli installed successfully via npm!${NC}"
    echo -e "Run: ${BLUE}bacli${NC}"
    exit 0
  fi
  echo -e "${BLUE}npm install failed, trying binary download...${NC}"
fi

# Binary download from GitHub releases
FILENAME="bacli-${OS}-${ARCH}"
if [ "$OS" = "windows" ]; then
  FILENAME="${FILENAME}.exe"
fi

URL="${REPO}/releases/${VERSION}/download/${FILENAME}"

echo -e "${BLUE}Downloading bacli for ${OS}/${ARCH}...${NC}"
echo -e "${BLUE}URL: ${URL}${NC}"

if command -v curl &> /dev/null; then
  curl -fsSL -o "${INSTALL_DIR}/${BIN_NAME}" "$URL"
elif command -v wget &> /dev/null; then
  wget -q -O "${INSTALL_DIR}/${BIN_NAME}" "$URL"
else
  echo -e "${RED}Need curl or wget to download${NC}"
  exit 1
fi

chmod +x "${INSTALL_DIR}/${BIN_NAME}"

# Add to PATH if needed
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  SHELL_TYPE="${SHELL##*/}"
  RC_FILE=""
  case "$SHELL_TYPE" in
    bash) RC_FILE="$HOME/.bashrc" ;;
    zsh) RC_FILE="$HOME/.zshrc" ;;
    fish) RC_FILE="$HOME/.config/fish/config.fish" ;;
  esac

  if [ -n "$RC_FILE" ] && [ ! -f "$RC_FILE" ] || ! grep -q "bacli" "$RC_FILE" 2>/dev/null; then
    echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$RC_FILE"
    echo -e "${BLUE}Added $INSTALL_DIR to PATH in $RC_FILE${NC}"
  fi
fi

echo -e "${GREEN}bacli installed to ${INSTALL_DIR}/bacli${NC}"
echo -e "Run: ${BLUE}bacli${NC}"
