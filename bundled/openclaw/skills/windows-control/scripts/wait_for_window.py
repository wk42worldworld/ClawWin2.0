#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wait for Window - Wait until a window with specific title exists
Usage: py wait_for_window.py "Window Title" [timeout_seconds]
"""
import sys
import io
import time
from pywinauto import Desktop

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

if len(sys.argv) < 2:
    print("Usage: py wait_for_window.py \"Window Title\" [timeout]")
    sys.exit(1)

window_title = sys.argv[1]
timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 30

try:
    desktop = Desktop(backend="uia")
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        windows = desktop.windows()
        for window in windows:
            if window_title.lower() in window.window_text().lower():
                print(f"Found window '{window.window_text()}' after {time.time() - start_time:.1f}s")
                sys.exit(0)
        time.sleep(0.5)
        
    print(f"Timeout: Window '{window_title}' not found after {timeout}s")
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
