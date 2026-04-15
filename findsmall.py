import re

with open('/Users/tornikezarisze/Portfolio/logo-transparent.svg') as f:
    s = f.read()

results = []
for p in re.finditer(r'<path ([^>]+)/>', s):
    attrs = p.group(1)
    transform_match = re.search(r'translate\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)', attrs)
    fill_match = re.search(r'fill="([^"]+)"', attrs)
    d_match = re.search(r' d="([^"]+)"', attrs)
    if transform_match and fill_match and d_match:
        tx, ty = float(transform_match.group(1)), float(transform_match.group(2))
        fill = fill_match.group(1)
        path_len = len(d_match.group(1))
        # Small paths in visible region
        if 380 <= ty <= 700 and 256 <= tx <= 1000 and path_len < 300:
            results.append((ty, tx, fill, path_len, d_match.group(1)[:120]))

results.sort()
print(f"Found {len(results)} small paths in visible region:")
for ty, tx, fill, plen, d in results:
    print(f"y={ty:.0f} x={tx:.0f} fill={fill} len={plen}")
    print(f"  d: {d}")
    print()
