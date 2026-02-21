#!/usr/bin/env python3
"""
Screenshot - Capture screen and save to file.
DO NOT output base64 to stdout - it will overflow the context window.
Instead, save to file and let the AI use the read tool to view it.
"""
import pyautogui
import os
import sys
import time

try:
    # Take screenshot
    screenshot = pyautogui.screenshot()

    # Save to temp directory
    temp_dir = os.environ.get('TEMP', os.environ.get('TMP', '/tmp'))
    screenshot_dir = os.path.join(temp_dir, 'openclaw-screenshots')
    os.makedirs(screenshot_dir, exist_ok=True)

    # Clean up old screenshots (keep last 20)
    try:
        files = sorted(
            [f for f in os.listdir(screenshot_dir) if f.startswith('screenshot-')],
            key=lambda x: os.path.getmtime(os.path.join(screenshot_dir, x))
        )
        for old_file in files[:-20]:
            os.remove(os.path.join(screenshot_dir, old_file))
    except Exception:
        pass

    timestamp = int(time.time() * 1000)
    filename = f'screenshot-{timestamp}.jpg'
    filepath = os.path.join(screenshot_dir, filename)

    # Save as JPEG (quality 85 for good visual quality, much smaller than PNG)
    screenshot.save(filepath, format='JPEG', quality=85, optimize=True)

    # Output ONLY the file path - NO base64!
    # The AI should use the read tool to view the image.
    print(f"Screenshot saved: {filepath}")
    print(f"Screen size: {screenshot.size[0]}x{screenshot.size[1]}")
    print(f"To view this screenshot, use the read tool on the file path above.")
    print(f"To show the user, include [screenshot: {filepath}] in your response.")

except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
