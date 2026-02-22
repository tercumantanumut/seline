#!/bin/bash
#
# Ring after each tool call.
# Plays a short system sound on macOS/Linux/Windows.
#

PLATFORM=$(uname -s)

case "$PLATFORM" in
  "Darwin")
    afplay /System/Library/Sounds/Tink.aiff &>/dev/null &
    ;;
  "Linux")
    paplay /usr/share/sounds/freedesktop/stereo/message.oga &>/dev/null &
    ;;
  "MINGW"*|"MSYS"*|"CYGWIN"*)
    powershell.exe -Command "[System.Media.SystemSounds]::Asterisk.Play()" &>/dev/null &
    ;;
esac

exit 0
