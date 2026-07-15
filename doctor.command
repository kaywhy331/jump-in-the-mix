#!/usr/bin/env bash
cd "$(dirname "$0")"
./doctor.sh
STATUS=$?
echo
read -r -p "Press Return to close this window..."
exit $STATUS
