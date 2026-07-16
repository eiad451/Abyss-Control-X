const TelegramBot = require('node-telegram-bot-api');
const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const db = require('../database/db');
const path = require('path');
const fs = require('fs');

const botInstances = new Map();
const userClientInstances = new Map();

function getBot(token) {
  if (botInstances.has(token)) return botInstances.get(token);
  try {
    const bot = new TelegramBot(token, { polling: false });
    botInstances.set(token, bot);
    return bot;
  } catch (err) {
    throw new Error(`فشل إنشاء البوت: ${err.message}`);
  }
}

async function getMTProtoClient(account) {
  const key = account.id.toString();
  if (userClientInstances.has(key)) return userClientInstances.get(key);

  const apiId = parseInt(account.api_id);
  const apiHash = account.api_hash;
  const stringSession = new StringSession(account.session_string || '');

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false,
  });

  if (account.session_string) {
    await client.connect();
  } else {
    await client.start({
      phoneNumber: account.phone || '',
      password: '',
      phoneCode: '',
      onError: (err) => console.error('MTProto Error:', err),
    });
    const sessionStr = client.session.save();
    db.prepare('UPDATE accounts SET session_string = ?, status = ? WHERE id = ?').run(sessionStr, 'connected', account.id);
    account.session_string = sessionStr;
  }

  db.prepare('UPDATE accounts SET status = ? WHERE id = ?').run('connected', account.id);
  userClientInstances.set(key, client);
  return client;
}

async function verifyBotToken(token) {
  try {
    const bot = getBot(token);
    const me = await bot.getMe();
    return { valid: true, username: me.username, id: me.id, first_name: me.first_name };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

async function verifyChannel(username, botToken) {
  try {
    const bot = getBot(botToken);
    let chat;
    try {
      chat = await bot.getChat(username);
    } catch {
      return { verified: false, step: 1, message: 'القناة غير موجودة' };
    }

    const isChannel = chat.type === 'channel';
    if (!isChannel) {
      return { verified: false, step: 6, message: 'الهدف ليس قناة' };
    }

    let isAdmin = false;
    let canPost = false;
    try {
      const admins = await bot.getChatAdministrators(chat.id);
      const botMember = admins.find(a => a.user.is_bot);
      if (botMember) {
        isAdmin = true;
        canPost = botMember.can_post_messages !== undefined ? botMember.can_post_messages : true;
      }
    } catch {
      isAdmin = false;
    }

    if (!isAdmin) {
      return { verified: false, step: 2, message: 'البوت ليس مشرفاً في القناة' };
    }

    if (!canPost) {
      return { verified: false, step: 3, message: 'لا توجد صلاحيات نشر' };
    }

    const photo = chat.photo ? true : false;
    const members = chat.members_count || 0;
    const type = chat.username ? 'public' : 'private';

    return {
      verified: true,
      data: {
        id: chat.id,
        title: chat.title,
        username: chat.username,
        type,
        members,
        photo,
        invite_link: chat.invite_link || null,
      }
    };
  } catch (err) {
    return { verified: false, step: 0, message: `خطأ: ${err.message}` };
  }
}

async function sendMessage(account, channelId, msgData) {
  const { content, msg_type, file_path, buttons, parse_mode, media_group_id } = msgData;

  if (account.type === 'bot') {
    const bot = getBot(account.token);
    const opts = { parse_mode: parse_mode || 'HTML' };

    if (buttons) {
      try {
        const parsed = typeof buttons === 'string' ? JSON.parse(buttons) : buttons;
        opts.reply_markup = { inline_keyboard: Array.isArray(parsed[0]) ? parsed : [parsed] };
      } catch {}
    }

    try {
      let result;
      switch (msg_type) {
        case 'text':
          result = await bot.sendMessage(channelId, content, opts);
          break;
        case 'photo':
          result = file_path
            ? await bot.sendPhoto(channelId, file_path, { caption: content, ...opts })
            : await bot.sendMessage(channelId, content, opts);
          break;
        case 'video':
          result = file_path
            ? await bot.sendVideo(channelId, file_path, { caption: content, ...opts })
            : await bot.sendMessage(channelId, content, opts);
          break;
        case 'animation':
          result = file_path
            ? await bot.sendAnimation(channelId, file_path, { caption: content, ...opts })
            : await bot.sendMessage(channelId, content, opts);
          break;
        case 'document':
          result = file_path
            ? await bot.sendDocument(channelId, file_path, { caption: content, ...opts })
            : await bot.sendMessage(channelId, content, opts);
          break;
        case 'poll':
          const pollOpts = typeof content === 'string' ? JSON.parse(content) : content;
          result = await bot.sendPoll(channelId, pollOpts.question, pollOpts.options, {
            is_anonymous: pollOpts.is_anonymous !== false,
            type: pollOpts.type || 'regular',
            ...opts
          });
          break;
        default:
          result = await bot.sendMessage(channelId, content, opts);
      }
      return { success: true, message_id: result.message_id, date: result.date };
    } catch (err) {
      return { success: false, error: err.message };
    }
  } else {
    try {
      const client = await getMTProtoClient(account);
      const result = await client.invoke(new Api.messages.SendMessage({
        peer: channelId,
        message: content,
        parseMode: parse_mode === 'Markdown' ? 'markdown' : 'html',
      }));
      return { success: true, message_id: result.updates[0]?.id || 'sent', date: Date.now() / 1000 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

async function sendAlbum(account, channelId, files, caption) {
  if (account.type === 'bot') {
    const bot = getBot(account.token);
    try {
      const media = files.map(f => ({
        type: f.type || 'photo',
        media: f.path || f.url,
        caption: caption || '',
      }));
      media[0].caption = caption || '';
      const result = await bot.sendMediaGroup(channelId, media);
      return { success: true, message_ids: result.map(r => r.message_id) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'User accounts not supported for albums yet' };
}

async function getChatInfo(botToken, chatId) {
  try {
    const bot = getBot(botToken);
    const chat = await bot.getChat(chatId);
    return {
      id: chat.id,
      title: chat.title,
      username: chat.username,
      type: chat.type,
      members: chat.members_count || 0,
      photo: !!chat.photo,
      invite_link: chat.invite_link,
    };
  } catch {
    return null;
  }
}

function disconnectAccount(accountId) {
  const key = accountId.toString();
  if (userClientInstances.has(key)) {
    try { userClientInstances.get(key).disconnect(); } catch {}
    userClientInstances.delete(key);
  }
  db.prepare('UPDATE accounts SET status = ? WHERE id = ?').run('disconnected', accountId);
}

module.exports = {
  verifyBotToken,
  verifyChannel,
  sendMessage,
  sendAlbum,
  getChatInfo,
  getBot,
  getMTProtoClient,
  disconnectAccount,
};
