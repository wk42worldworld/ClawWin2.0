#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wait for Text - Wait until text appears in window
Usage: py wait_for_text.py "text" "window" [timeout_seconds]
       py wait_for_text.py "Complete" "Terminal" 30
       py wait_for_text.py "Ready" "Chrome"
"""
import sys
import io
import time
from pywinauto import Desktop

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

if len(sys.argv) < 3:
    print("Usage: py wait_for_text.py \"text\" \"window\" [timeout]")
    sys.exit(1)

search_text = sys.argv[1]
window_filter = sys.argv[2]
timeout = int(sys.argv[3]) if len(sys.argv) > 3 else 30

try:
    desktop = Desktop(backend="uia")
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        windows = [w for w in desktop.windows() if window_filter.lower() in w.window_text().lower()]
        
        for window in windows:
            try:
                for ctrl in window.descendants():
                    try:
                        text = ctrl.window_text()
                        if text and search_text.lower() in text.lower():
                            elapsed = time.time() - start_time
                            print(f"Found '{search_text}' after {elapsed:.1f}s")
                            sys.exit(0)
                    except:
                        pass
            except:
                pass
        
        time.sleep(0.5)  # Check every 500ms
    
    print(f"Timeout: Text '{search_text}' not found after {timeout}s")
    sys.exit(1)
    
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
