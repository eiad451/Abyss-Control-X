#!/usr/bin/env python3
import subprocess, sys, os, json, urllib.request, importlib, logging, asyncio, sqlite3
from pathlib import Path

BASE = Path(__file__).parent
sys.path.insert(0, str(BASE))

REQUIRED = {'aiogram':'aiogram', 'PIL':'Pillow'}
missing = []
for imp, pkg in REQUIRED.items():
    try:
        importlib.import_module(imp)
    except:
        missing.append(pkg)
if missing:
    print('📦 Installing dependencies...')
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages'] + missing)
    print('  ✓ Dependencies installed')

SYSTEM_FONTS = [
    '/system/fonts/MiSansArabicVF.ttf',
    '/system/fonts/NotoNaskhArabic-VariableFont_wght.ttf',
    '/system/fonts/DroidSans.ttf',
]
FONTS_DIR = BASE / 'fonts'
FONTS_DIR.mkdir(exist_ok=True)
for src in SYSTEM_FONTS:
    if os.path.exists(src):
        dst = FONTS_DIR / os.path.basename(src)
        if not dst.exists():
            import shutil
            shutil.copy2(src, str(dst))
            sz = os.path.getsize(str(dst))
            print(f'  ✓ Font: {os.path.basename(src)} ({sz//1024}KB)')
        break

CONFIG_PATH = BASE / 'config.json'
def load_config():
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
    return {'bot_token': '', 'admin_ids': []}
def save_config(data):
    CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')

cfg = load_config()
token = cfg.get('bot_token', '')
if not token:
    token = input('Enter Bot Token: ').strip()
    if token:
        cfg['bot_token'] = token
        save_config(cfg)
        print('  ✓ Token saved')
    else:
        print('  ✗ Token required')
        sys.exit(1)

