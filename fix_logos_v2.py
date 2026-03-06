#!/usr/bin/env python3
"""
More aggressive white removal - flood fill from corners to remove all white outside the gold border.
"""
from PIL import Image, ImageDraw
import numpy as np

def remove_outer_white(input_path, output_path, target_size=None):
    """Use flood-fill from edges to remove all light pixels outside the logo content."""
    img = Image.open(input_path).convert('RGBA')
    data = np.array(img)
    h, w = data.shape[:2]
    
    # Create alpha mask - start fully opaque
    alpha = np.full((h, w), 255, dtype=np.uint8)
    
    # BFS flood fill from all edge pixels
    # Any pixel that is "light" (brightness > threshold) and connected to edge = transparent
    brightness = data[:,:,0].astype(int) + data[:,:,1].astype(int) + data[:,:,2].astype(int)
    
    # Threshold: white/very light = > 600 (out of 765 max)
    light_threshold = 580
    
    # Also include mid-light pixels that are grayish (not gold/green/dark)
    # Gold pixels have R > G > B significantly
    # Check if pixel is "neutral light" (not colorful)
    r, g, b = data[:,:,0].astype(float), data[:,:,1].astype(float), data[:,:,2].astype(float)
    max_channel = np.maximum(np.maximum(r, g), b)
    min_channel = np.minimum(np.minimum(r, g), b)
    saturation = np.zeros_like(r)
    mask = max_channel > 0
    saturation[mask] = (max_channel[mask] - min_channel[mask]) / max_channel[mask]
    
    # A pixel is "removable" if it's bright AND not very saturated (not gold/green)
    removable = (brightness > light_threshold) | ((brightness > 450) & (saturation < 0.15))
    
    # BFS from all 4 edges
    from collections import deque
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()
    
    # Add all edge pixels that are removable
    for x in range(w):
        if removable[0, x]:
            queue.append((0, x))
            visited[0, x] = True
            alpha[0, x] = 0
        if removable[h-1, x]:
            queue.append((h-1, x))
            visited[h-1, x] = True
            alpha[h-1, x] = 0
    for y in range(h):
        if removable[y, 0]:
            queue.append((y, 0))
            visited[y, 0] = True
            alpha[y, 0] = 0
        if removable[y, w-1]:
            queue.append((y, w-1))
            visited[y, w-1] = True
            alpha[y, w-1] = 0
    
    # BFS
    while queue:
        cy, cx = queue.popleft()
        for dy, dx in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]:
            ny, nx = cy+dy, cx+dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                visited[ny, nx] = True
                if removable[ny, nx]:
                    alpha[ny, nx] = 0
                    queue.append((ny, nx))
    
    # Apply alpha
    data[:,:,3] = alpha
    
    # Anti-alias: soften edges by blurring alpha at transition boundaries
    from PIL import ImageFilter
    result = Image.fromarray(data)
    
    # Extract just the alpha, blur slightly for smooth edges
    alpha_channel = result.split()[3]
    # Slight blur for anti-aliasing
    alpha_smooth = alpha_channel.filter(ImageFilter.GaussianBlur(radius=0.8))
    result.putalpha(alpha_smooth)
    
    if target_size:
        result = result.resize(target_size, Image.LANCZOS)
    
    result.save(output_path, 'PNG', optimize=True)
    print(f"Saved: {output_path} ({result.size[0]}x{result.size[1]})")

# Process both logos
remove_outer_white('SaintSalHelmetTMLOGO.jpg', 'saintsal-icon.png', target_size=(128, 128))
remove_outer_white('Untitled-500-x-500-px-2.jpg', 'saintsal-labs-logo.png', target_size=(500, 500))
remove_outer_white('SaintSalHelmetTMLOGO.jpg', 'saintsal-icon-sm.png', target_size=(64, 64))

print("\nDone - aggressive white removal complete!")
