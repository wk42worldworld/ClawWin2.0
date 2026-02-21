---
name: windows-control
description: Full Windows desktop control. Mouse, keyboard, screenshots - interact with any Windows application like a human.
---

# Windows Control Skill

Full desktop automation for Windows. Control mouse, keyboard, and screen like a human user.

## Quick Start

All scripts are in `skills/windows-control/scripts/`

### Screenshot
```bash
py screenshot.py
```
Saves the screen as JPEG file. Returns only the file path (NO base64 output to avoid context overflow).

**After taking a screenshot, you MUST do two things:**
1. Use the `read` tool on the saved file path to view the screenshot yourself
2. Include the file path in your response using this exact format so the user can see it too:
```
[screenshot: C:\path\to\screenshot-xxx.jpg]
```
The chat interface will render this as an inline image automatically.

**WARNING**: NEVER output base64 image data to stdout. NEVER use `> output.b64`. NEVER try to print or cat the image file content. This will crash the context window. Always save to file and use the read tool.

### Click
```bash
py click.py 500 300              # Left click at (500, 300)
py click.py 500 300 right        # Right click
py click.py 500 300 left 2       # Double click
```

### Type Text
```bash
py type_text.py "Hello World"
```
Types text at current cursor position (10ms between keys).

### Press Keys
```bash
py key_press.py "enter"
py key_press.py "ctrl+s"
py key_press.py "alt+tab"
py key_press.py "ctrl+shift+esc"
```

### Move Mouse
```bash
py mouse_move.py 500 300
```
Moves mouse to coordinates (smooth 0.2s animation).

### Scroll
```bash
py scroll.py up 5      # Scroll up 5 notches
py scroll.py down 10   # Scroll down 10 notches
```

### Window Management (NEW!)
```bash
py focus_window.py "Chrome"           # Bring window to front
py minimize_window.py "Notepad"       # Minimize window
py maximize_window.py "VS Code"       # Maximize window
py close_window.py "Calculator"       # Close window
py get_active_window.py               # Get title of active window
```

### Advanced Actions (NEW!)
```bash
# Click by text (No coordinates needed!)
py click_text.py "Save"               # Click "Save" button anywhere
py click_text.py "Submit" "Chrome"    # Click "Submit" in Chrome only

# Drag and Drop
py drag.py 100 100 500 300            # Drag from (100,100) to (500,300)

# Robust Automation (Wait/Find)
py wait_for_text.py "Ready" "App" 30  # Wait up to 30s for text
py wait_for_window.py "Notepad" 10    # Wait for window to appear
py find_text.py "Login" "Chrome"      # Get coordinates of text
py list_windows.py                    # List all open windows
```

### Read Window Text
```bash
py read_window.py "Notepad"           # Read all text from Notepad
py read_window.py "Visual Studio"     # Read text from VS Code
py read_window.py "Chrome"            # Read text from browser
```
Uses Windows UI Automation to extract actual text (not OCR). Much faster and more accurate than screenshots!

### Read UI Elements (NEW!)
```bash
py read_ui_elements.py "Chrome"               # All interactive elements
py read_ui_elements.py "Chrome" --buttons-only  # Just buttons
py read_ui_elements.py "Chrome" --links-only    # Just links
py read_ui_elements.py "Chrome" --json          # JSON output
```
Returns buttons, links, tabs, checkboxes, dropdowns with coordinates for clicking.

### Read Webpage Content (NEW!)
```bash
py read_webpage.py                     # Read active browser
py read_webpage.py "Chrome"            # Target Chrome specifically
py read_webpage.py "Chrome" --buttons  # Include buttons
py read_webpage.py "Chrome" --links    # Include links with coords
py read_webpage.py "Chrome" --full     # All elements (inputs, images)
py read_webpage.py "Chrome" --json     # JSON output
```
Enhanced browser content extraction with headings, text, buttons, and links.

