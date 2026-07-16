#!/usr/bin/env python3
import os
import urllib.request
import zipfile
import io

FONTS_DIR = os.path.join(os.path.dirname(__file__), 'fonts')
os.makedirs(FONTS_DIR, exist_ok=True)

FONTS = {
    'NotoNaskhArabic-VariableFont_wght.ttf': 'https://github.com/googlefonts/noto-naskh-arabic/raw/main/fonts/variable/NotoNaskhArabic%5Bwght%5D.ttf',
    'NotoSansArabic-VariableFont_wght.ttf': 'https://github.com/googlefonts/noto-sans-arabic/raw/main/fonts/variable/NotoSansArabic%5Bwdth,wght%5D.ttf',
}

print('📥 Downloading fonts...')
for name, url in FONTS.items():
    path = os.path.join(FONTS_DIR, name)
    if not os.path.exists(path):
        print(f'  Downloading {name}...')
        try:
            urllib.request.urlretrieve(url, path)
            print(f'  ✓ {name}')
        except Exception as e:
            print(f'  ✗ {name}: {e}')
    else:
        print(f'  ✓ {name} (already exists)')

print('\n✅ Fonts ready!')
