const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

let client = null;
let clientReady = false;

const SESSION_FILE = path.join(__dirname, '../data/osint_session.json');

function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    }
  } catch {}
  return null;
}

function saveSession(sessionStr, phone) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ session: sessionStr, phone, updated: new Date().toISOString() }));
}

async function getClient() {
  if (clientReady && client) return client;

  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID و TELEGRAM_API_HASH مطلوبان في ملف .env');
  }

  const saved = loadSession();
  const stringSession = new StringSession(saved?.session || '');

  client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false,
    deviceModel: 'Abyss Control X',
    systemVersion: '1.0.0',
    appVersion: '1.0.0',
  });

  if (saved?.session) {
    await client.connect();
    if (await client.isUserAuthorized()) {
      clientReady = true;
      return client;
    }
  }

  const phone = process.env.OSINT_PHONE;
  if (!phone) {
    throw new Error('ضع رقم هاتفك في OSINT_PHONE داخل .env لتسجيل الدخول أول مرة');
  }

  await client.start({
    phoneNumber: phone,
    phoneCode: async () => {
      console.log(`📱 تم إرسال كود التفعيل إلى ${phone}. أدخله في OSINT_CODE داخل .env`);
      return process.env.OSINT_CODE || '00000';
    },
    password: async () => process.env.OSINT_PASSWORD || '',
    onError: (err) => console.error('❌ MTProto Error:', err),
  });

  const sessionStr = client.session.save();
  saveSession(sessionStr, phone);
  clientReady = true;
  return client;
}

async function checkPhone(phoneNumber) {
  try {
    const c = await getClient();
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;

    const result = await c.invoke(new Api.auth.CheckPhone({
      phoneNumber: cleanPhone,
    }));

    return {
      registered: result.phoneRegistered,
      phone: cleanPhone,
      invited: result.phoneInvited || false,
    };
  } catch (err) {
    return { registered: false, phone: phoneNumber, error: err.message };
  }
}

async function resolvePhone(phoneNumber) {
  try {
    const c = await getClient();
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;

    const phoneResult = await c.invoke(new Api.contacts.ResolvePhone({
      phone: cleanPhone,
    }));

    if (!phoneResult?.users?.length) {
      return { found: false, message: 'لا يوجد حساب تيليجرام مرتبط بهذا الرقم' };
    }

    const user = phoneResult.users[0];
    const result = {
      found: true,
      id: user.id?.toString(),
      phone: cleanPhone,
      username: user.username || null,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      scam: user.scam || false,
      fake: user.fake || false,
      bot: user.bot || false,
      verified: user.verified || false,
      restricted: user.restricted || false,
      accessHash: user.accessHash?.toString() || null,
      photo: null,
      bio: null,
      lastSeen: null,
      commonChats: 0,
    };

    try {
      const fullUser = await c.invoke(new Api.users.GetFullUser({
        id: user.id,
      }));
      if (fullUser?.fullUser) {
        result.bio = fullUser.fullUser.about || null;
        result.commonChats = fullUser.fullUser.commonChatsCount || 0;

        if (fullUser.fullUser.profilePhoto) {
          const photo = fullUser.fullUser.profilePhoto;
          result.photo = {
            id: photo.id?.toString(),
            hasVideo: photo.hasVideo || false,
            dcId: photo.dcId,
          };
        }
      }
    } catch {}

    try {
      if (user.username) {
        const userFull = await c.invoke(new Api.users.GetFullUser({
          id: await c.getInputEntity(user.username),
        }));
        if (userFull?.fullUser?.about) result.bio = userFull.fullUser.about;
      }
    } catch {}

    try {
      const status = user.status;
      if (status) {
        const className = status.className;
        if (className === 'UserStatusOnline') result.lastSeen = 'متصل الآن';
        else if (className === 'UserStatusOffline') {
          const date = new Date((status.wasOnline || 0) * 1000);
          result.lastSeen = `آخر ظهور: ${date.toLocaleDateString('ar')} ${date.toLocaleTimeString('ar')}`;
        } else if (className === 'UserStatusRecently') result.lastSeen = 'آخر ظهور: recently';
        else if (className === 'UserStatusLastWeek') result.lastSeen = 'آخر ظهور: هذا الأسبوع';
        else if (className === 'UserStatusLastMonth') result.lastSeen = 'آخر ظهور: هذا الشهر';
      }
    } catch {}

    return result;
  } catch (err) {
    if (err.errorMessage === 'PHONE_NOT_OCCUPIED') {
      return { found: false, message: 'لا يوجد حساب تيليجرام مرتبط بهذا الرقم' };
    }
    return { found: false, error: err.errorMessage || err.message, phone: phoneNumber };
  }
}

async function getByUsername(username) {
  try {
    const c = await getClient();
    let cleanUser = username.replace('@', '');

    const result = await c.invoke(new Api.contacts.ResolveUsername({
      username: cleanUser,
    }));

    if (!result?.users?.length) {
      return { found: false, message: 'المستخدم غير موجود' };
    }

    const user = result.users[0];
    const data = {
      found: true,
      id: user.id?.toString(),
      username: user.username || cleanUser,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      scam: user.scam || false,
      fake: user.fake || false,
      bot: user.bot || false,
      verified: user.verified || false,
      restricted: user.restricted || false,
      photo: null,
      bio: null,
      lastSeen: null,
    };

    try {
      const full = await c.invoke(new Api.users.GetFullUser({ id: user.id }));
      if (full?.fullUser) {
        data.bio = full.fullUser.about || null;
        if (full.fullUser.profilePhoto) {
          data.photo = { id: full.fullUser.profilePhoto.id?.toString(), hasVideo: full.fullUser.profilePhoto.hasVideo || false, dcId: full.fullUser.profilePhoto.dcId };
        }
      }
    } catch {}

    try {
      const status = user.status;
      if (status) {
        const cn = status.className;
        if (cn === 'UserStatusOnline') data.lastSeen = '🟢 متصل الآن';
        else if (cn === 'UserStatusOffline') data.lastSeen = `⚫ آخر ظهور: ${new Date((status.wasOnline || 0) * 1000).toLocaleString('ar')}`;
        else if (cn === 'UserStatusRecently') data.lastSeen = '🟡 آخر ظهور: recently';
        else if (cn === 'UserStatusLastWeek') data.lastSeen = '🟡 آخر ظهور: هذا الأسبوع';
        else if (cn === 'UserStatusLastMonth') data.lastSeen = '🟡 آخر ظهور: هذا الشهر';
      }
    } catch {}

    return data;
  } catch (err) {
    if (err.errorMessage === 'USERNAME_NOT_OCCUPIED') return { found: false, message: 'المستخدم غير موجود' };
    return { found: false, error: err.errorMessage || err.message };
  }
}

async function getProfilePhoto(userId, accessHash) {
  try {
    const c = await getClient();
    const photo = await c.downloadProfilePhoto(userId, { isBig: true });
    return photo;
  } catch {
    return null;
  }
}

module.exports = { checkPhone, resolvePhone, getByUsername, getClient, getProfilePhoto };
