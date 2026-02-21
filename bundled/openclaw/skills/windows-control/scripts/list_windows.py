#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
List Windows - Show all open windows
Usage: py list_windows.py
"""
import sys
import io
from pywinauto import Desktop

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

try:
    desktop = Desktop(backend="uia")
    windows = desktop.windows()
    
    print("Open Windows:")
    print("-" * 60)
    
    for i, window in enumerate(windows, 1):
        try:
            title = window.window_text()
            if title:  # Only show windows with titles
                visible = "visible" if window.is_visible() else "hidden"
                minimized = "minimized" if window.is_minimized() else ""
                status = f"[{visible}]" + (f" [{minimized}]" if minimized else "")
                print(f"{i}. {title} {status}")
        except Exception:
            # Skip windows we can't query
            continue
    
except Exception as e:
    import traceback
    traceback.print_exc()
    sys.exit(1)