### Handle Dialogs (NEW!)
```bash
# List all open dialogs
py handle_dialog.py list

# Read current dialog content
py handle_dialog.py read
py handle_dialog.py read --json

# Click button in dialog
py handle_dialog.py click "OK"
py handle_dialog.py click "Save"
py handle_dialog.py click "Yes"

# Type into dialog text field
py handle_dialog.py type "myfile.txt"
py handle_dialog.py type "C:\path\to\file" --field 0

# Dismiss dialog (auto-finds OK/Close/Cancel)
py handle_dialog.py dismiss

# Wait for dialog to appear
py handle_dialog.py wait --timeout 10
py handle_dialog.py wait "Save As" --timeout 5
```
Handles Save/Open dialogs, message boxes, alerts, confirmations, etc.

### Click Element by Name (NEW!)
```bash
py click_element.py "Save"                    # Click "Save" anywhere
py click_element.py "OK" --window "Notepad"   # In specific window
py click_element.py "Submit" --type Button    # Only buttons
py click_element.py "File" --type MenuItem    # Menu items
py click_element.py --list                    # List clickable elements
py click_element.py --list --window "Chrome"  # List in specific window
```
Click buttons, links, menu items by name without needing coordinates.

### Read Screen Region (OCR - Optional)
```bash
py read_region.py 100 100 500 300     # Read text from coordinates
```
Note: Requires Tesseract OCR installation. Use read_window.py instead for better results.

## Workflow Pattern

1. **Read window** - Extract text from specific window (fast, accurate)
2. **Read UI elements** - Get buttons, links with coordinates
3. **Screenshot** (if needed) - See visual layout. Always include `[screenshot: path]` in your response so the user can see it too.
4. **Act** - Click element by name or coordinates
5. **Handle dialogs** - Interact with popups/save dialogs
6. **Read window** - Verify changes

## Screen Coordinates

- Origin (0, 0) is top-left corner
- Your screen: 2560x1440 (check with screenshot)
- Use coordinates from screenshot analysis

## Examples

### Open Notepad and type
```bash
# Press Windows key
py key_press.py "win"

# Type "notepad"
py type_text.py "notepad"

# Press Enter
py key_press.py "enter"

# Wait a moment, then type
py type_text.py "Hello from AI!"

# Save
py key_press.py "ctrl+s"
```

### Click in VS Code
```bash
# Read current VS Code content
py read_window.py "Visual Studio Code"

# Click at specific location (e.g., file explorer)
py click.py 50 100

# Type filename
py type_text.py "test.js"

# Press Enter
py key_press.py "enter"

# Verify new file opened
py read_window.py "Visual Studio Code"
```

### Monitor Notepad changes
```bash
# Read current content
py read_window.py "Notepad"

# User types something...

# Read updated content (no screenshot needed!)
py read_window.py "Notepad"
```

## Text Reading Methods

**Method 1: Windows UI Automation (BEST)**
- Use `read_window.py` for any window
- Use `read_ui_elements.py` for buttons/links with coordinates
- Use `read_webpage.py` for browser content with structure
- Gets actual text data (not image-based)

**Method 2: Click by Name (NEW)**
- Use `click_element.py` to click buttons/links by name
- No coordinates needed - finds elements automatically
- Works across all windows or target specific window

**Method 3: Dialog Handling (NEW)**
- Use `handle_dialog.py` for popups, save dialogs, alerts
- Read dialog content, click buttons, type text
- Auto-dismiss with common buttons (OK, Cancel, etc.)

**Method 4: Screenshot + Vision (Fallback)**
- Take full screenshot
- AI reads text visually
- Slower but works for any content

**Method 5: OCR (Optional)**
- Use `read_region.py` with Tesseract
- Requires additional installation
- Good for images/PDFs with text

## Safety Features

- `pyautogui.FAILSAFE = True` (move mouse to top-left to abort)
- Small delays between actions
- Smooth mouse movements (not instant jumps)

## Requirements

- Python 3.11+
- pyautogui (installed ✅)
- pillow (installed ✅)

## Tips

- Always screenshot first to see current state
- Coordinates are absolute (not relative to windows)
- Wait briefly after clicks for UI to update
- Use `ctrl+z` friendly actions when possible

---

**Status:** ✅ READY FOR USE (v2.0 - Dialog & UI Elements)
**Created:** 2026-02-01
**Updated:** 2026-02-02
