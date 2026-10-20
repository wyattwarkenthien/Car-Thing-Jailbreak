#!/bin/bash
# Remove the Car Thing link from this Mac (stops it and removes the login item).
# Your Spotify login and settings stay in ~/Library/Application Support/carthing-link unless you pass --all.
PLIST="$HOME/Library/LaunchAgents/us.warkenthien.carthing-link.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
if [ "$1" = "--all" ]; then
  echo "Delete these yourself if you want them gone: $HOME/Library/Application Support/carthing-link"
fi
echo "Car Thing link removed."
