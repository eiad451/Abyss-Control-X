from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

def main_menu_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='✨ إنشاء ملصق', callback_data='create_sticker'),
         InlineKeyboardButton(text='📦 حزمة ملصقات', callback_data='create_pack')],
        [InlineKeyboardButton(text='⚙️ الإعدادات', callback_data='settings'),
         InlineKeyboardButton(text='❓ المساعدة', callback_data='help')],
    ])

def cancel_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='❌ إلغاء', callback_data='back_main')]
    ])

def customize_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='🅰️ الخط', callback_data='customize_font'),
         InlineKeyboardButton(text='🎨 اللون', callback_data='customize_color')],
        [InlineKeyboardButton(text='🖼 الخلفية', callback_data='customize_bg'),
         InlineKeyboardButton(text='📏 الحجم', callback_data='customize_size')],
        [InlineKeyboardButton(text='✏️ الحواف', callback_data='customize_stroke'),
         InlineKeyboardButton(text='🌓 الظل', callback_data='customize_shadow')],
        [InlineKeyboardButton(text='🌈 التدرج', callback_data='customize_gradient'),
         InlineKeyboardButton(text='🔘 الزوايا', callback_data='customize_rounded')],
        [InlineKeyboardButton(text='👁 المعاينة', callback_data='customize_preview')],
        [InlineKeyboardButton(text='✅ تأكيد وإنشاء', callback_data='customize_confirm'),
         InlineKeyboardButton(text='❌ إلغاء', callback_data='back_main')],
    ])

def preview_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='🔙 تعديل', callback_data='customize_more'),
         InlineKeyboardButton(text='✅ تأكيد', callback_data='customize_confirm')],
    ])

def font_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='🅰️ Noto Naskh Arabic', callback_data='font_NotoNaskhArabic'),
         InlineKeyboardButton(text='🅱️ Noto Sans Arabic', callback_data='font_NotoSansArabic')],
        [InlineKeyboardButton(text='📐 Cairo', callback_data='font_Cairo'),
         InlineKeyboardButton(text='🔮 Orbitron', callback_data='font_Orbitron')],
        [InlineKeyboardButton(text='📏 Rajdhani', callback_data='font_Rajdhani'),
         InlineKeyboardButton(text='🔙 رجوع', callback_data='customize_more')],
    ])

def color_keyboard():
    colors = [
        ('⚪ أبيض', '#ffffff'), ('⚫ أسود', '#000000'),
        ('🔴 أحمر', '#ff3355'), ('🔵 أزرق', '#00f3ff'),
        ('🟢 أخضر', '#00ff88'), ('🟡 أصفر', '#ffcc00'),
        ('🟣 بنفسجي', '#8b5cf6'), ('🟠 برتقالي', '#ff6b35'),
        ('🩷 وردي', '#ff006e'), ('🔘 رمادي', '#8888aa'),
    ]
    rows = []
    for i in range(0, len(colors), 2):
        row = []
        for name, code in colors[i:i+2]:
            row.append(InlineKeyboardButton(text=name, callback_data=f'color_{code}'))
        rows.append(row)
    rows.append([InlineKeyboardButton(text='🔙 رجوع', callback_data='customize_more')])
    return InlineKeyboardMarkup(inline_keyboard=rows)

def bg_color_keyboard():
    colors = [
        ('⬛ غامق', '#1a1a2e'), ('⚫ أسود', '#0a0a1a'),
        ('🔵 أزرق غامق', '#0d1b2a'), ('🟣 بنفسجي غامق', '#1a0a2e'),
        ('⬜ فاتح', '#f0f0f0'), ('⚪ أبيض', '#ffffff'),
        ('🔴 أحمر', '#2a0a0a'), ('🟢 أخضر غامق', '#0a2a1a'),
        ('🟦 تدرج أزرق', '#0000aa'), ('🟥 تدرج أحمر', '#aa0000'),
    ]
    rows = []
    for i in range(0, len(colors), 2):
        row = []
        for name, code in colors[i:i+2]:
            row.append(InlineKeyboardButton(text=name, callback_data=f'bg_{code}'))
        rows.append(row)
    rows.append([InlineKeyboardButton(text='🌈 تدرج لوني', callback_data='customize_gradient')])
    rows.append([InlineKeyboardButton(text='🔙 رجوع', callback_data='customize_more')])
    return InlineKeyboardMarkup(inline_keyboard=rows)

def size_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='🔟 صغير (100)', callback_data='size_100'),
         InlineKeyboardButton(text='🔵 وسط (150)', callback_data='size_150')],
        [InlineKeyboardButton(text='🅰️ كبير (200)', callback_data='size_200'),
         InlineKeyboardButton(text='🅰️🅰️ كبير جداً (250)', callback_data='size_250')],
        [InlineKeyboardButton(text='🅰️🅰️🅰️ ضخم (300)', callback_data='size_300'),
         InlineKeyboardButton(text='🔙 رجوع', callback_data='customize_more')],
    ])

def stroke_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='🚫 بدون', callback_data='stroke_0'),
         InlineKeyboardButton(text='🔹 رفيع (2)', callback_data='stroke_2')],
        [InlineKeyboardButton(text='🔸 وسط (5)', callback_data='stroke_5'),
         InlineKeyboardButton(text='⬛ سميك (10)', callback_data='stroke_10')],
        [InlineKeyboardButton(text='🔙 رجوع', callback_data='customize_more')],
    ])

def rounded_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='🔲 مربع (0)', callback_data='rounded_0'),
         InlineKeyboardButton(text='🔘 خفيف (20)', callback_data='rounded_20')],
        [InlineKeyboardButton(text='🔘 وسط (50)', callback_data='rounded_50'),
         InlineKeyboardButton(text='🔘 دائري (100)', callback_data='rounded_100')],
        [InlineKeyboardButton(text='🔘 شديد (150)', callback_data='rounded_150'),
         InlineKeyboardButton(text='🔙 رجوع', callback_data='customize_more')],
    ])

def pack_done_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='✅ انتهيت', callback_data='pack_done')],
        [InlineKeyboardButton(text='❌ إلغاء', callback_data='back_main')],
    ])

def admin_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='📊 الإحصائيات', callback_data='admin_stats'),
         InlineKeyboardButton(text='👥 المستخدمين', callback_data='admin_users')],
        [InlineKeyboardButton(text='📢 إرسال جماعي', callback_data='admin_broadcast'),
         InlineKeyboardButton(text='🔨 حظر/فك حظر', callback_data='admin_ban')],
        [InlineKeyboardButton(text='🔙 خروج', callback_data='back_main')],
    ])

def admin_back_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='🔙 رجوع', callback_data='admin_back')],
    ])
