#!/bin/bash

# Wait for the desktop to settle
sleep 5

# Stop the screen from blanking / going to sleep
xset s off
xset s noblank
xset -dpms

# Wait until the server at :8080 is actually responding
# (prevents Chromium showing an error page if it boots faster than your app)
until curl -s http://localhost:8080 >/dev/null; do
  sleep 2
done

# Launch Chromium fullscreen, pointed at your app
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 \
  http://localhost:8080