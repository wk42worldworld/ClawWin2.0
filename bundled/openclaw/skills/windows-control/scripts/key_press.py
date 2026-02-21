#!/usr/bin/env python3
"""
Key Press - Press key combination
Usage: py key_press.py "ctrl+s"
       py key_press.py "enter"
"""
import pyautogui
import sys

if len(sys.argv) < 2:
    print("Usage: py key_press.py \"key_combo\"")
    sys.exit(1)

key_combo = sys.argv[1]

try:
    # Handle key combinations (e.g., "ctrl+s")
    if "+" in key_combo:
        keys = key_combo.split("+")
        pyautogui.hotkey(*keys)
    else:
        pyautogui.press(key_combo)
    
    print(f"Pressed: {key_combo}")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
