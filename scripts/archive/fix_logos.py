#!/usr/bin/env python3
"""
Remove white/light borders from logos, make backgrounds transparent.
The logos have a dark charcoal background with gold borders and rounded corners.
We need to remove any white fringe around the outside and output clean PNGs.
"""
from PIL import Image, ImageFilter
import numpy as np

def process_logo(input_path, output_path, target_size=None):
    """
    Process logo: remove white/near-white pixels around the edges,
    make the outer area fully transparent while preserving the actual logo content.
    """
    img = Image.open(input_path).convert('RGBA')
    data = np.array(img)
    
    # The logos have rounded-rect gold borders on a dark charcoal bg
    # Any white/very light pixels at the CORNERS are the unwanted border
    # Strategy: make pixels that are very light (near white) fully transparent
    # Only target the OUTER region, not the interior
    
    r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
    
    # Find pixels that are very light/white (all channels > 240)
    white_mask = (r > 235) & (g > 235) & (b > 235)
    
    # Also find near-white pixels (all > 220) 
    near_white_mask = (r > 220) & (g > 220) & (b > 220)
    
    # Make white pixels transparent
    data[white_mask, 3] = 0
    
    # For near-white pixels at edges, fade them out
    # Create a border region mask (outer 5% of image)
    h, w = data.shape[:2]
    border = max(int(min(h, w) * 0.03), 3)
    
    edge_mask = np.zeros((h, w), dtype=bool)
    edge_mask[:border, :] = True
    edge_mask[-border:, :] = True
    edge_mask[:, :border] = True
    edge_mask[:, -border:] = True
    
    # Make near-white edge pixels transparent
    data[near_white_mask & edge_mask, 3] = 0
    
    # Also process corners more aggressively (rounded rect corners have white)
    corner_size = max(int(min(h, w) * 0.12), 10)
    
    # Top-left corner
    for y in range(corner_size):
        for x in range(corner_size):
            if y + x < corner_size:
                px = data[y, x]
                brightness = int(px[0]) + int(px[1]) + int(px[2])
                if brightness > 500:  # lighter than dark charcoal
                    data[y, x, 3] = 0
    
    # Top-right corner
    for y in range(corner_size):
        for x in range(w - corner_size, w):
            if y + (w - 1 - x) < corner_size:
                px = data[y, x]
                brightness = int(px[0]) + int(px[1]) + int(px[2])
                if brightness > 500:
                    data[y, x, 3] = 0
    
    # Bottom-left corner
    for y in range(h - corner_size, h):
        for x in range(corner_size):
            if (h - 1 - y) + x < corner_size:
                px = data[y, x]
                brightness = int(px[0]) + int(px[1]) + int(px[2])
                if brightness > 500:
                    data[y, x, 3] = 0
    
    # Bottom-right corner
    for y in range(h - corner_size, h):
        for x in range(w - corner_size, w):
            if (h - 1 - y) + (w - 1 - x) < corner_size:
                px = data[y, x]
                brightness = int(px[0]) + int(px[1]) + int(px[2])
                if brightness > 500:
                    data[y, x, 3] = 0
    
    result = Image.fromarray(data)
    
    if target_size:
        result = result.resize(target_size, Image.LANCZOS)
    
    result.save(output_path, 'PNG', optimize=True)
    print(f"Saved: {output_path} ({result.size[0]}x{result.size[1]})")

# Process helmet icon (sidebar icon)
process_logo(
    'SaintSalHelmetTMLOGO.jpg',
    'saintsal-icon.png',
    target_size=(128, 128)
)

# Process full logo (hero/banner)
process_logo(
    'Untitled-500-x-500-px-2.jpg', 
    'saintsal-labs-logo.png',
    target_size=(500, 500)
)

# Also make a smaller version for general use
process_logo(
    'SaintSalHelmetTMLOGO.jpg',
    'saintsal-icon-sm.png',
    target_size=(64, 64)
)

print("\nAll logos processed - transparent PNGs ready!")
