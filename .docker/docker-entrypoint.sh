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
    projects_mount="${PROJECTS_MOUNT:-/home/www}"
    if [ "${AIF_REPAIR_PROJECT_GIT_OWNERSHIP:-true}" != "false" ]; then
      for project_git_dir in "$projects_mount"/.git "$projects_mount"/*/.git; do
        [ -d "$project_git_dir" ] || continue
        find "$project_git_dir" -maxdepth 3 \( -user 0 -o -group 0 \) \
          -exec chown node:node {} + 2>/dev/null || true
      done
    fi
    for projects_safe_dir in "$projects_mount/botIntevra" "$projects_mount/*"; do
      if ! gosu node git config --global --get-all safe.directory 2>/dev/null | grep -Fx "$projects_safe_dir" >/dev/null 2>&1; then
        gosu node git config --global --add safe.directory "$projects_safe_dir" 2>/dev/null || true
      fi
    done
  fi
  export HOME=/home/node
  exec gosu node "$@"
else
  exec "$@"
fi
