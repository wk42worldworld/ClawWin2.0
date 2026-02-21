#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Click Text - Find and click element by text content
Usage: py click_text.py "Button Text" ["Window Name"]
       py click_text.py "Save"
       py click_text.py "Submit" "Chrome"
"""
import sys
import io
from pywinauto import Desktop
from pywinauto.findwindows import ElementNotFoundError
import pyautogui

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

if len(sys.argv) < 2:
    print("Usage: py click_text.py \"text\" [\"window\"]")
    sys.exit(1)

search_text = sys.argv[1]
window_filter = sys.argv[2] if len(sys.argv) > 2 else None

try:
    desktop = Desktop(backend="uia")
    
    # Get windows to search
    if window_filter:
        windows = [w for w in desktop.windows() if window_filter.lower() in w.window_text().lower()]
    else:
        windows = desktop.windows()
    
    found = False
    for window in windows:
        if not window.window_text():
            continue
            
        try:
            for ctrl in window.descendants():
                try:
                    text = ctrl.window_text()
                    if text and search_text.lower() in text.lower():
                        # Found it! Get coordinates and click
                        rect = ctrl.rectangle()
                        center_x = (rect.left + rect.right) // 2
                        center_y = (rect.top + rect.bottom) // 2
                        
                        pyautogui.click(center_x, center_y)
                        print(f"Clicked '{text}' at ({center_x}, {center_y})")
                        found = True
                        break
                except:
                    pass
            if found:
                break
        except:
            pass
    
    if not found:
        print(f"Error: Text '{search_text}' not found")
        sys.exit(1)
        
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
