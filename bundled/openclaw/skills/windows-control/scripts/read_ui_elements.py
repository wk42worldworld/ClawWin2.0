#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Read UI Elements - Extract buttons, links, and interactive elements from a window
Usage: py read_ui_elements.py "Window Title"
       py read_ui_elements.py "Chrome"
       py read_ui_elements.py "Chrome" --buttons-only
       py read_ui_elements.py "Chrome" --links-only

Returns structured list of interactive elements with their names and types.
"""
import sys
import io
import json
import argparse
from pywinauto import Desktop
from pywinauto.findwindows import ElementNotFoundError

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def get_ui_elements(window, buttons_only=False, links_only=False):
    """Extract interactive UI elements from a window."""
    elements = {
        'buttons': [],
        'links': [],
        'menu_items': [],
        'list_items': [],
        'tabs': [],
        'checkboxes': [],
        'radio_buttons': [],
        'text_fields': [],
        'dropdowns': [],
        'other': []
    }
    
    try:
        for ctrl in window.descendants():
            try:
                ctrl_type = ctrl.element_info.control_type
                name = ctrl.window_text().strip() if ctrl.window_text() else ""
                
                # Skip empty names for most types
                if not name and ctrl_type not in ['Edit', 'Document']:
                    continue
                
                elem_info = {
                    'name': name,
                    'type': ctrl_type,
                    'enabled': ctrl.is_enabled() if hasattr(ctrl, 'is_enabled') else True
                }
                
                # Try to get bounding rect for click coordinates
                try:
                    rect = ctrl.rectangle()
                    elem_info['rect'] = {
                        'left': rect.left,
                        'top': rect.top,
                        'right': rect.right,
                        'bottom': rect.bottom,
                        'center_x': (rect.left + rect.right) // 2,
                        'center_y': (rect.top + rect.bottom) // 2
                    }
                except:
                    pass
                
                # Categorize by control type
                if ctrl_type == 'Button':
                    elements['buttons'].append(elem_info)
                elif ctrl_type == 'Hyperlink':
                    elements['links'].append(elem_info)
                elif ctrl_type == 'MenuItem':
                    elements['menu_items'].append(elem_info)
                elif ctrl_type == 'ListItem':
                    elements['list_items'].append(elem_info)
                elif ctrl_type == 'TabItem':
                    elements['tabs'].append(elem_info)
                elif ctrl_type == 'CheckBox':
                    elements['checkboxes'].append(elem_info)
                elif ctrl_type == 'RadioButton':
                    elements['radio_buttons'].append(elem_info)
                elif ctrl_type in ['Edit', 'Document']:
                    elem_info['value'] = name[:100] if name else ""  # Truncate long text
                    elements['text_fields'].append(elem_info)
                elif ctrl_type == 'ComboBox':
                    elements['dropdowns'].append(elem_info)
                elif name:  # Other interactive elements with names
                    elements['other'].append(elem_info)
                    
            except Exception:
                continue
                
    except Exception as e:
        print(f"Error scanning elements: {e}", file=sys.stderr)
    
    # Filter if requested
    if buttons_only:
        return {'buttons': elements['buttons']}
    elif links_only:
        return {'links': elements['links']}
    
    # Remove empty categories
    return {k: v for k, v in elements.items() if v}


def main():
    parser = argparse.ArgumentParser(description='Read UI elements from a window')
    parser.add_argument('window_title', help='Window title to search for')
    parser.add_argument('--buttons-only', action='store_true', help='Only return buttons')
    parser.add_argument('--links-only', action='store_true', help='Only return links')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    
    args = parser.parse_args()
    
    try:
        desktop = Desktop(backend="uia")
        windows = desktop.windows()
        matching_window = None
        
        for window in windows:
            title = window.window_text()
            if args.window_title.lower() in title.lower():
                matching_window = window
                break
        
        if not matching_window:
            print(f"Error: Window containing '{args.window_title}' not found")
            print("\nAvailable windows:")
            for w in windows:
                if w.window_text():
                    print(f"  - {w.window_text()}")
            sys.exit(1)
        
        elements = get_ui_elements(
            matching_window, 
            buttons_only=args.buttons_only,
            links_only=args.links_only
        )
        
        if args.json:
            print(json.dumps(elements, indent=2, ensure_ascii=False))
        else:
            print(f"Window: {matching_window.window_text()}\n")
            for category, items in elements.items():
                if items:
                    print(f"=== {category.upper()} ({len(items)}) ===")
                    for item in items:
                        coords = ""
                        if 'rect' in item:
                            coords = f" @ ({item['rect']['center_x']}, {item['rect']['center_y']})"
                        enabled = "" if item.get('enabled', True) else " [DISABLED]"
                        print(f"  [{item['type']}] {item['name']}{coords}{enabled}")
                    print()
                    
    except ElementNotFoundError:
        print(f"Error: Window '{args.window_title}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
