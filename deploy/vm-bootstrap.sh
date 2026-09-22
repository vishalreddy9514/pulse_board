#!/usr/bin/env bash
#
# Prepares a fresh Ubuntu VM to run PulseBoard: installs Docker, opens the web
# ports, and leaves you ready to run docker compose.
#
# Written for an Oracle Cloud Always Free Ampere (ARM) instance running Ubuntu
# 24.04, but it works on any Ubuntu box. Run it as a normal user with sudo:
#
#   curl -fsSL https://raw.githubusercontent.com/vishalreddy9514/pulse_board/main/deploy/vm-bootstrap.sh -o vm-bootstrap.sh
#   less vm-bootstrap.sh     # read before running anything from the internet
#   bash vm-bootstrap.sh
#
# Safe to run twice: every step checks before it acts.

set -euo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$*"; }

if [[ $EUID -eq 0 ]]; then
  warn "Running as root. That works, but the docker group step is pointless;"
  warn "prefer running as the ubuntu user."
fi

# --- Docker -----------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  log "Docker already installed ($(docker --version))"
else
  log "Installing Docker from get.docker.com"
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
fi

if ! docker compose version >/dev/null 2>&1; then
  log "Installing the compose plugin"
  sudo apt-get update -qq
  sudo apt-get install -y docker-compose-plugin
fi

if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
  log "Adding $USER to the docker group"
  sudo usermod -aG docker "$USER"
  warn "Log out and back in (or run: newgrp docker) before docker works without sudo."
fi

# --- Firewall ---------------------------------------------------------------
# Oracle's Ubuntu images ship iptables rules that reject everything except SSH,
# which is the single most common reason a deployed app looks dead from outside.
# The VCN security list in the Oracle console must allow 80 and 443 as well;
# this only handles the rules on the machine itself.
open_port() {
  local port="$1"
  if sudo iptables -C INPUT -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null; then
    log "Port $port already open in iptables"
  else
    log "Opening port $port in iptables"
    sudo iptables -I INPUT -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
  fi
}

if command -v firewall-cmd >/dev/null 2>&1; then
  log "firewalld detected, opening http and https"
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --permanent --add-service=https
  sudo firewall-cmd --reload
else
  open_port 80
  open_port 443

  if ! command -v netfilter-persistent >/dev/null 2>&1; then
    log "Installing iptables-persistent so the rules survive a reboot"
    echo 'iptables-persistent iptables-persistent/autosave_v4 boolean false' | sudo debconf-set-selections
    echo 'iptables-persistent iptables-persistent/autosave_v6 boolean false' | sudo debconf-set-selections
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
  fi
  log "Saving iptables rules"
  sudo netfilter-persistent save
fi

# --- Done -------------------------------------------------------------------
log "Ready. Next:"
cat <<'NEXT'
    git clone https://github.com/vishalreddy9514/pulse_board.git
    cd pulse_board
    cp deploy/.env.prod.example .env
    # edit .env: PUBLIC_URL, POSTGRES_PASSWORD, JWT_SECRET
    #   openssl rand -hex 16   # POSTGRES_PASSWORD
    #   openssl rand -hex 32   # JWT_SECRET
    docker compose -f deploy/docker-compose.prod.yml up -d --build

  The first build takes a few minutes on a free ARM instance. Then:

    docker compose -f deploy/docker-compose.prod.yml ps
    curl -s localhost/api/health

  Do not forget the VCN ingress rules for 80 and 443 in the Oracle console —
  the machine can be perfectly healthy and still unreachable without them.
NEXT
