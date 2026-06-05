#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/kamikaze1120/BACLI.git"
BIN_NAME="bacli"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}
  ╔════════════════════════════╗
  ║    Installing bacli...     ║
  ╚════════════════════════════╝
${NC}"

# Check prerequisites
if ! command -v node &> /dev/null; then
  echo -e "${RED}✖ Node.js 20+ is required. Install it from https://nodejs.org${NC}"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 20 ]; then
  echo -e "${RED}✖ Node.js 20+ required (found v$(node -v)). Upgrade at https://nodejs.org${NC}"
  exit 1
fi

if ! command -v git &> /dev/null; then
  echo -e "${RED}✖ git is required. Install it from https://git-scm.com${NC}"
  exit 1
fi

# Install from GitHub source
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo -e "${BLUE}  → Cloning from GitHub...${NC}"
git clone --depth 1 "$REPO" "$TMP_DIR" 2>/dev/null

cd "$TMP_DIR"

echo -e "${BLUE}  → Installing dependencies...${NC}"
npm install --production 2>/dev/null

echo -e "${BLUE}  → Building...${NC}"
npm run build 2>/dev/null

echo -e "${BLUE}  → Linking globally as '${BIN_NAME}'...${NC}"
npm link 2>/dev/null

echo -e "${GREEN}
  ✓ bacli installed successfully!

  Run: ${BLUE}bacli${GREEN}
  Setup: ${BLUE}bacli setup${GREEN}
${NC}"
