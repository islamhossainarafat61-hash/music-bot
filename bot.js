/**
 * 🎵 Ultimate Telegram Music Bot (Final V11 - Perfected)
 * Fixes: ReferenceError, Channel Metadata, FSub Delete, Animation Loop, Visualizer
 */

const { Telegraf, Markup } = require('telegraf');
const { message } = require('telegraf/filters');
const play = require('play-dl');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ====================== 1. CONFIGURATION ======================
const CONFIG = {
    botToken: '8372713470:AAGgUXSUf8h2xtxnx4FXK31Dmhk_L_H3slA',
    adminIds: [7249009912],
    backupChannel: '-1003311021802',
    mp4BotUsername: 'Ayat_Earningx_Bot',
    botUsername: '@Music_PesniBot',
    otherBotUsername: '@ATechMusicBot', 
    triggerTag: '@AMusic',
    ownerLink: 'https://t.me/Araf_Tech_Official',
    muzycapLink: 'https://t.me/A_Tech_Music_Bot',
    startVideo: 'BAACAgUAAxkBAAIHnWlOD4SLI9Ht3J7BWEpSI-LkTsZfAAJlGAACU5T5VettdL0FusDwNgQ',
    defaultThumb: 'https://i.imgur.com/8J6qXkH.png'
};

// ====================== 2. DATABASE SYSTEM ======================
const FILES = {
    db: 'database.json',
    users: 'users.json',
    channels: 'channels.json',
    settings: 'settings.json',
    playlists: 'playlists.json'
};

const loadJSON = (file, defaultData) => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    try { return JSON.parse(fs.readFileSync(file)); } catch (e) { return defaultData; }
};
const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Initialize Data
let songDatabase = loadJSON(FILES.db, {});
let usersData = loadJSON(FILES.users, { list: [], daily: {}, history: {}, info: {} });
let fsubChannels = loadJSON(FILES.channels, []);
let appSettings = loadJSON(FILES.settings, { userLangs: {}, customMsg: null, userModes: {} });
let playlists = loadJSON(FILES.playlists, {});

const userSession = {};
const userSearchResults = {};
const userLinkStash = {};

// Initialize Bot Object FIRST to avoid ReferenceError
const bot = new Telegraf(CONFIG.botToken);

console.log('🤖 Araf Tech Music Bot is Online...');

// ====================== 3. HELPER FUNCTIONS ======================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getLang = (id) => appSettings.userLangs[id] || 'en';
const getText = (id, key) => LANGUAGES[getLang(id)][key] || LANGUAGES['en'][key];
const isAdmin = (id) => CONFIG.adminIds.includes(id);
const isUrl = (text) => text && /^(http(s)?:\/\/)?((w){3}.)?youtu(be|.be)?(\.com)?\/.+/gm.test(text) || /instagram|facebook|tiktok/gm.test(text);

function getUserMode(uid) {
    return appSettings.userModes && appSettings.userModes[uid] ? appSettings.userModes[uid] : 'youtube';
}

function makeUserCaption(extraMsg = '') {
    const spacer = '.                          ';
    let cap = `${spacer}⚡ ᴾᵒʷᵉʳᵉᵈ ᵇʸ
<a href="${CONFIG.muzycapLink}">💜 muzycap</a>${spacer}<a href="${CONFIG.ownerLink}">Araf Tech SmartBot</a>`;
    return cap;
}

function makeChannelCaption(title, url, userId, performer = 'Unknown', source = 'YouTube') {
    const platformEmoji = source.toLowerCase() === 'tiktok' ? '🎵 TikTok' : '📺 YouTube';
    return `🎵 <b>Now Playing</b>
━━━━●─────────────── 
⇆ㅤㅤ◁ㅤㅤ❚❚ㅤㅤ▷ㅤㅤㅤ↻
🎶 █▂▆▇▃▁▅▆▇ ▁▃▅

💿 <b>Title:</b> ${title}
🎤 <b>Artist:</b> ${performer}
🌐 <b>Source:</b> ${platformEmoji}
👤 <b>User ID:</b> <code>${userId}</code>
🔗 ${url}

Our Main Bot <a href="${CONFIG.muzycapLink}">💜 muzycap</a>
⚡ Powered by <a href="${CONFIG.ownerLink}">Araf Tech SmartBot</a>`;
}

function animateMessage(ctx, chatId, msgId) {
    const frames = ['⏳', '💿', '💾', '📤']; 
    let i = 0;
    const interval = setInterval(async () => {
        try {
            await ctx.telegram.editMessageText(chatId, msgId, null, frames[i]);
            i = (i + 1) % frames.length;
        } catch (e) {}
    }, 1000); 
    return interval;
}

async function checkForceSubscribe(ctx, userId) {
    const notJoined = [];
    for (const ch of fsubChannels) {
        try {
            const mem = await ctx.telegram.getChatMember(ch.id, userId);
            if (['left', 'kicked', 'restricted'].includes(mem.status)) notJoined.push(ch);
        } catch (e) {}
    }
    if (notJoined.length > 0) {
        const buttons = [];
        let row = [];
        notJoined.forEach(ch => {
            row.push(Markup.button.url(ch.title || 'Please Join Channel First', ch.link));
            if (row.length === 2) { buttons.push(row); row = []; }
        });
        if (row.length > 0) buttons.push(row);
        return { joined: false, buttons: buttons };
    }
    return { joined: true };
}

function trackUser(ctx) {
    if (!ctx.from) return;
    const uid = ctx.from.id;
    if (!usersData.list.includes(uid)) {
        usersData.list.push(uid);
    }
    if(!usersData.info) usersData.info = {};
    if(!usersData.info[uid]) {
        usersData.info[uid] = {
            name: ctx.from.first_name,
            username: ctx.from.username,
            joinDate: new Date().toISOString().split('T')[0],
            downloads: 0
        };
    }
    const today = new Date().toISOString().split('T')[0];
    usersData.daily[today] = (usersData.daily[today] || 0) + 1;
    saveJSON(FILES.users, usersData);
}

