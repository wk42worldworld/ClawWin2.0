#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Get Active Window - Print title of currently focused window
Usage: py get_active_window.py
"""
import sys
import io
import pygetwindow as gw

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

try:
    active = gw.getActiveWindow()
    if active:
        print(active.title)
    else:
        print("No active window found")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
