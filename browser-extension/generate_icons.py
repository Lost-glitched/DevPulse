import os
from PIL import Image, ImageDraw

output_dir = os.path.dirname(os.path.abspath(__file__))

sizes = [16, 48, 128]

for size in sizes:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background rounded square / circle
    # Outer dark container
    padding = max(1, size // 16)
    draw.ellipse([(padding, padding), (size - padding, size - padding)], fill=(15, 23, 42, 255), outline=(56, 189, 248, 255), width=max(1, size // 24))
    
    # Heartbeat / Pulse line in center
    mid_y = size // 2
    points = [
        (size * 0.2, mid_y),
        (size * 0.35, mid_y),
        (size * 0.45, mid_y - size * 0.28),
        (size * 0.55, mid_y + size * 0.28),
        (size * 0.65, mid_y),
        (size * 0.8, mid_y),
    ]
    
    line_w = max(1, size // 16)
    draw.line(points, fill=(56, 189, 248, 255), width=line_w, joint="curve")
    
    # Small glow dot on the peak
    dot_r = max(1, size // 20)
    peak = points[2]
    draw.ellipse([(peak[0] - dot_r, peak[1] - dot_r), (peak[0] + dot_r, peak[1] + dot_r)], fill=(52, 211, 153, 255))
    
    out_path = os.path.join(output_dir, f"icon{size}.png")
    img.save(out_path, "PNG")
    print(f"Generated {out_path} ({size}x{size})")
