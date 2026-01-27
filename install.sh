#!/bin/bash

# Video Embed Worker - Installation Script
# This script installs the worker as a systemd service

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}  Video Embed Worker - Installation${NC}"
echo -e "${BLUE}=======================================${NC}\n"

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}Error: Do not run this script as root${NC}"
   echo "Run as the user who will own the service"
   exit 1
fi

# Get the current directory
INSTALL_DIR="$(pwd)"
SERVICE_NAME="video-embed-worker"
SERVICE_USER="$USER"

echo -e "${GREEN}Installation directory:${NC} $INSTALL_DIR"
echo -e "${GREEN}Service user:${NC} $SERVICE_USER"
echo -e "${GREEN}Service name:${NC} $SERVICE_NAME\n"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js first"
    exit 1
fi

echo -e "${GREEN}Node version:${NC} $(node --version)"
echo -e "${GREEN}NPM version:${NC} $(npm --version)\n"

# Check if .env exists
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create .env file first (you can copy from .env.example)"
    exit 1
fi

# Install dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
npm install

# Build the project
echo -e "${BLUE}Building project...${NC}"
npm run build

# Create systemd service file
echo -e "${BLUE}Creating systemd service file...${NC}"

SERVICE_FILE="/tmp/${SERVICE_NAME}.service"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Video Embed Worker Service
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$INSTALL_DIR

[Install]
WantedBy=multi-user.target
EOF

# Install service file
echo -e "${BLUE}Installing systemd service...${NC}"
sudo cp "$SERVICE_FILE" "/etc/systemd/system/${SERVICE_NAME}.service"
sudo systemctl daemon-reload

echo -e "\n${GREEN}=======================================${NC}"
echo -e "${GREEN}  Installation Complete!${NC}"
echo -e "${GREEN}=======================================${NC}\n"

echo -e "To start the service:"
echo -e "  ${BLUE}sudo systemctl start $SERVICE_NAME${NC}\n"

echo -e "To enable auto-start on boot:"
echo -e "  ${BLUE}sudo systemctl enable $SERVICE_NAME${NC}\n"

echo -e "To check service status:"
echo -e "  ${BLUE}sudo systemctl status $SERVICE_NAME${NC}\n"

echo -e "To view logs:"
echo -e "  ${BLUE}sudo journalctl -u $SERVICE_NAME -f${NC}\n"

echo -e "To stop the service:"
echo -e "  ${BLUE}sudo systemctl stop $SERVICE_NAME${NC}\n"

# Ask if user wants to start now
read -p "Would you like to start the service now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo systemctl start $SERVICE_NAME
    sudo systemctl enable $SERVICE_NAME
    echo -e "\n${GREEN}Service started and enabled!${NC}"
    sleep 2
    sudo systemctl status $SERVICE_NAME
fi
