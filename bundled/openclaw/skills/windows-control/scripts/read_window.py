#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Read Window - Extract text from a specific window
Usage: py read_window.py "Window Title"
       py read_window.py "Notepad"
       py read_window.py "Visual Studio Code"
"""
import sys
import io
from pywinauto import Desktop
from pywinauto.findwindows import ElementNotFoundError

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

if len(sys.argv) < 2:
    print("Usage: py read_window.py \"Window Title\"")
    sys.exit(1)

window_title = sys.argv[1]

try:
    # Get all windows
    desktop = Desktop(backend="uia")
    
    # Find window by partial title match
    windows = desktop.windows()
    matching_window = None
    
    for window in windows:
        title = window.window_text()
        if window_title.lower() in title.lower():
            matching_window = window
            break
    
    if not matching_window:
        print(f"Error: Window containing '{window_title}' not found")
        print("\nAvailable windows:")
        for w in windows:
            if w.window_text():  # Only show windows with titles
                print(f"  - {w.window_text()}")
        sys.exit(1)
    
    # Get all text from the window
    texts = []
    try:
        # Try to get all child controls with text
        for ctrl in matching_window.descendants():
            try:
                text = ctrl.window_text()
                if text and text.strip():
                    texts.append(text.strip())
            except:
                pass
    except:
        pass
    
    if texts:
        # Remove duplicates while preserving order
        seen = set()
        unique_texts = []
        for t in texts:
            if t not in seen:
                seen.add(t)
                unique_texts.append(t)
        
        print("\n".join(unique_texts))
    else:
        print(f"No text found in window: {matching_window.window_text()}")
    
except ElementNotFoundError:
    print(f"Error: Window '{window_title}' not found")
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
