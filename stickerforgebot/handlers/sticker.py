from aiogram import Router, F
from aiogram.types import Message, CallbackQuery, InputFile
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from utils.sticker_gen import create_text_sticker, create_pack_file, cleanup_temp
from utils.database import add_user, save_sticker_pack, save_recent_project, is_banned
from utils.localization import get_string
from keyboards.inline import *
import os
import re
import asyncio

router = Router()

class StickerStates(StatesGroup):
    waiting_text = State()
    waiting_pack_name = State()
    waiting_pack_texts = State()
    customizing = State()

user_configs = {}

DEFAULT_CONFIG = {
    'font_color': '#ffffff',
    'bg_color': '#1a1a2e',
    'font_size': 200,
    'font_name': 'NotoNaskhArabic',
    'stroke_width': 0,
    'stroke_color': '#000000',
    'shadow_enabled': False,
    'gradient_enabled': False,
    'gradient_colors': ['#00f3ff', '#8b5cf6'],
    'rounded_corners': 0,
}

@router.callback_query(F.data == 'create_sticker')
async def start_create(callback: CallbackQuery, state: FSMContext):
    if await is_banned(callback.from_user.id):
        await callback.answer(get_string('ar', 'banned'), show_alert=True)
        return
    await state.set_state(StickerStates.waiting_text)
    await callback.message.edit_text(
        get_string('ar', 'send_text'),
        reply_markup=cancel_keyboard()
    )
    await callback.answer()

@router.message(StateFilter(StickerStates.waiting_text))
async def receive_text(message: Message, state: FSMContext):
    text = message.text or message.caption or ''
    if len(text) > 100:
        await message.answer(get_string('ar', 'text_too_long'))
        return
    user_id = message.from_user.id
    user_configs[user_id] = {**DEFAULT_CONFIG, 'text': text}
    await state.set_state(StickerStates.customizing)
    await show_customize_menu(message, user_id)

async def show_customize_menu(message, user_id):
    config = user_configs.get(user_id, DEFAULT_CONFIG)
    await message.answer(
        f'🎨 <b>تخصيص الملصق</b>\n\n'
        f'📝 النص: <code>{config["text"][:30]}{"..." if len(config["text"]) > 30 else ""}</code>\n'
        f'🅰️ الخط: {config["font_name"]}\n'
        f'🎨 اللون: {config["font_color"]}\n'
        f'🖼 الخلفية: {config["bg_color"]}\n'
        f'📏 الحجم: {config["font_size"]}\n'
        f'✏️ الحواف: {config["stroke_width"]}px\n'
        f'🌓 الظل: {"✅" if config["shadow_enabled"] else "❌"}\n'
        f'🌈 التدرج: {"✅" if config["gradient_enabled"] else "❌"}\n'
        f'🔘 الزوايا: {config["rounded_corners"]}',
        parse_mode='HTML',
        reply_markup=customize_keyboard()
    )

