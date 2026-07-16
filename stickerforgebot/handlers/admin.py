from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from utils.database import get_stats, get_all_users, ban_user, unban_user
from utils.config import load_config, add_admin
from keyboards.inline import admin_keyboard, admin_back_keyboard, main_menu_keyboard
from aiogram import Bot

router = Router()

class AdminStates(StatesGroup):
    broadcast_text = State()
    ban_user_id = State()

@router.callback_query(F.data == 'admin_stats')
async def admin_stats(callback: CallbackQuery):
    user_id = callback.from_user.id
    config = load_config()
    if user_id not in config.get('admin_ids', []):
        await callback.answer('⛔ Unauthorized', show_alert=True)
        return
    stats = await get_stats()
    await callback.message.edit_text(
        f'📊 <b>الإحصائيات</b>\n\n'
        f'👥 إجمالي المستخدمين: <b>{stats["total_users"]}</b>\n'
        f'📦 الحزم المنشأة: <b>{stats["total_packs"]}</b>\n'
        f'🆕 مستخدمين اليوم: <b>{stats["today_users"]}</b>\n'
        f'📦 حزم اليوم: <b>{stats["today_packs"]}</b>\n\n'
        f'📅 التحديث: لحظي',
        parse_mode='HTML',
        reply_markup=admin_back_keyboard()
    )
    await callback.answer()

@router.callback_query(F.data == 'admin_broadcast')
async def admin_broadcast_start(callback: CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    config = load_config()
    if user_id not in config.get('admin_ids', []):
        await callback.answer('⛔ Unauthorized', show_alert=True)
        return
    await state.set_state(AdminStates.broadcast_text)
    await callback.message.edit_text(
        '📢 <b>إرسال رسالة جماعية</b>\n\n'
        'أرسل الرسالة التي تريد نشرها لجميع المستخدمين:',
        parse_mode='HTML',
        reply_markup=admin_back_keyboard()
    )
    await callback.answer()

@router.message(StateFilter(AdminStates.broadcast_text))
async def admin_broadcast_send(message: Message, state: FSMContext, bot: Bot):
    users = await get_all_users()
    sent = 0
    failed = 0
    await message.answer(f'⏳ جاري الإرسال إلى {len(users)} مستخدم...')
    for user in users:
        try:
            await bot.send_message(user['id'], message.text or message.caption or '📢 رسالة جماعية')
            sent += 1
        except:
            failed += 1
    await message.answer(
        f'✅ <b>تم الإرسال!</b>\n\n'
        f'✓ تم الإرسال: {sent}\n'
        f'✗ فشل: {failed}\n'
        f'👥 الإجمالي: {len(users)}',
        parse_mode='HTML',
        reply_markup=admin_keyboard()
    )
    await state.clear()

@router.callback_query(F.data == 'admin_ban')
async def admin_ban_start(callback: CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    config = load_config()
    if user_id not in config.get('admin_ids', []):
        await callback.answer('⛔ Unauthorized', show_alert=True)
        return
    await state.set_state(AdminStates.ban_user_id)
    await callback.message.edit_text(
        '🔨 <b>حظر / فك حظر مستخدم</b>\n\n'
        'أرسل معرف المستخدم (ID) الرقمي:\n'
        'مثال: <code>123456789</code>',
        parse_mode='HTML',
        reply_markup=admin_back_keyboard()
    )
    await callback.answer()

@router.message(StateFilter(AdminStates.ban_user_id))
async def admin_ban_process(message: Message, state: FSMContext):
    try:
        target_id = int(message.text.strip())
        from utils.database import get_user
        user = await get_user(target_id)
        if not user:
            await message.answer('❌ المستخدم غير موجود في قاعدة البيانات')
            await state.clear()
            return
        if user['is_banned']:
            await unban_user(target_id)
            await message.answer(f'✅ تم فك الحظر عن المستخدم <code>{target_id}</code>', parse_mode='HTML', reply_markup=admin_keyboard())
        else:
            await ban_user(target_id)
            await message.answer(f'✅ تم حظر المستخدم <code>{target_id}</code>', parse_mode='HTML', reply_markup=admin_keyboard())
    except ValueError:
        await message.answer('❌ الرجاء إرسال رقم ID صحيح')
    except Exception as e:
        await message.answer(f'❌ خطأ: {str(e)[:100]}')
    await state.clear()

@router.callback_query(F.data == 'admin_users')
async def admin_users(callback: CallbackQuery):
    user_id = callback.from_user.id
    config = load_config()
    if user_id not in config.get('admin_ids', []):
        await callback.answer('⛔ Unauthorized', show_alert=True)
        return
    users = await get_all_users()
    text = f'👥 <b>المستخدمين ({len(users)})</b>\n\n'
    for u in users[:20]:
        status = '✅' if not u['is_banned'] else '🔨'
        name = u['first_name'] or u['username'] or 'N/A'
        text += f'{status} <code>{u["id"]}</code> - {name}\n'
    if len(users) > 20:
        text += f'\n... وعرض {len(users) - 20} آخرين'
    await callback.message.edit_text(text, parse_mode='HTML', reply_markup=admin_back_keyboard())
    await callback.answer()

@router.callback_query(F.data == 'admin_back')
async def admin_back(callback: CallbackQuery):
    from utils.database import get_stats
    stats = await get_stats()
    await callback.message.edit_text(
        f'👤 <b>لوحة التحكم</b>\n\n'
        f'👥 المستخدمين: {stats["total_users"]}\n'
        f'📦 الحزم: {stats["total_packs"]}\n'
        f'🆕 اليوم: {stats["today_users"]} مستخدم',
        reply_markup=admin_keyboard(),
        parse_mode='HTML'
    )
    await callback.answer()
