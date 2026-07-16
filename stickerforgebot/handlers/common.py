from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.filters import Command
from utils.database import add_user, get_user, is_banned, get_stats, get_all_users
from utils.localization import get_string
from keyboards.inline import *
import datetime

router = Router()

@router.message(Command('start'))
async def cmd_start(message: Message):
    user = message.from_user
    await add_user(user.id, user.username, user.first_name, user.last_name or '')
    if await is_banned(user.id):
        await message.answer(get_string('ar', 'banned'))
        return
    await message.answer(
        get_string('ar', 'start'),
        reply_markup=main_menu_keyboard(),
        parse_mode='HTML'
    )

@router.message(Command('help'))
async def cmd_help(message: Message):
    await message.answer(
        '🤖 <b>StickerForgeBot</b>\n\n'
        '📝 <b>إنشاء ملصق:</b> أرسل نصاً واختر الإعدادات\n'
        '📦 <b>حزمة ملصقات:</b> أنشئ مجموعة من الملصقات\n'
        '🎨 <b>التخصيص:</b> خط، لون، خلفية، حواف، ظل\n\n'
        '⌨️ استخدم الأزرار للتحكم',
        parse_mode='HTML',
        reply_markup=main_menu_keyboard()
    )

@router.message(Command('admin'))
async def cmd_admin(message: Message):
    user = message.from_user
    from utils.config import load_config
    config = load_config()
    if user.id not in config.get('admin_ids', []):
        await message.answer('⛔ Unauthorized')
        return
    stats = await get_stats()
    await message.answer(
        f'👤 <b>لوحة التحكم</b>\n\n'
        f'👥 المستخدمين: {stats["total_users"]}\n'
        f'📦 الحزم: {stats["total_packs"]}\n'
        f'🆕 اليوم: {stats["today_users"]} مستخدم\n'
        f'📊 إحصائيات يومية متاحة',
        reply_markup=admin_keyboard(),
        parse_mode='HTML'
    )

@router.callback_query(F.data == 'back_main')
async def back_to_main(callback: CallbackQuery):
    await callback.message.edit_text(
        get_string('ar', 'main_menu'),
        reply_markup=main_menu_keyboard()
    )
    await callback.answer()

@router.callback_query(F.data == 'help')
async def show_help(callback: CallbackQuery):
    await callback.message.edit_text(
        '🤖 <b>StickerForgeBot</b>\n\n'
        '📝 <b>إنشاء ملصق:</b> أرسل نصاً واختر الإعدادات\n'
        '📦 <b>حزمة ملصقات:</b> أنشئ مجموعة من الملصقات\n'
        '🎨 <b>التخصيص:</b> خط، لون، خلفية، حواف، ظل\n\n'
        '⌨️ استخدم الأزرار للتحكم',
        parse_mode='HTML',
        reply_markup=main_menu_keyboard()
    )
    await callback.answer()
