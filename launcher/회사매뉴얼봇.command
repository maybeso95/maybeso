#!/bin/bash
# macOS double-click launcher: opens index.html in default browser
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
HTML="$DIR/../index.html"
if [ ! -f "$HTML" ]; then
  HTML="$HOME/maybeso/index.html"
fi
open "$HTML"