DB_PATH = BASE / 'database.db'
def db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, first_name TEXT, last_name TEXT, is_banned INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), last_active TEXT DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS stickers (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, pack_name TEXT, pack_title TEXT, sticker_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS recent (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, text TEXT, font_color TEXT DEFAULT '#ffffff', bg_color TEXT DEFAULT '#1a1a2e', font_size INTEGER DEFAULT 200, font_name TEXT DEFAULT 'NotoNaskhArabic', stroke_width INTEGER DEFAULT 0, shadow_enabled INTEGER DEFAULT 0, gradient_enabled INTEGER DEFAULT 0, rounded_corners INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
    ''')
    conn.commit()
    return conn
db()

from aiogram import Router, F, Bot, Dispatcher
from aiogram.types import Message, CallbackQuery, InputFile, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.filters import Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from PIL import Image, ImageDraw, ImageFont

router = Router()
user_cfg = {}

class S(StatesGroup):
    text = State(); pack = State(); pack_text = State(); custom = State()

TEMP = BASE / 'temp'; TEMP.mkdir(exist_ok=True)

def get_font(size):
    for f in sorted(os.listdir(str(FONTS_DIR))):
        if f.endswith(('.ttf', '.otf')):
            try:
                return ImageFont.truetype(str(FONTS_DIR / f), size)
            except: pass
    return ImageFont.load_default()

def make_sticker(text, cfg):
    fc, bg, fs = cfg.get('font_color','#ffffff'), cfg.get('bg_color','#1a1a2e'), cfg.get('font_size',200)
    sw, sc, sh, gr, rc = cfg.get('stroke_width',0), cfg.get('stroke_color','#000'), cfg.get('shadow_enabled',False), cfg.get('gradient_enabled',False), cfg.get('rounded_corners',0)
    gc = cfg.get('gradient_colors', ['#00f3ff','#8b5cf6'])
    font = get_font(max(fs, 50))
    dummy = ImageDraw.Draw(Image.new('RGBA',(1,1)))
    lines = text.split('\n')
    bbox = dummy.textbbox((0,0), max(lines, key=len) if lines else text, font=font)
    tw, th = bbox[2]-bbox[0], (bbox[3]-bbox[1])*len(lines)+(len(lines)-1)*10
    pad = 60
    cw, ch = int(min(max(tw+pad*2, 512),512)), int(min(max(th+pad*2, 512),512))
    if gr:
        try:
            c1 = tuple(int(gc[0].lstrip('#')[i:i+2],16) for i in (0,2,4))
            c2 = tuple(int(gc[1].lstrip('#')[i:i+2],16) for i in (0,2,4))
            img = Image.new('RGBA', (cw,ch))
            for y in range(ch):
                r = int(c1[0]*(1-y/ch)+c2[0]*(y/ch))
                g = int(c1[1]*(1-y/ch)+c2[1]*(y/ch))
                b = int(c1[2]*(1-y/ch)+c2[2]*(y/ch))
                for x in range(cw): img.putpixel((x,y),(r,g,b,255))
        except: img = Image.new('RGBA', (cw,ch), tuple(int(bg.lstrip('#')[i:i+2],16) for i in (0,2,4))+(255,))
    else: img = Image.new('RGBA', (cw,ch), tuple(int(bg.lstrip('#')[i:i+2],16) for i in (0,2,4))+(255,))
    if rc > 0:
        m = Image.new('L', (cw,ch), 0)
        draw = ImageDraw.Draw(m)
        draw.rounded_rectangle((0,0,cw-1,ch-1), rc, fill=255)
        img.putalpha(m)
    draw = ImageDraw.Draw(img)
    fcrgb = tuple(int(fc.lstrip('#')[i:i+2],16) for i in (0,2,4))
    scrgb = tuple(int(sc.lstrip('#')[i:i+2],16) for i in (0,2,4))
    total_h = sum((draw.textbbox((0,0), l, font=font)[3]-draw.textbbox((0,0), l, font=font)[1]+10) for l in lines)
    ty = (ch - total_h)//2
    for l in lines:
        lb = draw.textbbox((0,0), l, font=font)
        lw, lh = lb[2]-lb[0], lb[3]-lb[1]
        tx = (cw - lw)//2
        if sh: draw.text((tx+3, ty+3), l, font=font, fill=(0,0,0,100))
        if sw > 0: draw.text((tx, ty), l, font=font, fill=tuple(fcrgb), stroke_width=sw, stroke_fill=tuple(scrgb))
        else: draw.text((tx, ty), l, font=font, fill=tuple(fcrgb))
        ty += lh + 10
    path = TEMP / f's_{os.urandom(4).hex()}.png'
    img.resize((512,512), Image.LANCZOS).save(str(path))
    return str(path)

def mk(rows): return InlineKeyboardMarkup(inline_keyboard=rows)
def mkb(t, d): return InlineKeyboardButton(text=t, callback_data=d)
main_kb = lambda: mk([[mkb('✨ إنشاء ملصق','create_sticker'),mkb('📦 حزمة','create_pack')],[mkb('❓ مساعدة','help')]])
cancel_kb = lambda: mk([[mkb('❌ إلغاء','back_main')]])
cust_kb = lambda: mk([[mkb('🅰️ الخط','font'),mkb('🎨 اللون','color')],[mkb('🖼 الخلفية','bg'),mkb('📏 الحجم','size')],[mkb('✏️ الحواف','stroke'),mkb('🌓 الظل','shadow')],[mkb('🌈 التدرج','gradient'),mkb('🔘 الزوايا','rounded')],[mkb('👁 معاينة','preview'),mkb('✅ إنشاء','confirm')],[mkb('❌','back_main')]])
pack_done_kb = lambda: mk([[mkb('✅ انتهيت','pack_done')],[mkb('❌ إلغاء','back_main')]])
font_kb_full = lambda: mk([[mkb('MiSans Arabic','font_MiSansArabicVF'),mkb('Droid Sans','font_DroidSans')],[mkb('Default','font_default')],[mkb('🔙','back_cust')]])
size_kb = lambda: mk([[mkb('100','size_100'),mkb('150','size_150')],[mkb('200','size_200'),mkb('300','size_300')],[mkb('🔙','back_cust')]])
stroke_kb = lambda: mk([[mkb('بدون','stroke_0'),mkb('2px','stroke_2')],[mkb('5px','stroke_5'),mkb('10px','stroke_10')],[mkb('🔙','back_cust')]])
rounded_kb = lambda: mk([[mkb('0','round_0'),mkb('20','round_20')],[mkb('50','round_50'),mkb('100','round_100')],[mkb('🔙','back_cust')]])
admin_kb = lambda: mk([[mkb('📊 إحصائيات','astats'),mkb('👤 مستخدمين','ausers')],[mkb('📢 بث','abroadcast'),mkb('🔨 حظر','aban')],[mkb('🔙','back_main')]])
admin_back_kb = lambda: mk([[mkb('🔙','aback')]])
COLORS = [('أبيض','#ffffff'),('أسود','#000000'),('أحمر','#ff3355'),('أزرق','#00f3ff'),('أخضر','#00ff88'),('أصفر','#ffcc00'),('بنفسجي','#8b5cf6'),('برتقالي','#ff6b35'),('وردي','#ff006e'),('رمادي','#8888aa')]
BGS = [('غامق','#1a1a2e'),('أسود','#0a0a1a'),('أزرق غامق','#0d1b2a'),('بنفسجي','#1a0a2e'),('فاتح','#f0f0f0'),('أبيض','#ffffff'),('أحمر','#2a0a0a'),('أخضر','#0a2a1a')]
color_kb = lambda: mk([[mkb(n,f'c_{c}') for n,c in COLORS[i:i+2]] for i in range(0,len(COLORS),2)]+[[mkb('🔙','back_cust')]])
bg_kb = lambda: mk([[mkb(n,f'bg_{c}') for n,c in BGS[i:i+2]] for i in range(0,len(BGS),2)]+[[mkb('🔙','back_cust')]])

async def add_user_db(id, uname, fn, ln):
    c = sqlite3.connect(str(DB_PATH))
    c.execute('INSERT OR IGNORE INTO users (id, username, first_name, last_name) VALUES (?,?,?,?)', (id, uname, fn, ln))
    c.execute('UPDATE users SET last_active=datetime(\'now\'), username=?, first_name=?, last_name=? WHERE id=?', (uname, fn, ln, id))
    c.commit(); c.close()
async def is_banned(id):
    c = sqlite3.connect(str(DB_PATH)); c.row_factory = sqlite3.Row; u = c.execute('SELECT is_banned FROM users WHERE id=?', (id,)).fetchone(); c.close()
    return u and u['is_banned'] == 1
async def stats():
    c = sqlite3.connect(str(DB_PATH)); c.row_factory = sqlite3.Row
    s = {'total_users': c.execute('SELECT COUNT(*) as c FROM users').fetchone()['c'], 'total_packs': c.execute('SELECT COUNT(*) as c FROM stickers').fetchone()['c'], 'total_stickers': c.execute('SELECT COUNT(*) as c FROM stickers').fetchone()['c'], 'today_users': c.execute("SELECT COUNT(*) as c FROM users WHERE date(created_at)=date('now')").fetchone()['c'], 'today_packs': c.execute("SELECT COUNT(*) as c FROM stickers WHERE date(created_at)=date('now')").fetchone()['c']}
    c.close(); return s
async def all_users():
    c = sqlite3.connect(str(DB_PATH)); c.row_factory = sqlite3.Row; u = [dict(r) for r in c.execute('SELECT id, username, first_name, is_banned FROM users ORDER BY created_at DESC').fetchall()]; c.close(); return u
async def save_pack(uid, name, title, count):
    c = sqlite3.connect(str(DB_PATH)); c.execute('INSERT INTO stickers (user_id, pack_name, pack_title, sticker_count) VALUES (?,?,?,?)', (uid, name, title, count)); c.commit(); c.close()
async def ban(uid):
    c = sqlite3.connect(str(DB_PATH)); c.execute('UPDATE users SET is_banned=1 WHERE id=?', (uid,)); c.commit(); c.close()
async def unban(uid):
    c = sqlite3.connect(str(DB_PATH)); c.execute('UPDATE users SET is_banned=0 WHERE id=?', (uid,)); c.commit(); c.close()

@router.message(Command('start'))
async def start(m: Message):
    await add_user_db(m.from_user.id, m.from_user.username, m.from_user.first_name, m.from_user.last_name or '')
    if await is_banned(m.from_user.id): return await m.answer('⛔ محظور')
    await m.answer('✨ <b>StickerForgeBot</b>\n\nأرسل لي نصاً وسأحوله إلى ملصق!\nأو أنشئ حزمة ملصقات كاملة.', reply_markup=main_kb())

@router.message(Command('admin'))
async def admin(m: Message):
    cfg = load_config()
    if m.from_user.id in cfg.get('admin_ids',[]):
        s = await stats()
        await m.answer(f'👤 <b>لوحة التحكم</b>\n👥 {s["total_users"]} | 📦 {s["total_packs"]}', reply_markup=admin_kb())
    elif not cfg.get('admin_ids'):
        cfg.setdefault('admin_ids',[]).append(m.from_user.id); save_config(cfg)
        await m.answer('✅ أنت الآن أدمن!')

@router.callback_query(F.data == 'help')
async def help_cb(c: CallbackQuery):
    await c.message.edit_text('🤖 <b>StickerForgeBot</b>\n\n📝 أرسل نص → ملصق\n📦 أنشئ حزمة\n🎨 خصص الخط واللون', reply_markup=main_kb())
    await c.answer()

@router.callback_query(F.data == 'back_main')
async def back(c: CallbackQuery):
    await c.message.edit_text('✨ <b>StickerForgeBot</b>', reply_markup=main_kb()); await c.answer()

@router.callback_query(F.data == 'back_cust')
async def back_cust(c: CallbackQuery):
    uid = c.from_user.id
    cfg = user_cfg.get(uid, {})
    t = cfg.get('text','')
    await c.message.edit_text(f'🎨 <b>تخصيص</b>\n📝 {t[:30]}\n🅰️ {cfg.get("font_name","NotoNaskhArabic")}\n🎨 {cfg.get("font_color","#fff")}\n🖼 {cfg.get("bg_color","#1a1a2e")}', reply_markup=cust_kb())
    await c.answer()

@router.callback_query(F.data == 'create_sticker')
async def cs(c: CallbackQuery, state: FSMContext):
    if await is_banned(c.from_user.id): return await c.answer('⛔', show_alert=True)
    await state.set_state(S.text); await c.message.edit_text('📝 أرسل النص:', reply_markup=cancel_kb()); await c.answer()

@router.message(StateFilter(S.text))
async def rt(m: Message, state: FSMContext):
    if len(m.text) > 100: return await m.answer('❌ النص طويل')
    uid = m.from_user.id
    user_cfg[uid] = {'text':m.text,'font_color':'#ffffff','bg_color':'#1a1a2e','font_size':200,'font_name':'NotoNaskhArabic','stroke_width':0,'stroke_color':'#000','shadow_enabled':False,'gradient_enabled':False,'rounded_corners':0}
    await state.set_state(S.custom)
    cfg = user_cfg[uid]
    await m.answer(f'🎨 <b>تخصيص</b>\n📝 {cfg["text"][:30]}', reply_markup=cust_kb())

@router.callback_query(StateFilter(S.custom))
async def cust_cb(c: CallbackQuery, state: FSMContext):
    uid = c.from_user.id; d = c.data; cfg = user_cfg.get(uid,{})
    if d == 'font': return await c.message.edit_text('🅰️ اختر الخط:', reply_markup=font_kb_full())
    if d == 'color': return await c.message.edit_text('🎨 اختر اللون:', reply_markup=color_kb())
    if d == 'bg': return await c.message.edit_text('🖼 اختر الخلفية:', reply_markup=bg_kb())
    if d == 'size': return await c.message.edit_text('📏 اختر الحجم:', reply_markup=size_kb())
    if d == 'stroke': return await c.message.edit_text('✏️ اختر الحواف:', reply_markup=stroke_kb())
    if d == 'shadow': cfg['shadow_enabled'] = not cfg.get('shadow_enabled', False); user_cfg[uid]=cfg; return await back_cust(c)
    if d == 'gradient': cfg['gradient_enabled'] = not cfg.get('gradient_enabled', False); user_cfg[uid]=cfg; return await back_cust(c)
    if d == 'rounded': return await c.message.edit_text('🔘 اختر الزوايا:', reply_markup=rounded_kb())
    if d.startswith('font_'): cfg['font_name']=d.replace('font_',''); user_cfg[uid]=cfg; return await back_cust(c)
    if d.startswith('c_'): cfg['font_color']=d.replace('c_',''); user_cfg[uid]=cfg; return await back_cust(c)
    if d.startswith('bg_'): cfg['bg_color']=d.replace('bg_',''); user_cfg[uid]=cfg; return await back_cust(c)
    if d.startswith('size_'): cfg['font_size']=int(d.replace('size_','')); user_cfg[uid]=cfg; return await back_cust(c)
    if d.startswith('stroke_'): cfg['stroke_width']=int(d.replace('stroke_','')); user_cfg[uid]=cfg; return await back_cust(c)
    if d.startswith('round_'): cfg['rounded_corners']=int(d.replace('round_','')); user_cfg[uid]=cfg; return await back_cust(c)
    if d == 'preview':
        await c.answer('🎨 جاري الإنشاء...')
        try:
            p = make_sticker(cfg['text'], cfg)
            await c.message.answer_document(InputFile(p, 'preview.png'), caption='👁 معاينة', reply_markup=mk([[mkb('✅ تأكيد','confirm'),mkb('🔙 تعديل','back_cust')]]))
        except Exception as e: await c.message.answer(f'❌ {str(e)[:100]}')
    if d == 'confirm':
        await state.clear()
        try:
            p = make_sticker(cfg['text'], cfg)
            name = f'forge_{uid}_{int(asyncio.get_event_loop().time())}'
            await c.message.answer_document(InputFile(p, 'sticker.png'), caption=f'✅ <b>تم!</b>\n\n🔗 t.me/addstickers/{name}', reply_markup=main_kb())
            await save_pack(uid, name, 'Sticker', 1)
        except Exception as e: await c.message.answer(f'❌ {str(e)[:100]}')
        finally:
            if uid in user_cfg: del user_cfg[uid]
    await c.answer()

@router.callback_query(F.data == 'create_pack')
async def cp(c: CallbackQuery, state: FSMContext):
    if await is_banned(c.from_user.id): return await c.answer('⛔', show_alert=True)
    uid = c.from_user.id; user_cfg[uid] = {'pack_texts':[],'font_color':'#ffffff','bg_color':'#1a1a2e','font_size':200,'font_name':'NotoNaskhArabic','stroke_width':0,'shadow_enabled':False,'gradient_enabled':False,'rounded_corners':0}
    await state.set_state(S.pack_text)
    await c.message.edit_text('📦 أرسل النصوص واحداً تلو الآخر:\nاضغط "✅ انتهيت" عند الإكمال', reply_markup=pack_done_kb()); await c.answer()

@router.message(StateFilter(S.pack_text))
async def pack_add(m: Message, state: FSMContext):
    uid = m.from_user.id
    if len(m.text) > 100: return
    cfg = user_cfg.get(uid,{}); cfg.setdefault('pack_texts',[]).append(m.text); user_cfg[uid]=cfg
    await m.answer(f'✅ تمت إضافة "{m.text[:20]}" ({len(cfg["pack_texts"])})', reply_markup=pack_done_kb())

@router.callback_query(F.data == 'pack_done', StateFilter(S.pack_text))
async def pack_done(c: CallbackQuery, state: FSMContext):
    uid = c.from_user.id; cfg = user_cfg.get(uid,{}); texts = cfg.get('pack_texts',[])
    if not texts: return await c.answer('❌ لا توجد نصوص', show_alert=True)
    await c.answer('🎨 جاري الإنشاء...')
    paths = []
    try:
        for i, t in enumerate(texts):
            cfg['text'] = t
            paths.append(make_sticker(t, cfg))
        name = f'forgepack_{uid}_{int(asyncio.get_event_loop().time())}'
        await c.message.edit_text(f'✅ <b>تم إنشاء {len(texts)} ملصق!</b>\n\n🔗 t.me/addstickers/{name}', reply_markup=main_kb())
        await save_pack(uid, name, 'Pack', len(texts))
    except Exception as e: await c.message.edit_text(f'❌ {str(e)[:200]}')
    finally:
        for p in paths:
            try: os.remove(p)
            except: pass
        if uid in user_cfg: del user_cfg[uid]
    await state.clear()

@router.callback_query(F.data == 'astats')
async def astats(c: CallbackQuery):
    if c.from_user.id not in load_config().get('admin_ids',[]): return
    s = await stats()
    await c.message.edit_text(f'📊 <b>إحصائيات</b>\n👥 {s["total_users"]}\n📦 {s["total_packs"]}\n🆕 اليوم: {s["today_users"]}', reply_markup=admin_back_kb()); await c.answer()

@router.callback_query(F.data == 'ausers')
async def ausers(c: CallbackQuery):
    if c.from_user.id not in load_config().get('admin_ids',[]): return
    users = await all_users()
    t = f'👥 <b>المستخدمين ({len(users)})</b>\n\n'
    for u in users[:15]: t += f'{"✅" if not u["is_banned"] else "🔨"} <code>{u["id"]}</code> {u["first_name"] or ""}\n'
    await c.message.edit_text(t, reply_markup=admin_back_kb()); await c.answer()

@router.callback_query(F.data == 'abroadcast')
async def abroadcast(c: CallbackQuery, state: FSMContext):
    if c.from_user.id not in load_config().get('admin_ids',[]): return
    await state.set_state(S.text); await c.message.edit_text('📢 أرسل الرسالة:', reply_markup=admin_back_kb()); await c.answer()

@router.message(StateFilter(S.text))
async def broadcast_send(m: Message, state: FSMContext):
    users = await all_users(); s, f = 0, 0
    await m.answer(f'⏳ جاري الإرسال إلى {len(users)}...')
    for u in users:
        try: await m.bot.send_message(u['id'], m.text or '📢'); s+=1
        except: f+=1
    await m.answer(f'✅ تم: {s}\n❌ فشل: {f}', reply_markup=admin_kb()); await state.clear()

@router.callback_query(F.data == 'aban')
async def aban(c: CallbackQuery, state: FSMContext):
    if c.from_user.id not in load_config().get('admin_ids',[]): return
    await state.set_state(S.text); await c.message.edit_text('🔨 أرسل ID المستخدم:', reply_markup=admin_back_kb()); await c.answer()

@router.message(StateFilter(S.text))
async def ban_process(m: Message, state: FSMContext):
    try:
        tid = int(m.text.strip()); c = sqlite3.connect(str(DB_PATH)); c.row_factory = sqlite3.Row; u = c.execute('SELECT is_banned FROM users WHERE id=?', (tid,)).fetchone()
        if not u: return await m.answer('❌ غير موجود')
        await (unban if u['is_banned'] else ban)(tid); await m.answer(f'✅ {"فك حظر" if u["is_banned"] else "حظر"} <code>{tid}</code>', reply_markup=admin_kb())
    except: await m.answer('❌ ID غير صحيح')
    await state.clear()

@router.callback_query(F.data == 'aback')
async def aback(c: CallbackQuery):
    s = await stats()
    await c.message.edit_text(f'👤 <b>لوحة التحكم</b>\n👥 {s["total_users"]} | 📦 {s["total_packs"]}', reply_markup=admin_kb()); await c.answer()

async def main():
    logging.basicConfig(level=logging.ERROR)
    bot = Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher(); dp.include_router(router)
    me = await bot.get_me()
    print(f'\n  ✓ @{me.username} is running!\n  👉 https://t.me/{me.username}\n', flush=True)
    await dp.start_polling(bot)

if __name__ == '__main__':
    try: asyncio.run(main())
    except KeyboardInterrupt: print('Stopped.')
