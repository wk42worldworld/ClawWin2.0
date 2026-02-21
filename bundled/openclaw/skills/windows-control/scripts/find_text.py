#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Find Text - Find text and return coordinates
Usage: py find_text.py "text" ["window"]
       py find_text.py "Submit"
       py find_text.py "Save" "Notepad"
"""
import sys
import io
from pywinauto import Desktop

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

if len(sys.argv) < 2:
    print("Usage: py find_text.py \"text\" [\"window\"]")
    sys.exit(1)

search_text = sys.argv[1]
window_filter = sys.argv[2] if len(sys.argv) > 2 else None

try:
    desktop = Desktop(backend="uia")
    
    if window_filter:
        windows = [w for w in desktop.windows() if window_filter.lower() in w.window_text().lower()]
    else:
        windows = desktop.windows()
    
    for window in windows:
        if not window.window_text():
            continue
            
        try:
            for ctrl in window.descendants():
                try:
                    text = ctrl.window_text()
                    if text and search_text.lower() in text.lower():
                        rect = ctrl.rectangle()
                        center_x = (rect.left + rect.right) // 2
                        center_y = (rect.top + rect.bottom) // 2
                        
                        print(f"Found: '{text}'")
                        print(f"Coordinates: x={center_x}, y={center_y}")
                        print(f"Bounds: left={rect.left}, top={rect.top}, right={rect.right}, bottom={rect.bottom}")
                        sys.exit(0)
                except:
                    pass
        except:
            pass
    
    print(f"Not found: '{search_text}'")
    sys.exit(1)
    
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
