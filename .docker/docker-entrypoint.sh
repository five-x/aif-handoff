#!/bin/sh
# Fix ownership of app-owned volumes, then drop to node user.
# Do not chown the projects bind mount: on Docker Desktop a recursive ownership
# pass over a host projects directory can make startup appear hung.
if [ "$(id -u)" = "0" ]; then
  install -d -o node -g node /data /home/node/.claude /home/node/.codex 2>/dev/null || true
  chown -R node:node /data /home/node/.claude /home/node/.codex 2>/dev/null || true
  if [ -e /home/node/.claude.json ]; then
    chown node:node /home/node/.claude.json 2>/dev/null || true
  fi
  if command -v git >/dev/null 2>&1; then
    projects_safe_dir="${PROJECTS_MOUNT:-/home/www}/*"
    if ! gosu node git config --global --get-all safe.directory 2>/dev/null | grep -Fx "$projects_safe_dir" >/dev/null 2>&1; then
      gosu node git config --global --add safe.directory "$projects_safe_dir" 2>/dev/null || true
    fi
  fi
  export HOME=/home/node
  exec gosu node "$@"
else
  exec "$@"
fi