function chunk(arr, size) {
    return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
        arr.slice(i * size, i * size + size)
    );
}

// ====================== 4. DATASETS ======================
const LANGUAGES = {
    en: { name: 'English', success: '✅ Language changed.', welcome: "💜 Hello! To find the music, send me:\n\n• Name of the song or artist\n• Lyrics of the song\n• Voice message\n• Video\n• Audio file\n\n🔗 Top Music /top\n\n/lang • Language", search: '🔍 Searching...', not_found: '❌ Not found.', dl: 'Downloading...', sending: 'Sending file...', join_alert: '⚠️ Join channels first!', top_cntry: '🌍 Select Country', top_sngr: '🎤 Select Singer', back: '⬅️ Back', next: 'Next ➡️', country_menu: '↩️ Countries' },
    bn: { name: 'বাংলা', success: '✅ ভাষা পরিবর্তন হয়েছে।', welcome: "💜 হ্যালো! গানের নাম লিখে পাঠান।\n\n🔗 সেরা গান /top\n/lang • ভাষা পরিবর্তন", search: '🔍 খুঁজছি...', not_found: '❌ পাওয়া যায়নি।', dl: 'ডাউনলোড হচ্ছে...', sending: 'ফাইল পাঠানো হচ্ছে...', join_alert: '⚠️ গান শুনতে নিচের চ্যানেলে জয়েন করুন!', top_cntry: '🌍 দেশ নির্বাচন করুন', top_sngr: '🎤 শিল্পী নির্বাচন করুন', back: '⬅️ পেছনে', next: 'পরবর্তী ➡️', country_menu: '↩️ দেশসমূহ' },
    hi: { name: 'हिन्दी', success: '✅ भाषा बदल दी गई है।', welcome: "💜 नमस्ते! संगीत खोजने के लिए नाम भेजें।", search: '🔍 खोज रहे हैं...', not_found: '❌ नहीं मिला।', dl: 'डाउनलोड हो रहा है...', sending: 'भेजा जा रहा है...', join_alert: '⚠️ पहले चैनल से जुड़ें!', top_cntry: '🌍 देश चुनें', top_sngr: '🎤 गायक चुनें', back: '⬅️ पीछे', next: 'अगला ➡️', country_menu: '↩️ देश सूची' },
    ar: { name: 'العربية', success: '✅ تم تغيير اللغة.', welcome: "💜 مرحباً! أرسل اسم الأغنية للبحث عنها.", search: '🔍 جارٍ البحث...', not_found: '❌ لم يتم العثور عليه.', dl: 'جارٍ التحميل...', sending: 'جارٍ الإرسال...', join_alert: '⚠️ انضم إلى القنوات أولاً!', top_cntry: '🌍 اختر الدولة', top_sngr: '🎤 اختر المغني', back: '⬅️ رجوع', next: 'التالي ➡️', country_menu: '↩️ قائمة الدول' },
    es: { name: 'Español', success: '✅ Idioma cambiado.', welcome: "💜 ¡Hola! Envía el nombre de la canción.", search: '🔍 Buscando...', not_found: '❌ No encontrado.', dl: 'Descargando...', sending: 'Enviando...', join_alert: '⚠️ ¡Únete a los canales primero!', top_cntry: '🌍 Seleccionar país', top_sngr: '🎤 Seleccionar cantante', back: '⬅️ Atrás', next: 'Siguiente ➡️', country_menu: '↩️ Países' }
};
['ur', 'ko', 'zh', 'ru'].forEach(l => LANGUAGES[l] = LANGUAGES.en);

