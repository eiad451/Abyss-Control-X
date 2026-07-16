#!/usr/bin/env python3
"""
StickerForgeBot - Telegram Sticker Creation Bot
𖤐 𝕬𝖇𝖞𝖘𝖘 𖤐 - Abyss Control X
"""

import asyncio
import sys
import os
import logging

sys.path.insert(0, os.path.dirname(__file__))

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from utils.config import get_token, load_config
from utils.database import init
from handlers.common import router as common_router
from handlers.sticker import router as sticker_router
from handlers.admin import router as admin_router

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def main():
    print('')
    print('  ╔═══════════════════════════════════════════╗')
    print('  ║         StickerForgeBot v1.0.0            ║')
    print('  ║    Telegram Sticker Creation Platform      ║')
    print('  ║    𖤐 𝕬𝖇𝖞𝖘𝖘 𖤐                        ║')
    print('  ╚═══════════════════════════════════════════╝')
    print('')

    token = get_token()
    config = load_config()

    init()
    logger.info('✓ Database initialized')

    bot = Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()

    dp.include_router(common_router)
    dp.include_router(sticker_router)
    dp.include_router(admin_router)

    bot_info = await bot.get_me()
    logger.info(f'✓ Bot started: @{bot_info.username} (ID: {bot_info.id})')

    if not config.get('admin_ids'):
        logger.info('! No admin configured. Send /admin to set yourself as admin.')
        @dp.message(lambda msg: msg.text == '/admin')
        async def self_admin(message):
            from utils.config import add_admin
            add_admin(message.from_user.id)
            logger.info(f'✓ Admin added: {message.from_user.id}')
            await message.answer('✅ You are now admin!')

    print(f'  ✓ Bot is running: @{bot_info.username}')
    print('  ✓ Press Ctrl+C to stop')
    print('')

    await dp.start_polling(bot)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print('\n  Bot stopped.')
        sys.exit(0)
