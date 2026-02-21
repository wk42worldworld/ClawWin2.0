#!/usr/bin/env python3
"""
Type Text - Type text at current cursor position
Usage: py type_text.py "Hello world"
"""
import pyautogui
import sys
import time

if len(sys.argv) < 2:
    print("Usage: py type_text.py \"text to type\"")
    sys.exit(1)

text = sys.argv[1]

try:
    # Small delay to ensure window focus
    time.sleep(0.1)
    pyautogui.write(text, interval=0.01)  # 10ms between keystrokes
    print(f"Typed: {text}")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
