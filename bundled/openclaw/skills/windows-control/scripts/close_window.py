#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Close Window
Usage: py close_window.py "Window Title"
"""
import sys
import io
from pywinauto import Desktop

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

if len(sys.argv) < 2:
    print("Usage: py close_window.py \"Window Title\"")
    sys.exit(1)

window_title = sys.argv[1]

try:
    desktop = Desktop(backend="uia")
    windows = desktop.windows()
    
    for window in windows:
        if window_title.lower() in window.window_text().lower():
            window.close()
            print(f"Closed: {window.window_text()}")
            sys.exit(0)
            
    print(f"Error: Window containing '{window_title}' not found")
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
