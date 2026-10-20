#!/bin/sh
# Cold-start Expo Go on the iOS simulator straight into a scenario.
#   scripts/cold-start.sh "/realtime?mode=naive&auto=1"
# Needs `npx expo start` running. HOST defaults to this Mac's LAN IP.
set -e
HOST=${HOST:-$(ipconfig getifaddr en0)}
U="exp://$HOST:8081/--"
ROUTE=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$1")
xcrun simctl openurl booted "$U/?next=$ROUTE"   # save the route (app must be running)
sleep 3
xcrun simctl terminate booted host.exp.Exponent
sleep 1
xcrun simctl openurl booted "exp://$HOST:8081"             # relaunch: session restores from AsyncStorage
