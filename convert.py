from PIL import Image
import sys

img_path = r'C:\Users\hafiz\.gemini\antigravity-ide\brain\6d755854-5410-407e-8438-5a8ab94e8ba3\.user_uploaded\media_1791031003469.jpg'
out_path = 'public/joker.svg'

try:
    img = Image.open(img_path).convert('RGB')
    
    # Scale down to retro resolution
    W, H = 60, 84
    img = img.resize((W, H), Image.Resampling.BILINEAR)
    img = img.quantize(colors=16).convert('RGB')
    
    # Write SVG
    with open(out_path, 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="100%" height="100%">\n')
        
        for y in range(H):
            for x in range(W):
                r, g, b = img.getpixel((x, y))
                hex_color = f'#{r:02x}{g:02x}{b:02x}'
                f.write(f'  <rect x="{x}" y="{y}" width="1.1" height="1.1" fill="{hex_color}" />\n')
        
        f.write('</svg>\n')
    print('Successfully created joker.svg with rectangles')
except Exception as e:
    print('Error:', e)
    sys.exit(1)
