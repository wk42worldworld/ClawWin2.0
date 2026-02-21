#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Focus Window - Bring window to front and focus it
Usage: py focus_window.py "Window Title"
       py focus_window.py "Chrome"
       py focus_window.py "Notepad"
"""
import sys
import io
from pywinauto import Desktop
from pywinauto.findwindows import ElementNotFoundError

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

if len(sys.argv) < 2:
    print("Usage: py focus_window.py \"Window Title\"")
    sys.exit(1)

window_title = sys.argv[1]

try:
    desktop = Desktop(backend="uia")
    windows = desktop.windows()
    
    for window in windows:
        title = window.window_text()
        if window_title.lower() in title.lower():
            # Restore if minimized
            if window.is_minimized():
                window.restore()
            
            # Set focus
            window.set_focus()
            print(f"Focused: {title}")
            sys.exit(0)
    
    print(f"Error: Window containing '{window_title}' not found")
    sys.exit(1)
    
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
