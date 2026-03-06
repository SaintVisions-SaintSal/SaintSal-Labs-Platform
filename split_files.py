#!/usr/bin/env python3
"""Split index.html into style.css, app.js, and a slim index.html that references them."""
import re

with open("/home/user/workspace/saintsal-app/index.html", "r") as f:
    content = f.read()

# Extract CSS between <style> and </style>
css_match = re.search(r'<style>\s*(.*?)\s*</style>', content, re.DOTALL)
css_content = css_match.group(1) if css_match else ""

# Extract JS between <script> and </script>
js_match = re.search(r'<script>\s*(.*?)\s*</script>', content, re.DOTALL)
js_content = js_match.group(1) if js_match else ""

# Replace inline CSS with link
if css_match:
    content = content.replace(css_match.group(0), '<link rel="stylesheet" href="style.css">')

# Replace inline JS with script src
if js_match:
    content = content.replace(js_match.group(0), '<script src="app.js"></script>')

# Write files
with open("/home/user/workspace/saintsal-app/style.css", "w") as f:
    f.write(css_content)

with open("/home/user/workspace/saintsal-app/app.js", "w") as f:
    f.write(js_content)

with open("/home/user/workspace/saintsal-app/index.html", "w") as f:
    f.write(content)

# Print sizes
import os
for fn in ["index.html", "style.css", "app.js"]:
    size = os.path.getsize(f"/home/user/workspace/saintsal-app/{fn}")
    print(f"  {fn}: {size:,} bytes")
