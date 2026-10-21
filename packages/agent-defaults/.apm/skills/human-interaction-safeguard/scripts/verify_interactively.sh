#!/bin/sh
# Record the child verifier's actual exit status, never terminal input text.
set -u
if [ "$#" -lt 2 ] || [ "$1" != "--status-output" ]; then
  echo "BLOCKED: --status-output <new absolute path> is required." >&2
  exit 2
fi
status_output=$2
shift 2
case "$status_output" in
  /*) ;;
  *) echo "BLOCKED: status output must be absolute." >&2; exit 2 ;;
esac
umask 077
set -C
exec 3>"$status_output" || exit 2
python3 "$(dirname "$0")/verify_attestation.py" "$@"
result=$?
printf '%s\n' "$result" >&3 || exit 2
exit "$result"
