const TelegramBot = require('node-telegram-bot-api');
const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const botInstances = new Map();
const userClientInstances = new Map();

function getBot(token) {
  if (botInstances.has(token)) return botInstances.get(token);
  const bot = new TelegramBot(token, { polling: false });
  botInstances.set(token, bot);
  return bot;
}

async function getMTProtoClient(account) {
  const key = account.id.toString();
  if (userClientInstances.has(key)) return userClientInstances.get(key);
  const apiId = parseInt(account.api_id);
  const apiHash = account.api_hash;
  const stringSession = new StringSession(account.session_string || '');
  const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5, useWSS: false });
  if (account.session_string) await client.connect();
  else {
    await client.start({ phoneNumber: account.phone || '', password: '', phoneCode: '', onError: (err) => console.error('MTProto Error:', err) });
    account.session_string = client.session.save();
  }
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
    try { chat = await bot.getChat(username); } catch { return { verified: false, step: 1, message: 'القناة غير موجودة' }; }
    if (chat.type !== 'channel') return { verified: false, step: 6, message: 'الهدف ليس قناة' };
    let isAdmin = false, canPost = false;
    try {
      const admins = await bot.getChatAdministrators(chat.id);
      const botMember = admins.find(a => a.user.is_bot);
      if (botMember) { isAdmin = true; canPost = botMember.can_post_messages !== undefined ? botMember.can_post_messages : true; }
    } catch { isAdmin = false; }
    if (!isAdmin) return { verified: false, step: 2, message: 'البوت ليس مشرفاً في القناة' };
    if (!canPost) return { verified: false, step: 3, message: 'لا توجد صلاحيات نشر' };
    return { verified: true, data: { id: chat.id, title: chat.title, username: chat.username, type: chat.username ? 'public' : 'private', members: chat.members_count || 0, photo: !!chat.photo, invite_link: chat.invite_link || null } };
  } catch (err) { return { verified: false, step: 0, message: `خطأ: ${err.message}` }; }
}

async function sendMessage(account, channelId, msgData) {
  const { content, msg_type, file_path, buttons, parse_mode } = msgData;
  if (account.type === 'bot') {
    const bot = getBot(account.token);
    const opts = { parse_mode: parse_mode || 'HTML' };
    if (buttons) { try { opts.reply_markup = { inline_keyboard: typeof buttons === 'string' ? JSON.parse(buttons) : (Array.isArray(buttons[0]) ? buttons : [buttons]) }; } catch {} }
    try {
      let result;
      switch (msg_type) {
        case 'text': result = await bot.sendMessage(channelId, content, opts); break;
        case 'photo': result = file_path ? await bot.sendPhoto(channelId, file_path, { caption: content, ...opts }) : await bot.sendMessage(channelId, content, opts); break;
        case 'video': result = file_path ? await bot.sendVideo(channelId, file_path, { caption: content, ...opts }) : await bot.sendMessage(channelId, content, opts); break;
        case 'animation': result = file_path ? await bot.sendAnimation(channelId, file_path, { caption: content, ...opts }) : await bot.sendMessage(channelId, content, opts); break;
        case 'document': result = file_path ? await bot.sendDocument(channelId, file_path, { caption: content, ...opts }) : await bot.sendMessage(channelId, content, opts); break;
        case 'poll': const p = typeof content === 'string' ? JSON.parse(content) : content; result = await bot.sendPoll(channelId, p.question, p.options, { is_anonymous: p.is_anonymous !== false, type: p.type || 'regular', ...opts }); break;
        default: result = await bot.sendMessage(channelId, content, opts);
      }
      return { success: true, message_id: result.message_id, date: result.date };
    } catch (err) { return { success: false, error: err.message }; }
  } else {
    try {
      const client = await getMTProtoClient(account);
      const result = await client.invoke(new Api.messages.SendMessage({ peer: channelId, message: content, parseMode: parse_mode === 'Markdown' ? 'markdown' : 'html' }));
      return { success: true, message_id: result.updates[0]?.id || 'sent', date: Date.now() / 1000 };
    } catch (err) { return { success: false, error: err.message }; }
  }
}

async function sendAlbum(account, channelId, files, caption) {
  if (account.type === 'bot') {
    const bot = getBot(account.token);
    try {
      const media = files.map(f => ({ type: f.type || 'photo', media: f.path || f.url, caption: '' }));
      media[0].caption = caption || '';
      const result = await bot.sendMediaGroup(channelId, media);
      return { success: true, message_ids: result.map(r => r.message_id) };
    } catch (err) { return { success: false, error: err.message }; }
  }
  return { success: false, error: 'User accounts not supported for albums yet' };
}

function disconnectAccount(accountId) {
  const key = accountId.toString();
  if (userClientInstances.has(key)) { try { userClientInstances.get(key).disconnect(); } catch {} userClientInstances.delete(key); }
}

module.exports = { verifyBotToken, verifyChannel, sendMessage, sendAlbum, getBot, getMTProtoClient, disconnectAccount };