const YOUTUBE_DATA = {
    'Bangladesh 🇧🇩': ['James', 'Ayub Bachchu', 'Tahsan', 'Imran', 'Habib Wahid', 'Minar', 'Artcell', 'Warfaze', 'Shironamhin', 'Aurthohin', 'Nemesis', 'Miles', 'Lalon', 'Arnob', 'Bappa Mazumder', 'Topu', 'Kona', 'Nancy', 'Pritom Hasan', 'Asif Akbar', 'Momtaz', 'SI Tutul', 'Hridoy Khan', 'Black', 'Cryptic Fate', 'AvoidRafa', 'Shunno', 'Chirkutt', 'Noble', 'Mahtim Shakib', 'Tanveer Evan', 'Masha Islam', 'Muza', 'Xefer', 'Tasrif Khan', 'Hasan Raahied', 'Ankur Mahamud', 'Belal Khan'],
    'India 🇮🇳': ['Arijit Singh', 'Neha Kakkar', 'Atif Aslam', 'Sonu Nigam', 'Shreya Ghoshal', 'Armaan Malik', 'Badshah', 'Guru Randhawa', 'Jubin Nautiyal', 'Darshan Raval', 'Sid Sriram', 'A.R. Rahman', 'Udit Narayan', 'Kumar Sanu', 'Alka Yagnik', 'Lata Mangeshkar', 'Kishore Kumar', 'Mohammad Rafi', 'Mukesh', 'Honey Singh', 'Sunidhi Chauhan', 'Vishal Dadlani', 'Amit Trivedi', 'Pritam', 'Mithoon', 'Ankit Tiwari', 'Benny Dayal', 'Mohit Chauhan', 'KK', 'Shaan', 'Himesh Reshammiya', 'Sukhwinder Singh', 'B Praak', 'Sidhu Moose Wala', 'Diljit Dosanjh', 'King', 'MC Stan', 'Emiway Bantai', 'Raftaar'],
    'Pakistan 🇵🇰': ['Atif Aslam', 'Rahat Fateh Ali Khan', 'Nusrat Fateh Ali Khan', 'Ali Zafar', 'Momina Mustehsan', 'Sahir Ali Bagga', 'Abida Parveen', 'Asim Azhar', 'Ali Sethi', 'Shafqat Amanat Ali', 'Strings', 'Junoon', 'Vital Signs', 'Sajjad Ali', 'Aima Baig', 'Farhan Saeed', 'Quratulain Balouch', 'Uzair Jaswal', 'Bilal Saeed', 'Young Stunners', 'Kaifi Khalil', 'Abdul Hannan', 'Hasan Raheem', 'Talha Anjum', 'Talhah Yunus', 'Shamoon Ismail', 'Falak Shabir', 'Amjad Sabri', 'Naseebo Lal'],
    'USA 🇺🇸': ['Taylor Swift', 'Justin Bieber', 'Ariana Grande', 'Eminem', 'Drake', 'The Weeknd', 'Ed Sheeran', 'Billie Eilish', 'Bruno Mars', 'Katy Perry', 'Rihanna', 'Beyonce', 'Maroon 5', 'Coldplay', 'Imagine Dragons', 'Post Malone', 'Selena Gomez', 'Shawn Mendes', 'Charlie Puth', 'Dua Lipa', 'Michael Jackson', 'Lady Gaga', 'Adele', 'Sia', 'Halsey', 'Camila Cabello', 'Cardi B', 'Nicki Minaj', 'Travis Scott', 'Kanye West', 'Kendrick Lamar', 'J. Cole', 'Lil Nas X', 'Olivia Rodrigo', 'Doja Cat', 'SZA', 'Miley Cyrus'],
    'UK 🇬🇧': ['Harry Styles', 'Dua Lipa', 'Adele', 'Ed Sheeran', 'Sam Smith', 'Zayn Malik', 'Calvin Harris', 'Anne-Marie', 'Lewis Capaldi', 'Stormzy', 'Rita Ora', 'Ellie Goulding', 'James Arthur', 'Rag\'n\'Bone Man', 'Little Mix', 'One Direction', 'Coldplay', 'Arctic Monkeys', 'Oasis', 'Queen', 'Pink Floyd'],
    'Korea 🇰🇷': ['BTS', 'BLACKPINK', 'TWICE', 'EXO', 'Stray Kids', 'IU', 'PSY', 'Big Bang', 'Red Velvet', 'NCT', 'SEVENTEEN', 'TXT', 'ENHYPEN', 'Aespa', 'ITZY', 'NewJeans', 'IVE', 'LE SSERAFIM', 'Mamamoo', 'Monsta X', 'GOT7', 'SHINee', 'Super Junior', 'Girls Generation', 'Apink', 'StayC', 'NMIXX', 'ATEEZ', 'The Boyz', 'Winner', 'iKON', 'BTOB', 'Day6', 'Taeyeon', 'Zico'],
    'Turkey 🇹🇷': ['Tarkan', 'Hadise', 'Mustafa Ceceli', 'Murat Boz', 'Ece Seçkin', 'İrem Derici', 'Sura İskenderli', 'Buray', 'Simge', 'Aleyna Tilki', 'Serdar Ortaç', 'Emre Aydın', 'Mabel Matiz', 'Sertab Erener', 'Sezen Aksu', 'Koray Avcı'],
    'Arabic 🇸🇦': ['Amr Diab', 'Nancy Ajram', 'Elissa', 'Sherine', 'Tamer Hosny', 'Nassif Zeytoun', 'Majid Al Mohandis', 'Mohamed Ramadan', 'Saad Lamjarred', 'Hamza Namira', 'Hussein Al Jassmi', 'Myriam Fares', 'Rahma Riad', 'Assala Nasri', 'Wael Kfoury']
};

const TIKTOK_DATA = {
    'Recently Viral 🔥': ['TikTok Viral 2025', 'Trending Reels Audio', 'Most Viewed TikTok Song', 'Viral Dance Hits', 'Global Top 50 TikTok', 'Viral Sped Up Songs'],
    'Moods 🎭': ['Sad & Emotional', 'Happy & Energetic', 'Romantic & Love', 'Angry & Gym', 'Chill & Relax', 'Party Remix', 'Broken Heart', 'Motivational'],
    'Categories': ['Sped Up', 'Slowed + Reverb', 'Phonk', 'Sigma Phonk', 'Aesthetic', 'LoFi', 'Bass Boosted', 'Nightcore', '8D Audio', 'Instrumental', 'Piano Cover'],
    'Regions 🌎': ['Tiktok Bangladesh', 'Tiktok India', 'Tiktok USA', 'Tiktok Korea', 'Tiktok Arabic', 'Tiktok Brazil', 'Tiktok Vietnam']
};

bot.use(async (ctx, next) => { trackUser(ctx); await next(); });

// ====================== 5. START & KEYBOARDS ======================
const getMainMenu = (uid) => {
    const mode = getUserMode(uid);
    const modeBtn = mode === 'youtube' ? '🔄 Bot Mode Tiktok' : '🔄 Bot Mode Youtube';
    return Markup.keyboard([
        ['🎶 Top Music', '📂 Playlist'],
        [modeBtn]
    ]).resize();
};

const getPlaylistMenu = () => Markup.keyboard([
    ['➕ Create Playlist', '🗑 Delete Playlist'],
    ['🔙 Back to Main']
]).resize();

const getInsidePlaylistMenu = () => Markup.keyboard([
    ['➕ Add Song', '➖ Remove Song'],
    ['🔙 Back to Playlists']
]).resize();

bot.start(async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length > 1 && args[1].startsWith('dl_')) {
        const vidId = args[1].replace('dl_', '');
        const fsub = await checkForceSubscribe(ctx, ctx.from.id);
        if (!fsub.joined) {
            fsub.buttons.push([Markup.button.url('✅ Try Again', `https://t.me/${CONFIG.botUsername.replace('@', '')}?start=dl_${vidId}`)]);
            return ctx.reply(getText(ctx.from.id, 'join_alert'), Markup.inlineKeyboard(fsub.buttons));
        }
        await handleDirectDownload(ctx, vidId, 'Audio', true);
        return;
    }

    const uid = ctx.from.id;
    if (!appSettings.userLangs[uid]) appSettings.userLangs[uid] = 'en';
    
    try {
        await ctx.replyWithVideo(CONFIG.startVideo, {
            caption: getText(uid, 'welcome'),
            ...getMainMenu(uid)
        });
        await ctx.reply('ㅤ');
    } catch (e) {
        ctx.reply(getText(uid, 'welcome'), getMainMenu(uid));
    }
});

