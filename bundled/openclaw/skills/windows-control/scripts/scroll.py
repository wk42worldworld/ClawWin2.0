#!/usr/bin/env python3
"""
Scroll - Scroll in direction
Usage: py scroll.py up 5
       py scroll.py down 10
"""
import pyautogui
import sys

if len(sys.argv) < 3:
    print("Usage: py scroll.py [up|down] amount")
    sys.exit(1)

direction = sys.argv[1]
amount = int(sys.argv[2])

try:
    if direction == "up":
        pyautogui.scroll(amount * 120)  # Windows uses 120 units per notch
    elif direction == "down":
        pyautogui.scroll(-amount * 120)
    else:
        print("Direction must be 'up' or 'down'")
        sys.exit(1)
    
    print(f"Scrolled {direction} {amount} notches")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
