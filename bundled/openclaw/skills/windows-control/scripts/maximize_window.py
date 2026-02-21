#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Maximize Window
Usage: py maximize_window.py "Window Title"
"""
import sys
import io
from pywinauto import Desktop

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

if len(sys.argv) < 2:
    print("Usage: py maximize_window.py \"Window Title\"")
    sys.exit(1)

window_title = sys.argv[1]

try:
    desktop = Desktop(backend="uia")
    windows = desktop.windows()
    
    for window in windows:
        if window_title.lower() in window.window_text().lower():
            if not window.is_maximized():
                window.maximize()
                print(f"Maximized: {window.window_text()}")
            else:
                print(f"Already maximized: {window.window_text()}")
            sys.exit(0)
            
    print(f"Error: Window containing '{window_title}' not found")
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
