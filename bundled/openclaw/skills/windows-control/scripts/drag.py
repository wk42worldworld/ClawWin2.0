#!/usr/bin/env python3
"""
Drag - Drag from one point to another
Usage: py drag.py x1 y1 x2 y2 [duration]
       py drag.py 100 100 500 300
       py drag.py 100 100 500 300 1.0
"""
import sys
import pyautogui

if len(sys.argv) < 5:
    print("Usage: py drag.py x1 y1 x2 y2 [duration]")
    sys.exit(1)

x1 = int(sys.argv[1])
y1 = int(sys.argv[2])
x2 = int(sys.argv[3])
y2 = int(sys.argv[4])
duration = float(sys.argv[5]) if len(sys.argv) > 5 else 0.5

try:
    pyautogui.moveTo(x1, y1)
    pyautogui.drag(x2 - x1, y2 - y1, duration=duration, button='left')
    print(f"Dragged from ({x1}, {y1}) to ({x2}, {y2})")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