@router.callback_query(F.data.startswith('customize_'), StateFilter(StickerStates.customizing))
async def customize_handler(callback: CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    data = callback.data
    config = user_configs.get(user_id, {**DEFAULT_CONFIG})

    if data == 'customize_font':
        await callback.message.edit_text(
            get_string('ar', 'choose_font'),
            reply_markup=font_keyboard()
        )
    elif data == 'customize_color':
        await callback.message.edit_text(
            get_string('ar', 'choose_color'),
            reply_markup=color_keyboard()
        )
    elif data == 'customize_bg':
        await callback.message.edit_text(
            get_string('ar', 'choose_bg'),
            reply_markup=bg_color_keyboard()
        )
    elif data == 'customize_size':
        await callback.message.edit_text(
            get_string('ar', 'choose_size'),
            reply_markup=size_keyboard()
        )
    elif data == 'customize_stroke':
        await callback.message.edit_text(
            '✏️ اختر سمك الحواف:',
            reply_markup=stroke_keyboard()
        )
    elif data == 'customize_shadow':
        config['shadow_enabled'] = not config['shadow_enabled']
        user_configs[user_id] = config
        await show_customize_menu(callback.message, user_id)
    elif data == 'customize_gradient':
        config['gradient_enabled'] = not config['gradient_enabled']
        user_configs[user_id] = config
        await show_customize_menu(callback.message, user_id)
    elif data == 'customize_rounded':
        await callback.message.edit_text(
            '🔘 اختر الزوايا الدائرية:',
            reply_markup=rounded_keyboard()
        )
    elif data == 'customize_preview':
        await callback.answer('🎨 جاري إنشاء المعاينة...')
        try:
            path = create_text_sticker(config['text'], config)
            with open(path, 'rb') as f:
                await callback.message.answer_document(
                    InputFile(f, filename='preview.png'),
                    caption='👁 المعاينة',
                    reply_markup=preview_keyboard()
                )
            os.remove(path)
        except Exception as e:
            await callback.message.answer(f'❌ خطأ: {str(e)[:100]}')
    elif data == 'customize_confirm':
        await callback.message.edit_text('📛 ' + get_string('ar', 'pack_name'))
        await state.set_state(StickerStates.waiting_pack_name)
    elif data == 'customize_more':
        await show_customize_menu(callback.message, user_id)

    await callback.answer()

@router.callback_query(F.data.startswith('font_'), StateFilter(StickerStates.customizing))
async def font_choice(callback: CallbackQuery):
    user_id = callback.from_user.id
    font = callback.data.replace('font_', '')
    user_configs.setdefault(user_id, {**DEFAULT_CONFIG})['font_name'] = font
    await show_customize_menu(callback.message, user_id)
    await callback.answer()

@router.callback_query(F.data.startswith('color_'), StateFilter(StickerStates.customizing))
async def color_choice(callback: CallbackQuery):
    user_id = callback.from_user.id
    color = callback.data.replace('color_', '')
    user_configs.setdefault(user_id, {**DEFAULT_CONFIG})['font_color'] = color
    await show_customize_menu(callback.message, user_id)
    await callback.answer()

@router.callback_query(F.data.startswith('bg_'), StateFilter(StickerStates.customizing))
async def bg_choice(callback: CallbackQuery):
    user_id = callback.from_user.id
    bg = callback.data.replace('bg_', '')
    user_configs.setdefault(user_id, {**DEFAULT_CONFIG})['bg_color'] = bg
    await show_customize_menu(callback.message, user_id)
    await callback.answer()

@router.callback_query(F.data.startswith('size_'), StateFilter(StickerStates.customizing))
async def size_choice(callback: CallbackQuery):
    user_id = callback.from_user.id
    size = int(callback.data.replace('size_', ''))
    user_configs.setdefault(user_id, {**DEFAULT_CONFIG})['font_size'] = size
    await show_customize_menu(callback.message, user_id)
    await callback.answer()

@router.callback_query(F.data.startswith('stroke_'), StateFilter(StickerStates.customizing))
async def stroke_choice(callback: CallbackQuery):
    user_id = callback.from_user.id
    width = int(callback.data.replace('stroke_', ''))
    user_configs.setdefault(user_id, {**DEFAULT_CONFIG})['stroke_width'] = width
    await show_customize_menu(callback.message, user_id)
    await callback.answer()

@router.callback_query(F.data.startswith('rounded_'), StateFilter(StickerStates.customizing))
async def rounded_choice(callback: CallbackQuery):
    user_id = callback.from_user.id
    radius = int(callback.data.replace('rounded_', ''))
    user_configs.setdefault(user_id, {**DEFAULT_CONFIG})['rounded_corners'] = radius
    await show_customize_menu(callback.message, user_id)
    await callback.answer()

@router.message(StateFilter(StickerStates.waiting_pack_name))
async def receive_pack_name(message: Message, state: FSMContext):
    user_id = message.from_user.id
    config = user_configs.get(user_id, {})
    if not config.get('text'):
        await message.answer(get_string('ar', 'error'))
        await state.clear()
        return

    pack_name = message.text.strip()
    safe_name = re.sub(r'[^a-zA-Z0-9_]', '_', pack_name)[:30]
    full_pack_name = f'StickerForge_{safe_name}_{user_id}'

    try:
        path = create_text_sticker(config['text'], config)
        sticker_file = InputFile(path)

        msg = await message.answer_sticker(sticker_file)

        await message.answer(
            f'✅ <b>تم إنشاء الملصق!</b>\n\n'
            f'📦 اسم الحزمة: <code>{full_pack_name}</code>\n'
            f'🔗 رابط الحزمة: t.me/addstickers/{full_pack_name}\n\n'
            f'⚠️ ملاحظة: لإضافة الملصق لحزمة تيليجرام فعلية، استخدم @Stickers بوت',
            parse_mode='HTML',
            reply_markup=main_menu_keyboard()
        )

        await save_sticker_pack(user_id, full_pack_name, pack_name, 1)
        await save_recent_project(user_id, config)
        os.remove(path)
    except Exception as e:
        await message.answer(f'❌ خطأ: {str(e)[:200]}')

    await state.clear()
    if user_id in user_configs:
        del user_configs[user_id]

@router.callback_query(F.data == 'create_pack')
async def start_pack(callback: CallbackQuery, state: FSMContext):
    if await is_banned(callback.from_user.id):
        await callback.answer(get_string('ar', 'banned'), show_alert=True)
        return
    user_id = callback.from_user.id
    user_configs[user_id] = {**DEFAULT_CONFIG, 'pack_texts': []}
    await state.set_state(StickerStates.waiting_pack_texts)
    await callback.message.edit_text(
        '📦 <b>إنشاء حزمة ملصقات</b>\n\n'
        'أرسل النصوص واحداً تلو الآخر.\n'
        'عند الانتهاء، اضغط "✅ انتهيت"',
        reply_markup=pack_done_keyboard(),
        parse_mode='HTML'
    )
    await callback.answer()

@router.message(StateFilter(StickerStates.waiting_pack_texts))
async def pack_add_text(message: Message, state: FSMContext):
    user_id = message.from_user.id
    text = message.text or ''
    if len(text) > 100:
        await message.answer(get_string('ar', 'text_too_long'))
        return
    config = user_configs.get(user_id, {**DEFAULT_CONFIG})
    config.setdefault('pack_texts', []).append(text)
    user_configs[user_id] = config
    await message.answer(
        f'✅ تمت إضافة: "{text[:30]}{"..." if len(text) > 30 else ""}"\n'
        f'📝 الإجمالي: {len(config["pack_texts"])}\n'
        'أرسل المزيد أو اضغط "✅ انتهيت"',
        reply_markup=pack_done_keyboard()
    )

@router.callback_query(F.data == 'pack_done', StateFilter(StickerStates.waiting_pack_texts))
async def pack_done(callback: CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    config = user_configs.get(user_id, {})
    texts = config.get('pack_texts', [])

    if not texts:
        await callback.answer('❌ لم ترسل أي نصوص بعد!', show_alert=True)
        return

    await callback.answer('🎨 جاري إنشاء الحزمة...')
    await callback.message.edit_text('⏳ جاري إنشاء الملصقات...')

    sticker_paths = []
    try:
        for i, text in enumerate(texts):
            config['text'] = text
            path = create_text_sticker(text, config)
            sticker_paths.append(path)
            if (i + 1) % 5 == 0:
                await callback.message.edit_text(f'⏳ تم إنشاء {i+1}/{len(texts)}')

        safe_name = f'pack_{user_id}_{int(asyncio.get_event_loop().time())}'
        full_pack_name = f'StickerForgePack_{safe_name}'

        await callback.message.edit_text(
            f'✅ <b>تم إنشاء {len(texts)} ملصق!</b>\n\n'
            f'📦 اسم الحزمة: <code>{full_pack_name}</code>\n'
            f'🔗 رابط الحزمة: t.me/addstickers/{full_pack_name}\n\n'
            f'⚠️ استخدم @Stickers بوت لإضافة هذه الملصقات لحزمة تيليجرام',
            parse_mode='HTML',
            reply_markup=main_menu_keyboard()
        )

        await save_sticker_pack(user_id, full_pack_name, f'Pack {user_id}', len(texts))
        await save_recent_project(user_id, config)
    except Exception as e:
        await callback.message.edit_text(f'❌ خطأ: {str(e)[:200]}')
    finally:
        for p in sticker_paths:
            try: os.remove(p)
            except: pass
        if user_id in user_configs:
            del user_configs[user_id]

    await state.clear()