bot.hears('🔄 Bot Mode Tiktok', async (ctx) => {
    const uid = ctx.from.id;
    if(!appSettings.userModes) appSettings.userModes = {};
    appSettings.userModes[uid] = 'tiktok';
    saveJSON(FILES.settings, appSettings);
    await ctx.reply('✅ Switched to TikTok Mode.', getMainMenu(uid));
});

bot.hears('🔄 Bot Mode Youtube', async (ctx) => {
    const uid = ctx.from.id;
    if(!appSettings.userModes) appSettings.userModes = {};
    appSettings.userModes[uid] = 'youtube';
    saveJSON(FILES.settings, appSettings);
    await ctx.reply('✅ Switched to YouTube Mode.', getMainMenu(uid));
});

// ====================== 6. COMMANDS ======================
bot.command('lang', (ctx) => {
    const buttons = [
        [Markup.button.callback('English', 'setlang_en'), Markup.button.callback('বাংলা', 'setlang_bn')],
        [Markup.button.callback('हिन्दी', 'setlang_hi'), Markup.button.callback('اردو', 'setlang_ur')],
        [Markup.button.callback('한국어', 'setlang_ko'), Markup.button.callback('中文', 'setlang_zh')],
        [Markup.button.callback('Русский', 'setlang_ru')]
    ];
    ctx.reply('🏳️ Select Language:', Markup.inlineKeyboard(buttons));
});

bot.action(/setlang_(.+)/, async (ctx) => {
    appSettings.userLangs[ctx.from.id] = ctx.match[1];
    saveJSON(FILES.settings, appSettings);
    await ctx.deleteMessage();
    await ctx.reply(LANGUAGES[ctx.match[1]].success);
});

bot.command('help', (ctx) => {
    const msg = `I can help you find and share music. Simply send me a query or link.`;
    ctx.reply(msg, Markup.inlineKeyboard([
        [Markup.button.url('Go to Support Bot', `https://t.me/${CONFIG.otherBotUsername.replace('@', '')}?start=help`)]
    ]));
});

bot.command('share', async (ctx) => {
    const msg = `🎵 *Share Music*\n\nClick the button below to share music with your friends!`;
    try {
        await ctx.replyWithPhoto({ url: CONFIG.defaultThumb }, {
            caption: msg,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: 'Send music to friends', switch_inline_query: '' }]] }
        });
    } catch (e) {
        await ctx.reply(msg, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: 'Send music to friends', switch_inline_query: '' }]] }
        });
    }
});

bot.command('stats', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const total = usersData.list.length;
    ctx.reply(`📊 <b>Bot Statistics</b>\n\n👥 Total Users: ${total}`, { parse_mode: 'HTML' });
});

bot.command('info', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const targetId = ctx.message.text.split(' ')[1];
    if (!targetId || !usersData.info || !usersData.info[targetId]) return ctx.reply('❌ User not found.');
    const u = usersData.info[targetId];
    ctx.reply(`👤 ID: ${targetId}\nName: ${u.name}\nDownloads: ${u.downloads}`);
});

bot.command('addchannel', (ctx) => {
    if(!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if(args.length < 4) return ctx.reply('Format: /addchannel ID Link Title');
    fsubChannels.push({ id: args[1], link: args[2], title: args.slice(3).join(' ') });
    saveJSON(FILES.channels, fsubChannels);
    ctx.reply('✅ Added');
});

bot.command('delchannel', (ctx) => {
    if(!isAdmin(ctx.from.id)) return;
    fsubChannels = fsubChannels.filter(c => c.id !== ctx.message.text.split(' ')[1]);
    saveJSON(FILES.channels, fsubChannels);
    ctx.reply('🗑 Deleted');
});

bot.command('mychannels', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    let msg = '📢 <b>FSub Channels:</b>\n';
    fsubChannels.forEach((ch, i) => msg += `${i+1}. ${ch.title} (${ch.id})\n`);
    ctx.replyWithHTML(msg || 'No channels.');
});

bot.command('addmessage', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    appSettings.customMsg = ctx.message.text.replace('/addmessage ', '');
    saveJSON(FILES.settings, appSettings);
    ctx.reply('✅ Set');
});

bot.command('removemessage', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    appSettings.customMsg = null;
    saveJSON(FILES.settings, appSettings);
    ctx.reply('🗑 Custom message removed.');
});

bot.command('broadcast', async (ctx) => {
    if(!isAdmin(ctx.from.id) || !ctx.message.reply_to_message) return;
    await ctx.reply('🚀 Sending...');
    for(const uid of usersData.list) {
        try { await ctx.telegram.copyMessage(uid, ctx.chat.id, ctx.message.reply_to_message.message_id); } catch(e){}
        await sleep(30); 
    }
    ctx.reply('✅ Done');
});

// ====================== 7. PLAYLIST SYSTEM ======================
bot.hears('📂 Playlist', async (ctx) => {
    const uid = ctx.from.id;
    if (!playlists[uid]) playlists[uid] = {};
    const plNames = Object.keys(playlists[uid]);
    let msg = '📂 <b>Playlist Menu</b>\n\nYour Playlists:\n';
    if(plNames.length === 0) msg += 'None';
    else plNames.forEach((n, i) => msg += `${i+1}. ${n}\n`);
    
    const plButtons = plNames.map(name => Markup.button.text(`📂 ${name}`));
    const kb = Markup.keyboard([
        ...chunk(plButtons, 2),
        ['➕ Create Playlist', '🗑 Delete Playlist'],
        ['🔙 Back to Main']
    ]).resize();
    
    await ctx.reply(msg, { parse_mode: 'HTML', ...kb });
});

bot.hears('🔙 Back to Main', async (ctx) => {
    delete userSession[ctx.from.id];
    await ctx.reply('🏠 Main Menu', getMainMenu(ctx.from.id));
});

