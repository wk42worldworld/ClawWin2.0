#!/usr/bin/env python3
"""
Mouse Move - Move mouse to coordinates
Usage: py mouse_move.py 500 300
"""
import pyautogui
import sys

if len(sys.argv) < 3:
    print("Usage: py mouse_move.py X Y")
    sys.exit(1)

x = int(sys.argv[1])
y = int(sys.argv[2])

try:
    pyautogui.moveTo(x, y, duration=0.2)
    print(f"Moved mouse to ({x}, {y})")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
