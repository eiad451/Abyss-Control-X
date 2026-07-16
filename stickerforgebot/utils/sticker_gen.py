import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import numpy as np
import json
import io
import re

FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'fonts')
TEMP_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'temp')

os.makedirs(FONTS_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

FONT_MAP = {
    'NotoNaskhArabic': 'NotoNaskhArabic-VariableFont_wght.ttf',
    'NotoSansArabic': 'NotoSansArabic-VariableFont_wght.ttf',
    'Cairo': 'Cairo-VariableFont_slnt,wght.ttf',
    'Orbitron': 'Orbitron-VariableFont_wght.ttf',
    'Rajdhani': 'Rajdhani-Regular.ttf',
    'Arial': 'arial.ttf',
}

def get_font_path(font_name, size):
    font_file = FONT_MAP.get(font_name, 'NotoNaskhArabic-VariableFont_wght.ttf')
    path = os.path.join(FONTS_DIR, font_file)
    if not os.path.exists(path):
        from PIL import ImageFont
        try:
            return ImageFont.truetype(path, size)
        except:
            return ImageFont.load_default()
    return ImageFont.truetype(path, size)

def create_text_sticker(text, config):
    font_color = config.get('font_color', '#ffffff')
    bg_color = config.get('bg_color', '#1a1a2e')
    font_size = config.get('font_size', 200)
    font_name = config.get('font_name', 'NotoNaskhArabic')
    stroke_width = config.get('stroke_width', 0)
    stroke_color = config.get('stroke_color', '#000000')
    shadow_enabled = config.get('shadow_enabled', False)
    gradient_enabled = config.get('gradient_enabled', False)
    gradient_colors = config.get('gradient_colors', ['#00f3ff', '#8b5cf6'])
    rounded_corners = config.get('rounded_corners', 0)

    font = get_font_path(font_name, font_size)

    temp_img = Image.new('RGBA', (1, 1), (0, 0, 0, 0))
    temp_draw = ImageDraw.Draw(temp_img)

    lines = text.split('\n')
    max_line = max(lines, key=len) if lines else text
    bbox = temp_draw.textbbox((0, 0), max_line if len(lines) <= 1 else max(lines, key=len), font=font)

    text_width = bbox[2] - bbox[0]
    text_height = (bbox[3] - bbox[1]) * len(lines) + (len(lines) - 1) * 10

    padding = 60
    canvas_w = text_width + padding * 2
    canvas_h = text_height + padding * 2
    canvas_w = max(canvas_w, 512)
    canvas_h = max(canvas_h, 512)

    if canvas_w > 512 or canvas_h > 512:
        scale = min(500 / canvas_w, 500 / canvas_h)
        font_size = int(font_size * scale)
        font = get_font_path(font_name, font_size)
        bbox = temp_draw.textbbox((0, 0), max_line if len(lines) <= 1 else max(lines, key=len), font=font)
        text_width = bbox[2] - bbox[0]
        text_height = (bbox[3] - bbox[1]) * len(lines) + (len(lines) - 1) * 10
        canvas_w = text_width + padding * 2
        canvas_h = text_height + padding * 2
        canvas_w = max(canvas_w, 512)
        canvas_h = max(canvas_h, 512)

    canvas_w = int(min(canvas_w, 512))
    canvas_h = int(min(canvas_h, 512))

    if gradient_enabled:
        try:
            c1 = hex_to_rgb(gradient_colors[0])
            c2 = hex_to_rgb(gradient_colors[1])
            bg = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
            for y in range(canvas_h):
                ratio = y / canvas_h
                r = int(c1[0] * (1 - ratio) + c2[0] * ratio)
                g = int(c1[1] * (1 - ratio) + c2[1] * ratio)
                b = int(c1[2] * (1 - ratio) + c2[2] * ratio)
                for x in range(canvas_w):
                    bg.putpixel((x, y), (r, g, b, 255))
        except:
            bg = Image.new('RGBA', (canvas_w, canvas_h), hex_to_rgba(bg_color))
    else:
        bg = Image.new('RGBA', (canvas_w, canvas_h), hex_to_rgba(bg_color))

    if rounded_corners > 0:
        bg = round_corners(bg, rounded_corners)

    draw = ImageDraw.Draw(bg)

    text_x = (canvas_w - text_width) // 2
    text_y = (canvas_h - text_height) // 2

    fc = hex_to_rgb(font_color)
    sc = hex_to_rgb(stroke_color)

    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        lw = bbox[2] - bbox[0]
        x = (canvas_w - lw) // 2
        y = text_y + i * (bbox[3] - bbox[1] + 10)

        if shadow_enabled:
            shadow_offset = max(3, font_size // 30)
            draw.text((x + shadow_offset, y + shadow_offset), line, font=font, fill=(0, 0, 0, 120))

        if stroke_width > 0:
            draw.text((x, y), line, font=font, fill=tuple(sc), stroke_width=stroke_width, stroke_fill=tuple(sc))
        else:
            draw.text((x, y), line, font=font, fill=tuple(fc))

    output_path = os.path.join(TEMP_DIR, f'sticker_{os.urandom(4).hex()}.png')

    bg.resize((512, 512), Image.LANCZOS).save(output_path, 'PNG')
    return output_path

def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def hex_to_rgba(hex_color, alpha=255):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4)) + (alpha,)

def round_corners(img, radius):
    circle = Image.new('L', (radius * 2, radius * 2), 0)
    draw = ImageDraw.Draw(circle)
    draw.ellipse((0, 0, radius * 2 - 1, radius * 2 - 1), fill=255)
    w, h = img.size
    alpha = Image.new('L', (w, h), 255)
    alpha.paste(circle.crop((0, 0, radius, radius)), (0, 0))
    alpha.paste(circle.crop((radius, 0, radius * 2, radius)), (w - radius, 0))
    alpha.paste(circle.crop((0, radius, radius, radius * 2)), (0, h - radius))
    alpha.paste(circle.crop((radius, radius, radius * 2, radius * 2)), (w - radius, h - radius))
    img.putalpha(alpha)
    return img

def create_pack_file(pack_name, sticker_paths, emojis):
    import zipfile
    zip_path = os.path.join(TEMP_DIR, f'{pack_name}.zip')
    with zipfile.ZipFile(zip_path, 'w') as zf:
        for i, path in enumerate(sticker_paths):
            zf.write(path, f'sticker_{i+1}.png')
    return zip_path

def cleanup_temp():
    for f in os.listdir(TEMP_DIR):
        try:
            os.remove(os.path.join(TEMP_DIR, f))
        except:
            pass
