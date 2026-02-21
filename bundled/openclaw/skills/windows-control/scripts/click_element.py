#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Click UI Element - Click a button or UI element by its name/text
Usage: py click_element.py "Save"                    # Click "Save" button anywhere
       py click_element.py "OK" --window "Notepad"   # Click OK in specific window
       py click_element.py "Submit" --type Button    # Click only buttons named Submit
       py click_element.py "File" --type MenuItem    # Click menu items

Supports: Button, Hyperlink, MenuItem, TabItem, ListItem, CheckBox, RadioButton
"""
import sys
import io
import argparse
from pywinauto import Desktop
import time

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

CLICKABLE_TYPES = ['Button', 'Hyperlink', 'MenuItem', 'TabItem', 'ListItem', 
                   'CheckBox', 'RadioButton', 'TreeItem', 'DataItem']


def find_and_click(desktop, element_name, window_title=None, control_type=None, exact=False):
    """Find and click a UI element by name."""
    
    # Determine which windows to search
    if window_title:
        windows = []
        for w in desktop.windows():
            if window_title.lower() in w.window_text().lower():
                windows.append(w)
        if not windows:
            return False, f"Window '{window_title}' not found"
    else:
        # Search all visible windows
        windows = desktop.windows()
    
    element_name_lower = element_name.lower()
    candidates = []
    
    for window in windows:
        try:
            for ctrl in window.descendants():
                try:
                    ctrl_type = ctrl.element_info.control_type
                    name = ctrl.window_text().strip() if ctrl.window_text() else ""
                    
                    # Skip if control type filter doesn't match
                    if control_type and ctrl_type != control_type:
                        continue
                    
                    # Check if clickable
                    if ctrl_type not in CLICKABLE_TYPES:
                        continue
                    
                    # Match name
                    if exact:
                        name_match = name == element_name
                    else:
                        name_match = element_name_lower in name.lower()
                    
                    if name_match and ctrl.is_enabled():
                        rect = ctrl.rectangle()
                        candidates.append({
                            'control': ctrl,
                            'name': name,
                            'type': ctrl_type,
                            'window': window.window_text(),
                            'center': ((rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2)
                        })
                except:
                    continue
        except:
            continue
    
    if not candidates:
        return False, f"Element '{element_name}' not found"
    
    # If multiple matches, prefer exact matches
    exact_matches = [c for c in candidates if c['name'].lower() == element_name_lower]
    if exact_matches:
        candidates = exact_matches
    
    # Click the first matching element
    target = candidates[0]
    try:
        target['control'].click()
        return True, f"Clicked [{target['type']}] '{target['name']}' in {target['window']} @ {target['center']}"
    except Exception as e:
        return False, f"Click failed: {e}"


def list_clickable(desktop, window_title=None):
    """List all clickable elements."""
    if window_title:
        windows = []
        for w in desktop.windows():
            if window_title.lower() in w.window_text().lower():
                windows.append(w)
    else:
        windows = desktop.windows()[:5]  # Limit to first 5 windows
    
    elements = []
    for window in windows:
        try:
            win_title = window.window_text()
            for ctrl in window.descendants():
                try:
                    ctrl_type = ctrl.element_info.control_type
                    name = ctrl.window_text().strip() if ctrl.window_text() else ""
                    
                    if ctrl_type in CLICKABLE_TYPES and name and ctrl.is_enabled():
                        rect = ctrl.rectangle()
                        elements.append({
                            'name': name,
                            'type': ctrl_type,
                            'window': win_title,
                            'center': ((rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2)
                        })
                except:
                    continue
        except:
            continue
    
    return elements


def main():
    parser = argparse.ArgumentParser(description='Click UI element by name')
    parser.add_argument('element', nargs='?', help='Element name/text to click')
    parser.add_argument('--window', '-w', help='Target specific window')
    parser.add_argument('--type', '-t', dest='control_type', help='Control type filter (Button, Hyperlink, etc.)')
    parser.add_argument('--exact', '-e', action='store_true', help='Exact name match only')
    parser.add_argument('--list', '-l', action='store_true', help='List clickable elements')
    parser.add_argument('--delay', '-d', type=float, default=0, help='Delay before clicking (seconds)')
    
    args = parser.parse_args()
    desktop = Desktop(backend="uia")
    
    if args.list:
        elements = list_clickable(desktop, args.window)
        if not elements:
            print("No clickable elements found")
        else:
            print(f"Found {len(elements)} clickable elements:\n")
            current_window = None
            for elem in elements:
                if elem['window'] != current_window:
                    current_window = elem['window']
                    print(f"\n=== {current_window} ===")
                print(f"  [{elem['type']}] {elem['name']} @ {elem['center']}")
        return
    
    if not args.element:
        print("Error: Element name required (or use --list)")
        sys.exit(1)
    
    if args.delay > 0:
        time.sleep(args.delay)
    
    success, msg = find_and_click(
        desktop, 
        args.element, 
        window_title=args.window,
        control_type=args.control_type,
        exact=args.exact
    )
    
    print(msg)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