bot.hears('➕ Create Playlist', async (ctx) => {
    userSession[ctx.from.id] = { state: 'awaiting_pl_name', msgs: [] };
    const m = await ctx.reply('✏️ Enter Playlist Name:');
    userSession[ctx.from.id].msgs.push(m.message_id);
});

bot.hears('🗑 Delete Playlist', async (ctx) => {
    userSession[ctx.from.id] = { state: 'awaiting_del_pl' };
    await ctx.reply('✏️ Enter Name to delete:');
});

bot.hears(/^📂 (.+)/, async (ctx) => {
    const plName = ctx.match[1];
    const uid = ctx.from.id;
    if (playlists[uid] && playlists[uid][plName]) {
        userSession[ctx.from.id] = { currentPl: plName };
        await ctx.reply(`📂 Opened: <b>${plName}</b>`, { parse_mode: 'HTML', ...getInsidePlaylistMenu() });
        await showPlaylistSongs(ctx, plName, 0);
    }
});

bot.hears('🔙 Back to Playlists', async (ctx) => {
    await ctx.reply('📂 Playlist Menu', { parse_mode: 'HTML' });
    const uid = ctx.from.id;
    const plNames = Object.keys(playlists[uid] || {});
    const plButtons = plNames.map(name => Markup.button.text(`📂 ${name}`));
    const kb = Markup.keyboard([
        ...chunk(plButtons, 2),
        ['➕ Create Playlist', '🗑 Delete Playlist'],
        ['🔙 Back to Main']
    ]).resize();
    await ctx.reply('Select option:', kb);
});

bot.hears('➕ Add Song', async (ctx) => {
    const uid = ctx.from.id;
    const plName = userSession[uid]?.currentPl;
    if (!plName) return ctx.reply('❌ No playlist selected.');

    const history = usersData.history[uid] || [];
    const currentIds = playlists[uid][plName].map(s => s.id);
    const available = history.filter(s => !currentIds.includes(s.id)).slice(-20).reverse();

    if (available.length === 0) return ctx.reply('⚠️ No new songs in history.');

    const buttons = available.map(s => [Markup.button.callback(`➕ ${s.title.substring(0,20)}`, `add_to_pl_${s.id}`)]);
    buttons.push([Markup.button.callback('🔙 Close List', `close_list`)]);

    await ctx.reply(`Select songs to add to <b>${plName}</b>:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

bot.hears('➖ Remove Song', async (ctx) => {
    const uid = ctx.from.id;
    const plName = userSession[uid]?.currentPl;
    const songs = playlists[uid][plName];
    if(!songs || songs.length === 0) return ctx.reply('⚠️ Playlist empty.');
    const buttons = songs.map((s, i) => [Markup.button.callback(`❌ ${s.title.substring(0,20)}`, `rm_from_pl_${i}`)]);
    buttons.push([Markup.button.callback('🔙 Close List', `close_list`)]);
    await ctx.reply(`Select songs to remove from <b>${plName}</b>:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

bot.action('close_list', async (ctx) => {
    const uid = ctx.from.id;
    const plName = userSession[uid]?.currentPl;
    await ctx.deleteMessage();
    if(plName) await showPlaylistSongs(ctx, plName, 0);
});

bot.action(/add_to_pl_(.+)/, async (ctx) => {
    const vidId = ctx.match[1];
    const uid = ctx.from.id;
    const plName = userSession[uid]?.currentPl;
    if (plName && playlists[uid][plName]) {
        const song = usersData.history[uid].find(s => s.id === vidId);
        if (song) {
            playlists[uid][plName].push(song);
            saveJSON(FILES.playlists, playlists);
            ctx.answerCbQuery('✅ Added!');
        }
    } else { ctx.answerCbQuery('❌ Error.'); }
});

bot.action(/rm_from_pl_(.+)/, async (ctx) => {
    const idx = parseInt(ctx.match[1]);
    const uid = ctx.from.id;
    const plName = userSession[uid]?.currentPl;
    if(playlists[uid][plName]) {
        playlists[uid][plName].splice(idx, 1);
        saveJSON(FILES.playlists, playlists);
        ctx.answerCbQuery('🗑 Removed');
    }
});

async function showPlaylistSongs(ctx, plName, page) {
    const uid = ctx.from.id;
    const songs = playlists[uid][plName];
    if (!songs || songs.length === 0) return ctx.reply('Empty Playlist.');
    const perPage = 10;
    const start = page * perPage;
    const end = start + perPage;
    const pageSongs = songs.slice(start, end);
    let msg = `📂 <b>${plName}</b> (Page ${page+1})\n\n`;
    const buttons = [];
    pageSongs.forEach((s, i) => {
        msg += `${start+i+1}. ${s.title.substring(0,30)}\n`;
        buttons.push([Markup.button.callback(`${start+i+1}`, `pl_play_${s.id}`)]);
    });
    const kb = chunk(buttons.flat(), 5); 
    const nav = [];
    if(page > 0) nav.push(Markup.button.callback('⬅️', `pl_page_${page-1}`));
    if(end < songs.length) nav.push(Markup.button.callback('➡️', `pl_page_${page+1}`));
    if(nav.length > 0) kb.push(nav);
    await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(kb) });
}

bot.action(/pl_page_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const uid = ctx.from.id;
    const plName = userSession[uid]?.currentPl;
    await ctx.deleteMessage();
    if(plName) await showPlaylistSongs(ctx, plName, page);
});

bot.action(/pl_play_(.+)/, async (ctx) => {
    await handleDirectDownload(ctx, ctx.match[1], "Audio", false);
});

// ====================== 8. SEARCH & LINK HANDLER ======================
bot.hears('🎶 Top Music', (ctx) => handleTopMusic(ctx));
bot.command('top', (ctx) => handleTopMusic(ctx));

