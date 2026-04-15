import re
with open('/Users/tornikezarisze/Portfolio/logo-transparent.svg') as f:
    s = f.read()

fills = set(re.findall(r'fill="([^"]+)"', s))
print('All fills:')
for fill in sorted(fills):
    print(fill)

# Find non-path/non-structural elements
tags = re.findall(r'<(\w+)[^>]*>', s)
unique_tags = set(tags)
print('\nAll element types:', unique_tags)
