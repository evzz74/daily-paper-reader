#!/usr/bin/env python3
# Fix Unicode quotes issue and update prompts in user_upload_summary.py

with open('src/user_upload_summary.py', 'rb') as f:
    content = f.read()

# Fix the Unicode quotes issue - the original file has U+201C and U+201D which break Python
content = content.replace(b'\xe2\x80\x9c', b'"')  # U+201C -> "
content = content.replace(b'\xe2\x80\x9d', b'"')  # U+201D -> "

with open('src/user_upload_summary.py', 'wb') as f:
    f.write(content)

print("Fixed Unicode quotes")
