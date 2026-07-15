#!/usr/bin/env bash
cd "$(dirname "$0")"
./start-local.sh
STATUS=$?
if [[ $STATUS -ne 0 ]]; then
  echo
  read -r -p "Press Return to close this window..."
fi
exit $STATUS