bot.on([message('text'), message('voice'), message('audio'), message('video')], async (ctx) => {
    const uid = ctx.from.id;
    let query = ctx.message.text;

    if(userSession[uid]?.state === 'awaiting_pl_name') {
        if (query.startsWith('/')) return ctx.reply('❌ Invalid name.');
        if(!playlists[uid]) playlists[uid] = {};
        playlists[uid][query] = [];
        saveJSON(FILES.playlists, playlists);
        try { await ctx.deleteMessage(ctx.message.message_id); userSession[uid].msgs.forEach(mid => ctx.deleteMessage(mid).catch(()=>{})); } catch(e){}
        delete userSession[uid];
        const plButtons = Object.keys(playlists[uid]).map(name => Markup.button.text(`📂 ${name}`));
        const kb = Markup.keyboard([
            ['➕ Create Playlist', '🗑 Delete Playlist'],
            ...chunk(plButtons, 2),
            ['🔙 Back to Main']
        ]).resize();
        await ctx.reply(`✅ Playlist "${query}" created!`, kb);
        return;
    }
    
    if(userSession[uid]?.state === 'awaiting_del_pl') {
        if(playlists[uid][query]) {
            delete playlists[uid][query];
            saveJSON(FILES.playlists, playlists);
            await ctx.reply(`🗑 Deleted "${query}"`);
        } else { await ctx.reply(`❌ Not found.`); }
        delete userSession[uid];
        return;
    }

    if (query && query.startsWith('/')) return;
    if (ctx.chat.type !== 'private') {
        if (query && (query === 'Music' || query.includes(CONFIG.botUsername) || query.includes(CONFIG.triggerTag))) {
            if(query === 'Music') return ctx.reply('🎵 Send song name or link.');
            query = query.replace(CONFIG.botUsername, '').replace(CONFIG.triggerTag, '').trim();
        } else if (!isUrl(query)) return; 
    } else { if (query && query.toLowerCase() === 'music') return ctx.reply('🎵 Send song name.'); }

    if (!query) {
        if (ctx.message.audio) query = `${ctx.message.audio.performer || ''} ${ctx.message.audio.title || ''}`;
        else if (ctx.message.video) query = ctx.message.video.file_name || ctx.message.caption || '';
        else if (ctx.message.voice) query = ctx.message.caption || ''; 
    }

    if (!query) { if(ctx.message.voice) return ctx.reply('🎤 Please add a caption to voice.'); return; }

    if (isUrl(query)) {
        const fsub = await checkForceSubscribe(ctx, uid);
        if (!fsub.joined) return ctx.reply(getText(uid, 'join_alert'), Markup.inlineKeyboard(fsub.buttons));
        const waitMsg = await ctx.reply('🔗 Processing Link...');
        try {
            const p = spawn('yt-dlp', ['--dump-json', '--no-warnings', query]);
            let output = '';
            p.stdout.on('data', (d) => output += d);
            p.on('close', async (c) => {
                try {
                    await ctx.deleteMessage(waitMsg.message_id);
                    const info = JSON.parse(output);
                    const title = info.title || 'Unknown Video';
                    const thumb = info.thumbnail || CONFIG.defaultThumb;
                    const mp4Link = `https://t.me/${CONFIG.mp4BotUsername}?start=${Buffer.from(query).toString('base64')}`;
                    userLinkStash[uid] = query; 
                    await ctx.replyWithPhoto({ url: thumb }, { 
                        caption: `🔗 <b>Link Detected</b>\n\n📄 <b>Title:</b> ${title}\n🔗 <code>${query}</code>`,
                        parse_mode: 'HTML',
                        reply_markup: { inline_keyboard: [[{ text: '🎵 MP3', callback_data: 'link_mp3' }, { text: '🎥 MP4', url: mp4Link }]]}
                    });
                } catch (e) {
                    const mp4Link = `https://t.me/${CONFIG.mp4BotUsername}?start=${Buffer.from(query).toString('base64')}`;
                    userLinkStash[uid] = query;
                    await ctx.replyWithHTML(`🔗 <b>Link Detected</b>\n<code>${query}</code>`, Markup.inlineKeyboard([[{ text: '🎵 MP3', callback_data: 'link_mp3' }, { text: '🎥 MP4', url: mp4Link }]]));
                }
            });
        } catch(e) { try { await ctx.deleteMessage(waitMsg.message_id); } catch(e){} ctx.reply('❌ Invalid Link.'); }
        return;
    }
    await handleSearch(ctx, query);
});

bot.action('link_mp3', async (ctx) => {
    const uid = ctx.from.id;
    const link = userLinkStash[uid]; 
    if(!link) return ctx.answerCbQuery('Expired.');
    await ctx.deleteMessage();
    await handleDirectDownload(ctx, link, 'Audio', false, true); 
});

// ====================== 9. SEARCH LOGIC ======================
async function handleSearch(ctx, query) {
    const uid = ctx.from.id;
    if (ctx.callbackQuery) ctx.answerCbQuery(getText(uid, 'search')).catch(()=>{});
    const waitMsg = await ctx.reply('🔎');
    try {
        const mode = getUserMode(uid);
        const searchQuery = mode === 'tiktok' ? `${query} tiktok` : query;
        const results = await play.search(searchQuery, { limit: 50, source: { youtube: 'video' } });
        if (!results.length) {
            await ctx.deleteMessage(waitMsg.message_id);
            return ctx.reply(getText(uid, 'not_found'));
        }
        userSearchResults[uid] = results;
        await sendResultsList(ctx, 0, waitMsg.message_id);
    } catch (e) { ctx.deleteMessage(waitMsg.message_id).catch(()=>{}); }
}

