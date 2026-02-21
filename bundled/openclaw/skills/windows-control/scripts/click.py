#!/usr/bin/env python3
"""
Click - Click at coordinates (x, y, button, clicks)
Usage: py click.py 500 300 left 1
"""
import pyautogui
import sys

if len(sys.argv) < 3:
    print("Usage: py click.py X Y [button] [clicks]")
    sys.exit(1)

x = int(sys.argv[1])
y = int(sys.argv[2])
button = sys.argv[3] if len(sys.argv) > 3 else "left"
clicks = int(sys.argv[4]) if len(sys.argv) > 4 else 1

try:
    pyautogui.click(x, y, clicks=clicks, button=button)
    print(f"Clicked {button} button at ({x}, {y}) {clicks} time(s)")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
