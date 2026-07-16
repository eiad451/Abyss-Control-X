import json
import os
import sys

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.json')

def load_config():
    if not os.path.exists(CONFIG_PATH):
        save_config({'bot_token': '', 'admin_ids': []})
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_config(data):
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def get_token():
    config = load_config()
    if config.get('bot_token'):
        return config['bot_token']
    token = input('Enter Bot Token: ').strip()
    if token:
        config['bot_token'] = token
        save_config(config)
        print('✓ Token saved to config.json')
        return token
    print('✗ Token required')
    sys.exit(1)

def add_admin(user_id):
    config = load_config()
    if user_id not in config.get('admin_ids', []):
        config.setdefault('admin_ids', []).append(user_id)
        save_config(config)