async function sendResultsList(ctx, page, msgId) {
    const uid = ctx.from.id;
    const results = userSearchResults[uid];
    if (!results) return;
    const start = page * 10;
    const end = start + 10;
    const list = results.slice(start, end);
    let text = `🔍 <b>Results:</b>\n\n`;
    list.forEach((v, i) => text += `${start + i + 1}. ${v.title.substring(0, 40)} (${v.durationRaw})\n`);
    const buttons = [];
    let row = [];
    list.forEach((v, i) => {
        row.push(Markup.button.callback(`${start + i + 1}`, `chk_${start + i}`));
        if (row.length === 5) { buttons.push(row); row = []; }
    });
    if (row.length > 0) buttons.push(row);
    const nav = [];
    if (page > 0) nav.push(Markup.button.callback(getText(uid, 'back'), `srch_${page - 1}`));
    if (end < results.length) nav.push(Markup.button.callback(getText(uid, 'next'), `srch_${page + 1}`));
    const finalKb = buttons.length > 0 ? [...buttons, nav] : [nav];
    try {
        if (msgId) await ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(finalKb) });
        else await ctx.replyWithHTML(text, Markup.inlineKeyboard(finalKb));
    } catch (e) { await ctx.replyWithHTML(text, Markup.inlineKeyboard(finalKb)); }
}

bot.action(/srch_(\d+)/, async (ctx) => {
    await sendResultsList(ctx, parseInt(ctx.match[1]), ctx.callbackQuery.message.message_id);
    ctx.answerCbQuery().catch(()=>{});
});

bot.action(/chk_(\d+)/, async (ctx) => {
    const idx = parseInt(ctx.match[1]);
    const uid = ctx.from.id;
    const fsub = await checkForceSubscribe(ctx, uid);
    if (!fsub.joined) {
        fsub.buttons.push([Markup.button.callback('✅ Check Joined', `chk_${idx}`)]);
        return ctx.reply(getText(uid, 'join_alert'), Markup.inlineKeyboard(fsub.buttons));
    }
    try { await ctx.deleteMessage(); } catch(e){}
    const video = userSearchResults[uid][idx];
    const thumb = (video.thumbnails && video.thumbnails[0]) ? video.thumbnails[0].url : CONFIG.defaultThumb;
    const mode = getUserMode(uid);
    const buttons = [
        [{ text: '🎵 MP3', callback_data: `mp3_${idx}` }, { text: '🎥 MP4', url: `https://t.me/${CONFIG.otherBotUsername.replace('@', '')}?start=help` }],
        [{ text: '📺 Watch', url: video.url }]
    ];
    if(mode === 'tiktok') { buttons.push([{ text: '🎵 Full Song', callback_data: `full_${idx}` }]); }
    try { await ctx.replyWithPhoto({ url: thumb }, { caption: `💿 <b>${video.title}</b>\n\n🔗 <code>${video.url}</code>`, parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }); } catch (e) { await ctx.replyWithHTML(`💿 <b>${video.title}</b>`, Markup.inlineKeyboard(buttons)); }
    ctx.answerCbQuery().catch(()=>{});
});

bot.action(/mp3_(\d+)/, async (ctx) => {
    const idx = parseInt(ctx.match[1]);
    const uid = ctx.from.id;
    await ctx.deleteMessage(); 
    const video = userSearchResults[uid][idx];
    await handleDirectDownload(ctx, video.id, video.title);
});

bot.action(/full_(.+)/, async (ctx) => {
    const idx = parseInt(ctx.match[1]);
    const uid = ctx.from.id;
    await ctx.deleteMessage();
    const video = userSearchResults[uid][idx];
    await ctx.reply(`🔎 Searching full version...`);
    await handleSearch(ctx, video.title.replace('shorts', '').replace('tiktok', ''));
});

