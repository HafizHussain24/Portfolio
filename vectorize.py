import cv2
import numpy as np
import sys

img_path = r'C:\Users\hafiz\.gemini\antigravity-ide\brain\6d755854-5410-407e-8438-5a8ab94e8ba3\.user_uploaded\media_1791031003469.jpg'
out_path = 'public/joker.svg'

try:
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError("Could not read image")
        
    # Scale down slightly to smooth out noise, but keep enough detail for text
    H, W = img.shape[:2]
    # Let's resize it so the max dimension is around 600px
    scale = 600.0 / max(H, W)
    new_W, new_H = int(W * scale), int(H * scale)
    img = cv2.resize(img, (new_W, new_H), interpolation=cv2.INTER_AREA)
    
    # Smooth the image to reduce contour noise
    img = cv2.bilateralFilter(img, d=9, sigmaColor=75, sigmaSpace=75)
    
    # K-Means clustering for color quantization
    Z = img.reshape((-1, 3))
    Z = np.float32(Z)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    
    # K = 6 (White, Black, Yellow, Green, Red, Grey)
    K = 6
    ret, label, center = cv2.kmeans(Z, K, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)
    
    center = np.uint8(center)
    res = center[label.flatten()]
    quantized = res.reshape((img.shape))
    
    # Start building SVG
    svg_content = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {new_W} {new_H}" width="100%" height="100%">']
    
    # For each color, extract contours and create an SVG path
    for i, color in enumerate(center):
        # Convert BGR to RGB hex
        b, g, r = color
        hex_color = f"#{r:02x}{g:02x}{b:02x}"
        
        # Create mask for this color
        mask = (label.flatten() == i).reshape((new_H, new_W)).astype(np.uint8) * 255
        
        # Find contours
        contours, hierarchy = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_TC89_L1)
        
        for idx, contour in enumerate(contours):
            # Ignore tiny noise paths
            if cv2.contourArea(contour) < 5:
                continue
            
            # Use approxPolyDP to smooth jagged edges and reduce point count
            epsilon = 0.002 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            path_d = ""
            for j, pt in enumerate(approx):
                x, y = pt[0]
                if j == 0:
                    path_d += f"M {x},{y} "
                else:
                    path_d += f"L {x},{y} "
            path_d += "Z"
            
            # Append path if not empty
            if len(approx) >= 3:
                # We determine if it's a hole or not by checking hierarchy, but for SVG we can just fill it with evenodd or write as separate paths in correct order since we draw all colors.
                # Actually, drawing from largest area to smallest area helps overlap issues!
                # Wait, we are drawing mutually exclusive masks, so overlap doesn't matter!
                svg_content.append(f'  <path d="{path_d}" fill="{hex_color}" shape-rendering="crispEdges" />')

    svg_content.append('</svg>\n')
    
    with open(out_path, 'w') as f:
        f.write("\n".join(svg_content))
        
    print("Successfully traced image using OpenCV contours!")
except Exception as e:
    import traceback
    traceback.print_exc()
    sys.exit(1)
