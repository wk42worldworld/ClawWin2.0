#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Handle Dialogs - Detect, read, and interact with Windows dialogs
Usage: py handle_dialog.py list              # List all open dialogs
       py handle_dialog.py read              # Read current active dialog
       py handle_dialog.py click "OK"        # Click button in dialog
       py handle_dialog.py click "Save"      # Click Save button
       py handle_dialog.py type "filename"   # Type into dialog text field
       py handle_dialog.py dismiss           # Click OK/Close/Cancel

Handles: Save dialogs, Open dialogs, Message boxes, Alerts, Confirmations, etc.
"""
import sys
import io
import json
import argparse
from pywinauto import Desktop
from pywinauto.findwindows import ElementNotFoundError
import time

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Common dialog control types and window classes
DIALOG_CLASSES = [
    '#32770',  # Standard Windows dialog
    'Dialog',
    'MessageBox',
    'Alert',
    'Popup',
]

DIALOG_TYPES = [
    'Window',
    'Dialog',
    'Pane'
]

# Common button names for dismissing dialogs
DISMISS_BUTTONS = ['OK', 'Close', 'Cancel', 'Yes', 'No', 'Dismiss', 'Got it', 'Accept', 'Done']


def find_dialogs(desktop):
    """Find all open dialogs/popups."""
    dialogs = []
    
    for window in desktop.windows():
        try:
            title = window.window_text()
            ctrl_type = window.element_info.control_type
            class_name = window.element_info.class_name
            
            # Check if it's a dialog-like window
            is_dialog = (
                ctrl_type in DIALOG_TYPES or
                any(dc in class_name for dc in DIALOG_CLASSES) or
                'dialog' in title.lower() or
                'save' in title.lower() or
                'open' in title.lower() or
                'confirm' in title.lower() or
                'warning' in title.lower() or
                'error' in title.lower() or
                'alert' in title.lower()
            )
            
            if is_dialog and title:
                # Get dialog info
                rect = window.rectangle()
                dialogs.append({
                    'title': title,
                    'class': class_name,
                    'type': ctrl_type,
                    'rect': {
                        'left': rect.left,
                        'top': rect.top,
                        'right': rect.right,
                        'bottom': rect.bottom
                    },
                    'window': window
                })
        except:
            continue
    
    return dialogs


def read_dialog(window):
    """Read all content from a dialog."""
    content = {
        'title': window.window_text(),
        'message': [],
        'buttons': [],
        'text_fields': [],
        'checkboxes': [],
        'dropdowns': [],
        'list_items': []
    }
    
    try:
        for ctrl in window.descendants():
            try:
                ctrl_type = ctrl.element_info.control_type
                name = ctrl.window_text().strip() if ctrl.window_text() else ""
                
                elem = {
                    'name': name,
                    'type': ctrl_type,
                    'enabled': ctrl.is_enabled() if hasattr(ctrl, 'is_enabled') else True
                }
                
                # Get coordinates
                try:
                    rect = ctrl.rectangle()
                    elem['center'] = ((rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2)
                except:
                    pass
                
                if ctrl_type == 'Button' and name:
                    content['buttons'].append(elem)
                elif ctrl_type in ['Text', 'Static'] and name:
                    content['message'].append(name)
                elif ctrl_type in ['Edit', 'ComboBox']:
                    try:
                        elem['value'] = ctrl.get_value() if hasattr(ctrl, 'get_value') else name
                    except:
                        elem['value'] = name
                    content['text_fields'].append(elem)
                elif ctrl_type == 'CheckBox':
                    try:
                        elem['checked'] = ctrl.get_toggle_state() == 1
                    except:
                        pass
                    content['checkboxes'].append(elem)
                elif ctrl_type == 'ListItem' and name:
                    content['list_items'].append(elem)
                    
            except:
                continue
                
    except Exception as e:
        print(f"Error reading dialog: {e}", file=sys.stderr)
    
    # Clean up empty fields
    return {k: v for k, v in content.items() if v}


def click_button(window, button_name):
    """Click a button in the dialog by name."""
    button_name_lower = button_name.lower()
    
    for ctrl in window.descendants():
        try:
            ctrl_type = ctrl.element_info.control_type
            name = ctrl.window_text().strip() if ctrl.window_text() else ""
            
            if ctrl_type == 'Button' and button_name_lower in name.lower():
                if ctrl.is_enabled():
                    ctrl.click()
                    return True, f"Clicked button: {name}"
                else:
                    return False, f"Button '{name}' is disabled"
        except:
            continue
    
    return False, f"Button '{button_name}' not found"


def type_in_field(window, text, field_index=0):
    """Type text into a text field in the dialog."""
    fields = []
    
    for ctrl in window.descendants():
        try:
            ctrl_type = ctrl.element_info.control_type
            if ctrl_type in ['Edit', 'ComboBox'] and ctrl.is_enabled():
                fields.append(ctrl)
        except:
            continue
    
    if not fields:
        return False, "No text fields found in dialog"
    
    if field_index >= len(fields):
        return False, f"Field index {field_index} out of range (found {len(fields)} fields)"
    
    try:
        field = fields[field_index]
        field.set_focus()
        time.sleep(0.1)
        field.type_keys(text, with_spaces=True)
        return True, f"Typed into field {field_index}"
    except Exception as e:
        return False, f"Failed to type: {e}"


def dismiss_dialog(window):
    """Try to dismiss a dialog by clicking common buttons."""
    for button_name in DISMISS_BUTTONS:
        success, msg = click_button(window, button_name)
        if success:
            return True, msg
    
    # Try pressing Escape as fallback
    try:
        window.type_keys('{ESC}')
        return True, "Sent Escape key to dialog"
    except:
        pass
    
    return False, "Could not find any dismiss button"


def main():
    parser = argparse.ArgumentParser(description='Handle Windows dialogs')
    parser.add_argument('action', choices=['list', 'read', 'click', 'type', 'dismiss', 'wait'],
                       help='Action to perform')
    parser.add_argument('value', nargs='?', default='', help='Button name or text to type')
    parser.add_argument('--window', '-w', help='Target specific window by title')
    parser.add_argument('--field', '-f', type=int, default=0, help='Field index for typing')
    parser.add_argument('--timeout', '-t', type=int, default=10, help='Timeout for wait action')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    
    args = parser.parse_args()
    desktop = Desktop(backend="uia")
    
    if args.action == 'list':
        dialogs = find_dialogs(desktop)
        if args.json:
            # Remove window objects for JSON serialization
            output = [{k: v for k, v in d.items() if k != 'window'} for d in dialogs]
            print(json.dumps(output, indent=2, ensure_ascii=False))
        else:
            if not dialogs:
                print("No dialogs found")
            else:
                print(f"Found {len(dialogs)} dialog(s):\n")
                for i, d in enumerate(dialogs):
                    print(f"{i+1}. {d['title']}")
                    print(f"   Class: {d['class']}, Type: {d['type']}")
                    print()
    
    elif args.action == 'read':
        dialogs = find_dialogs(desktop)
        
        if args.window:
            target = None
            for d in dialogs:
                if args.window.lower() in d['title'].lower():
                    target = d['window']
                    break
            if not target:
                print(f"Dialog '{args.window}' not found")
                sys.exit(1)
        elif dialogs:
            # Get the frontmost/most recent dialog
            target = dialogs[0]['window']
        else:
            print("No dialogs found")
            sys.exit(1)
        
        content = read_dialog(target)
        if args.json:
            # Convert tuples to lists for JSON
            for key in ['buttons', 'text_fields', 'checkboxes']:
                if key in content:
                    for item in content[key]:
                        if 'center' in item:
                            item['center'] = list(item['center'])
            print(json.dumps(content, indent=2, ensure_ascii=False))
        else:
            print(f"Dialog: {content.get('title', 'Unknown')}\n")
            if 'message' in content:
                print("Message:")
                for msg in content['message']:
                    print(f"  {msg}")
                print()
            if 'buttons' in content:
                print("Buttons:")
                for btn in content['buttons']:
                    enabled = "" if btn['enabled'] else " [DISABLED]"
                    coords = f" @ {btn['center']}" if 'center' in btn else ""
                    print(f"  [{btn['name']}]{coords}{enabled}")
                print()
            if 'text_fields' in content:
                print("Text Fields:")
                for i, field in enumerate(content['text_fields']):
                    print(f"  {i}: {field.get('value', '(empty)')}")
                print()
    
    elif args.action == 'click':
        if not args.value:
            print("Error: Button name required")
            sys.exit(1)
        
        dialogs = find_dialogs(desktop)
        if args.window:
            target = None
            for d in dialogs:
                if args.window.lower() in d['title'].lower():
                    target = d['window']
                    break
        elif dialogs:
            target = dialogs[0]['window']
        else:
            # Try finding button in active window
            target = desktop.window(active_only=True)
        
        if not target:
            print("No dialog found")
            sys.exit(1)
        
        success, msg = click_button(target, args.value)
        print(msg)
        sys.exit(0 if success else 1)
    
    elif args.action == 'type':
        if not args.value:
            print("Error: Text to type required")
            sys.exit(1)
        
        dialogs = find_dialogs(desktop)
        if args.window:
            target = None
            for d in dialogs:
                if args.window.lower() in d['title'].lower():
                    target = d['window']
                    break
        elif dialogs:
            target = dialogs[0]['window']
        else:
            target = desktop.window(active_only=True)
        
        if not target:
            print("No dialog found")
            sys.exit(1)
        
        success, msg = type_in_field(target, args.value, args.field)
        print(msg)
        sys.exit(0 if success else 1)
    
    elif args.action == 'dismiss':
        dialogs = find_dialogs(desktop)
        if not dialogs:
            print("No dialogs to dismiss")
            sys.exit(0)
        
        target = dialogs[0]['window']
        if args.window:
            for d in dialogs:
                if args.window.lower() in d['title'].lower():
                    target = d['window']
                    break
        
        success, msg = dismiss_dialog(target)
        print(msg)
        sys.exit(0 if success else 1)
    
    elif args.action == 'wait':
        """Wait for a dialog to appear."""
        start_time = time.time()
        dialog_title = args.value if args.value else None
        
        while time.time() - start_time < args.timeout:
            dialogs = find_dialogs(desktop)
            
            if dialog_title:
                for d in dialogs:
                    if dialog_title.lower() in d['title'].lower():
                        print(f"Dialog found: {d['title']}")
                        sys.exit(0)
            elif dialogs:
                print(f"Dialog found: {dialogs[0]['title']}")
                sys.exit(0)
            
            time.sleep(0.5)
        
        print(f"Timeout: No dialog found after {args.timeout}s")
        sys.exit(1)


if __name__ == "__main__":
    main()
