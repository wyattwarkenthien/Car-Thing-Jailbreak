#!/bin/bash
# Stop showing / controlling this Mac's music on the Car Thing.
LABEL=us.warkenthien.carthing-music
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
echo "Mac music link removed. (Its log is in ~/Library/Application Support/carthing-music.)"
