import sqlite3
import os
import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database.db')

def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    return db

def init_db():
    db = get_db()
    db.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            lang TEXT DEFAULT 'ar',
            is_banned INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            last_active TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS stickers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            pack_name TEXT,
            pack_title TEXT,
            emoji TEXT DEFAULT '✨',
            sticker_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS recent_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            text TEXT,
            font_color TEXT DEFAULT '#ffffff',
            bg_color TEXT DEFAULT '#1a1a2e',
            font_size INTEGER DEFAULT 200,
            font_name TEXT DEFAULT 'NotoNaskhArabic',
            stroke_width INTEGER DEFAULT 0,
            stroke_color TEXT DEFAULT '#000000',
            shadow_enabled INTEGER DEFAULT 0,
            gradient_enabled INTEGER DEFAULT 0,
            gradient_colors TEXT DEFAULT '["#00f3ff","#8b5cf6"]',
            rounded_corners INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
    ''')
    db.commit()
    db.close()

async def add_user(user_id, username, first_name, last_name):
    db = get_db()
    db.execute('INSERT OR IGNORE INTO users (id, username, first_name, last_name) VALUES (?, ?, ?, ?)',
               (user_id, username, first_name, last_name))
    db.execute('UPDATE users SET last_active = datetime(\'now\'), username = ?, first_name = ?, last_name = ? WHERE id = ?',
               (username, first_name, last_name, user_id))
    db.commit()
    db.close()

async def get_user(user_id):
    db = get_db()
    user = db.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    db.close()
    return user

async def is_banned(user_id):
    db = get_db()
    user = db.execute('SELECT is_banned FROM users WHERE id = ?', (user_id,)).fetchone()
    db.close()
    return user and user['is_banned'] == 1

async def get_stats():
    db = get_db()
    total_users = db.execute('SELECT COUNT(*) as c FROM users').fetchone()['c']
    total_stickers = db.execute('SELECT COUNT(*) as c FROM stickers').fetchone()['c']
    total_packs = db.execute('SELECT COUNT(*) as c FROM stickers').fetchone()['c']
    today_users = db.execute("SELECT COUNT(*) as c FROM users WHERE date(created_at) = date('now')").fetchone()['c']
    today_packs = db.execute("SELECT COUNT(*) as c FROM stickers WHERE date(created_at) = date('now')").fetchone()['c']
    db.close()
    return {'total_users': total_users, 'total_stickers': total_stickers, 'total_packs': total_packs,
            'today_users': today_users, 'today_packs': today_packs}

async def get_all_users():
    db = get_db()
    users = db.execute('SELECT id, username, first_name, is_banned FROM users ORDER BY created_at DESC').fetchall()
    db.close()
    return [dict(u) for u in users]

async def save_sticker_pack(user_id, pack_name, pack_title, sticker_count):
    db = get_db()
    db.execute('INSERT INTO stickers (user_id, pack_name, pack_title, sticker_count) VALUES (?, ?, ?, ?)',
               (user_id, pack_name, pack_title, sticker_count))
    db.commit()
    db.close()

async def ban_user(user_id):
    db = get_db()
    db.execute('UPDATE users SET is_banned = 1 WHERE id = ?', (user_id,))
    db.commit()
    db.close()

async def unban_user(user_id):
    db = get_db()
    db.execute('UPDATE users SET is_banned = 0 WHERE id = ?', (user_id,))
    db.commit()
    db.close()

async def save_recent_project(user_id, data):
    db = get_db()
    existing = db.execute('SELECT id FROM recent_projects WHERE user_id = ? ORDER BY created_at DESC', (user_id,)).fetchone()
    if existing:
        db.execute('''UPDATE recent_projects SET text=?, font_color=?, bg_color=?, font_size=?, font_name=?,
                   stroke_width=?, stroke_color=?, shadow_enabled=?, gradient_enabled=?, gradient_colors=?,
                   rounded_corners=? WHERE id=?''',
                   (data.get('text'), data.get('font_color'), data.get('bg_color'), data.get('font_size'),
                    data.get('font_name'), data.get('stroke_width', 0), data.get('stroke_color'),
                    1 if data.get('shadow_enabled') else 0, 1 if data.get('gradient_enabled') else 0,
                    json.dumps(data.get('gradient_colors', ['#00f3ff', '#8b5cf6'])),
                    data.get('rounded_corners', 0), existing['id']))
    else:
        db.execute('''INSERT INTO recent_projects (user_id, text, font_color, bg_color, font_size, font_name,
                   stroke_width, stroke_color, shadow_enabled, gradient_enabled, gradient_colors, rounded_corners)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                   (user_id, data.get('text'), data.get('font_color'), data.get('bg_color'), data.get('font_size'),
                    data.get('font_name'), data.get('stroke_width', 0), data.get('stroke_color'),
                    1 if data.get('shadow_enabled') else 0, 1 if data.get('gradient_enabled') else 0,
                    json.dumps(data.get('gradient_colors', ['#00f3ff', '#8b5cf6'])),
                    data.get('rounded_corners', 0)))
    db.commit()
    db.close()

def init():
    init_db()

import json
