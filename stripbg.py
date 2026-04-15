from PIL import Image
import shutil
from collections import deque

shutil.copy('/Users/tornikezarisze/Desktop/toro logo.png', '/tmp/toro_orig.png')
img = Image.open('/tmp/toro_orig.png').convert('RGBA')
w, h = img.size
print(f'Image size: {w}x{h}')

pixels = img.load()

def is_bg(r, g, b):
    return (int(r)+int(g)+int(b)) > 510 and max(r,g,b)-min(r,g,b) < 20

# Flat bytearray for O(1) visited checks
visited = bytearray(w * h)
queue = deque()

def seed(x, y):
    r, g, b, a = pixels[x, y]
    if is_bg(r, g, b) and not visited[y*w+x]:
        visited[y*w+x] = 1
        queue.append((x, y))

for x in range(w):
    seed(x, 0); seed(x, h-1)
for y in range(1, h-1):
    seed(0, y); seed(w-1, y)

print(f'BFS starting...')
while queue:
    cx, cy = queue.popleft()
    for nx, ny in ((cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)):
        if 0 <= nx < w and 0 <= ny < h:
            idx = ny*w+nx
            if not visited[idx]:
                r, g, b, a = pixels[nx, ny]
                if is_bg(r, g, b):
                    visited[idx] = 1
                    queue.append((nx, ny))

print('Applying transparency...')
for y in range(h):
    for x in range(w):
        if visited[y*w+x]:
            r, g, b, a = pixels[x, y]
            brightness = int(r)+int(g)+int(b)
            sat = max(r,g,b)-min(r,g,b)
            if brightness > 600 and sat < 10:
                pixels[x, y] = (r, g, b, 0)
            else:
                fade = min(1.0,(brightness-510)/90.0)*max(0.0,1.0-sat/20.0)
                pixels[x, y] = (r, g, b, max(0, int((1.0-fade)*255)))

img.save('/Users/tornikezarisze/Portfolio/toro-logo.png')
print('Done.')

