#!/usr/bin/env python3
"""
Read Screen Region - Extract text from screen coordinates using OCR
Usage: py read_region.py x1 y1 x2 y2
       py read_region.py 100 100 500 300
Note: Requires pytesseract + Tesseract OCR installed
"""
import sys
import pyautogui
from PIL import Image
import io

# Note: This is a fallback method. For better accuracy, install:
# 1. Tesseract OCR: https://github.com/tesseract-ocr/tesseract
# 2. pip install pytesseract
# Then uncomment the pytesseract import

try:
    import pytesseract
    HAS_OCR = True
except ImportError:
    HAS_OCR = False

if len(sys.argv) < 5:
    print("Usage: py read_region.py x1 y1 x2 y2")
    print("Example: py read_region.py 100 100 500 300")
    sys.exit(1)

x1 = int(sys.argv[1])
y1 = int(sys.argv[2])
x2 = int(sys.argv[3])
y2 = int(sys.argv[4])

try:
    # Capture region
    width = x2 - x1
    height = y2 - y1
    
    if width <= 0 or height <= 0:
        print("Error: Invalid coordinates (x2 must be > x1, y2 must be > y1)")
        sys.exit(1)
    
    screenshot = pyautogui.screenshot(region=(x1, y1, width, height))
    
    if HAS_OCR:
        # Extract text using OCR
        text = pytesseract.image_to_string(screenshot)
        if text.strip():
            print(text.strip())
        else:
            print("No text detected in region")
    else:
        print("OCR not available. Install tesseract and pytesseract:")
        print("  1. Download Tesseract: https://github.com/tesseract-ocr/tesseract")
        print("  2. pip install pytesseract")
        print("\nFor now, use read_window.py for UI text extraction")
        sys.exit(1)
        
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
