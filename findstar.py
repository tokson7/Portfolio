with open('/Users/tornikezarisze/Portfolio/index.html', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines, 1):
    for ch in line:
        cp = ord(ch)
        if cp > 8000 and cp not in range(0x2018, 0x2060):
            print(f'Line {i}: U+{cp:04X} ({ch}) -- {line.strip()[:100]}')
