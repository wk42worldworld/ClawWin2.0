#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Read Webpage - Extract content from browser windows with enhanced element detection
Usage: py read_webpage.py                           # Read active browser window
       py read_webpage.py "Chrome"                  # Read Chrome specifically
       py read_webpage.py "Firefox" --buttons       # Include buttons
       py read_webpage.py "Edge" --links            # Include links with URLs
       py read_webpage.py "Chrome" --full           # Full extraction (all elements)

Returns structured content from browser webpages.
"""
import sys
import io
import json
import argparse
from pywinauto import Desktop
from pywinauto.findwindows import ElementNotFoundError

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BROWSER_NAMES = ['chrome', 'firefox', 'edge', 'brave', 'opera', 'vivaldi', 'arc']


def is_browser_window(title):
    """Check if window title indicates a browser."""
    title_lower = title.lower()
    return any(browser in title_lower for browser in BROWSER_NAMES)


def find_browser_window(desktop, browser_hint=None):
    """Find a browser window."""
    windows = desktop.windows()
    
    for window in windows:
        try:
            title = window.window_text()
            if browser_hint:
                if browser_hint.lower() in title.lower():
                    return window, title
            elif is_browser_window(title):
                return window, title
        except:
            continue
    
    return None, None


def extract_webpage_content(window, include_buttons=False, include_links=False, full=False):
    """Extract content from a browser window."""
    content = {
        'title': window.window_text(),
        'text': [],
        'headings': [],
        'buttons': [],
        'links': [],
        'inputs': [],
        'images': []
    }
    
    try:
        for ctrl in window.descendants():
            try:
                ctrl_type = ctrl.element_info.control_type
                name = ctrl.window_text().strip() if ctrl.window_text() else ""
                
                if not name:
                    continue
                
                # Skip very long text (probably not useful)
                if len(name) > 1000:
                    name = name[:1000] + "..."
                
                elem = {'name': name, 'type': ctrl_type}
                
                # Get coordinates for clickable elements
                if ctrl_type in ['Button', 'Hyperlink', 'Link']:
                    try:
                        rect = ctrl.rectangle()
                        elem['center'] = ((rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2)
                    except:
                        pass
                
                # Categorize content
                if ctrl_type in ['Text', 'Static']:
                    # Check if it looks like a heading
                    if len(name) < 100 and name.isupper() or name.endswith(':'):
                        content['headings'].append(name)
                    else:
                        content['text'].append(name)
                        
                elif ctrl_type == 'Button' and (include_buttons or full):
                    content['buttons'].append(elem)
                    
                elif ctrl_type in ['Hyperlink', 'Link'] and (include_links or full):
                    # Try to get the URL
                    try:
                        automation_id = ctrl.element_info.automation_id
                        if automation_id and automation_id.startswith('http'):
                            elem['url'] = automation_id
                    except:
                        pass
                    content['links'].append(elem)
                    
                elif ctrl_type in ['Edit', 'ComboBox'] and full:
                    try:
                        elem['value'] = ctrl.get_value() if hasattr(ctrl, 'get_value') else ""
                    except:
                        elem['value'] = ""
                    content['inputs'].append(elem)
                    
                elif ctrl_type == 'Image' and full:
                    content['images'].append(elem)
                    
            except:
                continue
                
    except Exception as e:
        content['error'] = str(e)
    
    # Remove duplicates from text
    seen = set()
    unique_text = []
    for t in content['text']:
        if t not in seen:
            seen.add(t)
            unique_text.append(t)
    content['text'] = unique_text
    
    # Clean up empty fields
    return {k: v for k, v in content.items() if v}


def main():
    parser = argparse.ArgumentParser(description='Read content from browser window')
    parser.add_argument('browser', nargs='?', help='Browser name to target')
    parser.add_argument('--buttons', '-b', action='store_true', help='Include buttons')
    parser.add_argument('--links', '-l', action='store_true', help='Include links')
    parser.add_argument('--full', '-f', action='store_true', help='Full extraction (all elements)')
    parser.add_argument('--json', '-j', action='store_true', help='Output as JSON')
    parser.add_argument('--max-text', type=int, default=50, help='Max text items to show')
    
    args = parser.parse_args()
    desktop = Desktop(backend="uia")
    
    window, title = find_browser_window(desktop, args.browser)
    
    if not window:
        print("No browser window found")
        print("\nAvailable windows:")
        for w in desktop.windows():
            t = w.window_text()
            if t:
                print(f"  - {t}")
        sys.exit(1)
    
    content = extract_webpage_content(
        window,
        include_buttons=args.buttons,
        include_links=args.links,
        full=args.full
    )
    
    if args.json:
        # Convert tuples to lists for JSON
        for key in ['buttons', 'links', 'inputs']:
            if key in content:
                for item in content[key]:
                    if 'center' in item:
                        item['center'] = list(item['center'])
        print(json.dumps(content, indent=2, ensure_ascii=False))
    else:
        print(f"Page: {content.get('title', 'Unknown')}\n")
        
        if 'headings' in content:
            print("=== HEADINGS ===")
            for h in content['headings'][:20]:
                print(f"  # {h}")
            print()
        
        if 'text' in content:
            print("=== TEXT CONTENT ===")
            for i, t in enumerate(content['text'][:args.max_text]):
                # Clean up text for display
                display = t.replace('\n', ' ').replace('\r', '')[:200]
                print(f"  {display}")
            if len(content['text']) > args.max_text:
                print(f"  ... and {len(content['text']) - args.max_text} more items")
            print()
        
        if 'buttons' in content:
            print("=== BUTTONS ===")
            for btn in content['buttons'][:20]:
                coords = f" @ {btn['center']}" if 'center' in btn else ""
                print(f"  [{btn['name']}]{coords}")
            print()
        
        if 'links' in content:
            print("=== LINKS ===")
            for link in content['links'][:30]:
                url = f" -> {link['url']}" if 'url' in link else ""
                coords = f" @ {link['center']}" if 'center' in link else ""
                print(f"  {link['name']}{url}{coords}")
            print()
        
        if 'inputs' in content:
            print("=== INPUT FIELDS ===")
            for inp in content['inputs'][:10]:
                print(f"  [{inp['name']}]: {inp.get('value', '')}")
            print()


if __name__ == "__main__":
    main()