// ====================== 10. DOWNLOAD ENGINE ======================
async function handleDirectDownload(ctx, vidId, title = 'Audio', isDeepLink = false, isLink = false) {
    const uid = ctx.from.id;
    const cid = ctx.chat.id;
    if(isDeepLink) {
        const fsub = await checkForceSubscribe(ctx, uid);
        if(!fsub.joined) {
             fsub.buttons.push([Markup.button.url('✅ Try Again', `https://t.me/${CONFIG.botUsername.replace('@', '')}?start=dl_${vidId}`)]);
             return ctx.reply(getText(uid, 'join_alert'), Markup.inlineKeyboard(fsub.buttons));
        } else { try { await ctx.deleteMessage(); } catch(e){} }
    }
    if (isDeepLink && songDatabase[vidId]) {
        const caption = makeUserCaption(appSettings.customMsg || '');
        return await ctx.replyWithAudio(songDatabase[vidId], { caption: caption, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🤖 Join Bot', url: `https://t.me/${CONFIG.botUsername.replace('@', '')}` }], [{ text: '↪️ Forward to Chat', switch_inline_query: '' }]] } });
    }
    let waitMsg;
    try { waitMsg = await ctx.reply('⏳'); } catch(e) { return; }
    if (ctx.callbackQuery) ctx.answerCbQuery('Downloading...').catch(()=>{});
    const anim = animateMessage(ctx, cid, waitMsg.message_id);
    const url = isLink ? vidId : `https://www.youtube.com/watch?v=${vidId}`;
    const dbKey = isLink ? Buffer.from(url).toString('base64').substring(0, 20) : vidId;
    try {
        let realTitle = title;
        if(realTitle === 'Audio' || !realTitle) {
             try {
                 if(url.includes('youtube')) { const info = await play.video_info(url); realTitle = info.video_details.title; }
                 else { const p = spawn('yt-dlp', ['--get-title', url]); p.stdout.on('data', (d) => realTitle = d.toString().trim()); }
             } catch(e) {}
        }
        if (songDatabase[dbKey]) { await sendAudioToUser(ctx, songDatabase[dbKey], false, realTitle); }
        else {
            const file = path.join(__dirname, `${Date.now()}.m4a`);
            await new Promise((resolve, reject) => {
                const p = spawn('yt-dlp', ['-f', 'bestaudio[ext=m4a]', '-o', file, url]);
                p.on('close', c => c === 0 ? resolve() : reject());
            });
            const sent = await sendAudioToUser(ctx, { source: file }, true, realTitle); 
            const fileId = sent.audio.file_id;
            songDatabase[dbKey] = fileId;
            saveJSON(FILES.db, songDatabase);
            if(!Array.isArray(usersData.history[uid])) usersData.history[uid] = [];
            usersData.history[uid].push({ title: realTitle, id: dbKey });
            if(usersData.info[uid]) usersData.info[uid].downloads++;
            saveJSON(FILES.users, usersData);
            try {
                await bot.telegram.sendAudio(CONFIG.backupChannel, { source: file }, { caption: makeChannelCaption(realTitle, url, uid), parse_mode: 'HTML', title: realTitle, performer: 'Music Bot' });
            } catch (e) { console.log('Backup Error'); }
            fs.unlinkSync(file);
        }
        clearInterval(anim);
        try { await ctx.deleteMessage(waitMsg.message_id); } catch(e){}
        if (appSettings.customMsg) { await ctx.reply(appSettings.customMsg); }
        if (ctx.chat.type === 'private') { await ctx.reply('↪️ Share this song:', Markup.inlineKeyboard([[Markup.button.switchInlineQuery('Forward', '')]])); }
        else { await ctx.reply(`🤖 <a href="${CONFIG.ownerLink}">Join our Bot</a>`, { parse_mode: 'HTML', disable_web_page_preview: true }); }
    } catch (e) { clearInterval(anim); try { await ctx.deleteMessage(waitMsg.message_id); } catch(e){} }
}

async function sendAudioToUser(ctx, source, isNew = false, realTitle = '') {
    const caption = makeUserCaption();
    const options = { caption: caption, parse_mode: 'HTML' };
    if (isNew) { options.title = realTitle; options.performer = CONFIG.botUsername; }
    return await ctx.replyWithAudio(source, options);
}

// ====================== 11. TOP MUSIC LOGIC ======================
async function handleTopMusic(ctx) {
    const mode = getUserMode(ctx.from.id);
    const data = mode === 'tiktok' ? { 'TikTok Viral': TIKTOK_DATA['Recently Viral 🔥'], ...TIKTOK_DATA } : YOUTUBE_DATA;
    const countries = Object.keys(data);
    await sendPaginatedList(ctx, countries, 'top_cntry', 0, 'country');
}

async function sendPaginatedList(ctx, data, titleKey, page, type, extra = '') {
    const start = page * 10;
    const end = start + 10;
    const items = data.slice(start, end);
    const buttons = [];
    let row = [];
    items.forEach(item => {
        const cb = type === 'country' ? `cntry_${item}` : `sngr_${item}`;
        row.push(Markup.button.callback(item, cb));
        if (row.length === 2) { buttons.push(row); row = []; }
    });
    if (row.length > 0) buttons.push(row);
    const nav = [];
    if (type === 'singer') {
        if (page === 0) nav.push(Markup.button.callback(getText(ctx.from.id, 'country_menu'), 'back_to_cntry'));
        else nav.push(Markup.button.callback(getText(ctx.from.id, 'back'), `nav_${type}_${page-1}_${extra}`));
    } else { if (page > 0) nav.push(Markup.button.callback(getText(ctx.from.id, 'back'), `nav_${type}_${page-1}`)); }
    if (end < data.length) nav.push(Markup.button.callback(getText(ctx.from.id, 'next'), `nav_${type}_${page+1}_${extra}`));
    buttons.push(nav);
    const text = getText(ctx.from.id, titleKey);
    try { await ctx.editMessageText(text, Markup.inlineKeyboard(buttons)); } 
    catch (e) { await ctx.reply(text, Markup.inlineKeyboard(buttons)); }
}

bot.action(/nav_(.+)_(.+)_(.*)/, async (ctx) => {
    const [type, page, extra] = [ctx.match[1], parseInt(ctx.match[2]), ctx.match[3]];
    const mode = getUserMode(ctx.from.id);
    const data = mode === 'tiktok' ? { 'TikTok Viral': TIKTOK_DATA['Recently Viral 🔥'], ...TIKTOK_DATA } : YOUTUBE_DATA;
    if (type === 'country') await sendPaginatedList(ctx, Object.keys(data), 'top_cntry', page, 'country');
    else await sendPaginatedList(ctx, data[extra] || [], 'top_sngr', page, 'singer', extra);
    ctx.answerCbQuery().catch(()=>{});
});

bot.action('back_to_cntry', (ctx) => handleTopMusic(ctx));
bot.action(/cntry_(.+)/, async (ctx) => {
    const country = ctx.match[1];
    const mode = getUserMode(ctx.from.id);
    const list = (mode === 'tiktok' && country === 'TikTok Viral') ? TIKTOK_DATA['Recently Viral 🔥'] : (mode === 'tiktok' ? TIKTOK_DATA[country] : YOUTUBE_DATA[country]);
    await sendPaginatedList(ctx, list || [], 'top_sngr', 0, 'singer', country);
    ctx.answerCbQuery().catch(()=>{});
});
bot.action(/sngr_(.+)/, async (ctx) => { await ctx.deleteMessage(); await handleSearch(ctx, ctx.match[1]); });

bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    if (!query) return;
    try {
        const results = await play.search(query, { limit: 10, source: { youtube: 'video' } });
        const inlineResults = results.map(v => {
            if (songDatabase[v.id]) { return { type: 'audio', id: v.id, audio_file_id: songDatabase[v.id], caption: makeUserCaption(), parse_mode: 'HTML', title: v.title }; }
            else { return { type: 'article', id: v.id, title: v.title, description: `Tap to Download via Bot`, thumb_url: v.thumbnails[0]?.url, input_message_content: { message_text: `💿 <b>${v.title}</b>`, parse_mode: 'HTML' }, reply_markup: { inline_keyboard: [[{ text: '⬇️ Download via Bot', url: `https://t.me/${CONFIG.botUsername.replace('@', '')}?start=dl_${v.id}` }]] } }; }
        });
        await ctx.answerInlineQuery(inlineResults, { cache_time: 0 });
    } catch (e) {}
});

const http = require('http');
http.createServer((req, res) => res.end('Bot is Running')).listen(process.env.PORT || 10000);


bot.catch((err) => console.log('Error:', err));
bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
