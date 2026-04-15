import re

with open('/Users/tornikezarisze/Portfolio/logo-transparent.svg', 'r') as f:
    svg = f.read()

# 1. Remove the solid dark background rectangle (fill #1F1F1F, full 1024x1024)
svg = re.sub(r'<path d="M0 0 C337\.92 0 675\.84 0 1024 0 C1024 337\.92 1024 675\.84 1024 1024 C686\.08 1024 348\.16 1024 0 1024 C0 686\.08 0 348\.16 0 0 Z [^"]*" fill="#1F1F1F"[^/]*/>', '', svg)

# 2. Crop viewBox to actual logo content area (horns + TORO letters)
#    Real bounds from path analysis: x=256-992, y=380-670
svg = re.sub(
    r'width="1024" height="1024"',
    'width="736" height="290" viewBox="256 380 736 290"',
    svg
)

with open('/Users/tornikezarisze/Portfolio/logo-transparent.svg', 'w') as f:
    f.write(svg)

print('done')
