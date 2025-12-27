/**
 * 🎵 Ultimate Telegram Music Bot (Final V14 - Fast & Slim)
 * Fixes: Speed, Link Download, Persistence, Search UI
 */

const { Telegraf, Markup } = require('telegraf');
const { message } = require('telegraf/filters');
const play = require('play-dl');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ====================== 1. CONFIGURATION ======================
const CONFIG = {
    botToken: '8372713470:AAFrB_E6Uwx7oKo-z3BtwEX410k72ypxFxg', 
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

let songDatabase = loadJSON(FILES.db, {});
let usersData = loadJSON(FILES.users, { list: [], daily: {}, history: {}, info: {} });
let fsubChannels = loadJSON(FILES.channels, []);
let appSettings = loadJSON(FILES.settings, { userLangs: {}, customMsg: null, userModes: {} });
let playlists = loadJSON(FILES.playlists, {});

const userSession = {};
const userSearchResults = {};
const userLinkStash = {};

const bot = new Telegraf(CONFIG.botToken);
console.log('🤖 Araf Tech Music Bot is Online...');

// ====================== 3. HELPER FUNCTIONS ======================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getLang = (id) => appSettings.userLangs[id] || 'en';
const getText = (id, key) => LANGUAGES[getLang(id)][key] || LANGUAGES['en'][key];
const isAdmin = (id) => CONFIG.adminIds.includes(id);
const isUrl = (text) => text && /^(http(s)?:\/\/)?((w){3}.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/.test(text);

function getUserMode(uid) {
    return appSettings.userModes && appSettings.userModes[uid] ? appSettings.userModes[uid] : 'youtube';
}

function makeUserCaption() {
    return `.                          ⚡ ᴾᵒʷᵉʳᵉᵈ ᵇʸ
<a href="${CONFIG.muzycapLink}">💜 muzycap</a> . <a href="${CONFIG.ownerLink}">Araf Tech</a>`;
}

function makeChannelCaption(title, url, userId) {
    return `🎵 <b>Now Playing</b>
━━━━●─────────────── 
⇆ㅤㅤ◁ㅤㅤ❚❚ㅤㅤ▷ㅤㅤㅤ↻
🎶 █▂▆▇▃▁▅▆▇ ▁▃▅

💿 <b>${title}</b>
👤 <b>ID:</b> <code>${userId}</code>
🔗 ${url}

🤖 <a href="${CONFIG.muzycapLink}">Bot Link</a>`;
}

function animateMessage(ctx, chatId, msgId) {
    const frames = ['⏳', '⚡', '📥', '📤']; 
    let i = 0;
    const interval = setInterval(async () => {
        try {
            await ctx.telegram.editMessageText(chatId, msgId, null, frames[i]);
            i = (i + 1) % frames.length;
        } catch (e) {}
    }, 1500); // Slower animation to save resources
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
            row.push(Markup.button.url(ch.title || 'Join Channel', ch.link));
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
    if (!usersData.list.includes(uid)) usersData.list.push(uid);
    if(!usersData.info) usersData.info = {};
    if(!usersData.info[uid]) {
        usersData.info[uid] = { name: ctx.from.first_name, username: ctx.from.username, joinDate: new Date().toISOString().split('T')[0], downloads: 0 };
    }
    const today = new Date().toISOString().split('T')[0];
    usersData.daily[today] = (usersData.daily[today] || 0) + 1;
    saveJSON(FILES.users, usersData);
}

function chunk(arr, size) {
    return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
}

// ====================== 4. DATASETS ======================
const LANGUAGES = {
    en: { name: 'English', success: '✅ Language changed.', welcome: "💜 Hello! Send song name or link.\n\n🔗 Top Music /top\n/lang • Language", search: '🔎', not_found: '❌ Not found.', dl: 'Downloading...', join_alert: '⚠️ Join channels first!', top_cntry: '🌍 Country', top_sngr: '🎤 Singer', back: '⬅️', next: '➡️', country_menu: '↩️ Countries' },
    bn: { name: 'বাংলা', success: '✅ ভাষা পরিবর্তন হয়েছে।', welcome: "💜 হ্যালো! গানের নাম বা লিংক দিন।\n\n🔗 সেরা গান /top\n/lang • ভাষা", search: '🔎', not_found: '❌ পাওয়া যায়নি।', dl: 'ডাউনলোড হচ্ছে...', join_alert: '⚠️ চ্যানেলে জয়েন করুন!', top_cntry: '🌍 দেশ', top_sngr: '🎤 শিল্পী', back: '⬅️', next: '➡️', country_menu: '↩️ দেশসমূহ' }
};
['hi', 'ur', 'ko', 'zh', 'ru', 'ar', 'es'].forEach(l => LANGUAGES[l] = LANGUAGES.en);

const YOUTUBE_DATA = {
    'Bangladesh 🇧🇩': ['James', 'Ayub Bachchu', 'Tahsan', 'Imran', 'Minar', 'Artcell', 'Warfaze', 'Shironamhin', 'Aurthohin', 'Nemesis', 'Miles', 'Lalon', 'Arnob', 'Bappa Mazumder', 'Kona', 'Nancy', 'Pritom Hasan', 'Asif Akbar', 'Momtaz', 'SI Tutul', 'Hridoy Khan', 'Black', 'Cryptic Fate', 'AvoidRafa', 'Shunno', 'Chirkutt', 'Noble', 'Mahtim Shakib', 'Tanveer Evan', 'Masha Islam', 'Muza', 'Xefer', 'Tasrif Khan'],
    'India 🇮🇳': ['Arijit Singh', 'Neha Kakkar', 'Atif Aslam', 'Sonu Nigam', 'Shreya Ghoshal', 'Armaan Malik', 'Badshah', 'Guru Randhawa', 'Jubin Nautiyal', 'Darshan Raval', 'Sid Sriram', 'A.R. Rahman', 'Udit Narayan', 'Kumar Sanu', 'Alka Yagnik', 'Lata Mangeshkar', 'Kishore Kumar', 'Mohammad Rafi', 'Honey Singh', 'Sunidhi Chauhan', 'Vishal Dadlani', 'Amit Trivedi', 'Pritam', 'Mithoon', 'KK', 'Shaan', 'Himesh Reshammiya', 'Sukhwinder Singh', 'B Praak', 'Sidhu Moose Wala', 'Diljit Dosanjh', 'King', 'MC Stan'],
    'Pakistan 🇵🇰': ['Atif Aslam', 'Rahat Fateh Ali Khan', 'Nusrat Fateh Ali Khan', 'Ali Zafar', 'Momina Mustehsan', 'Sahir Ali Bagga', 'Abida Parveen', 'Asim Azhar', 'Ali Sethi', 'Shafqat Amanat Ali', 'Strings', 'Junoon', 'Vital Signs', 'Sajjad Ali', 'Aima Baig', 'Farhan Saeed', 'Quratulain Balouch', 'Uzair Jaswal', 'Bilal Saeed', 'Young Stunners', 'Kaifi Khalil', 'Abdul Hannan', 'Hasan Raheem'],
    'USA 🇺🇸': ['Taylor Swift', 'Justin Bieber', 'Ariana Grande', 'Eminem', 'Drake', 'The Weeknd', 'Ed Sheeran', 'Billie Eilish', 'Bruno Mars', 'Katy Perry', 'Rihanna', 'Beyonce', 'Maroon 5', 'Coldplay', 'Imagine Dragons', 'Post Malone', 'Selena Gomez', 'Shawn Mendes', 'Charlie Puth', 'Dua Lipa', 'Michael Jackson', 'Lady Gaga', 'Adele', 'Sia', 'Halsey'],
    'Korea 🇰🇷': ['BTS', 'BLACKPINK', 'TWICE', 'EXO', 'Stray Kids', 'IU', 'PSY', 'Big Bang', 'Red Velvet', 'NCT', 'SEVENTEEN', 'TXT', 'ENHYPEN', 'Aespa', 'ITZY', 'NewJeans', 'IVE', 'LE SSERAFIM', 'Mamamoo', 'Monsta X', 'GOT7', 'SHINee'],
    'Arabic 🇸🇦': ['Amr Diab', 'Nancy Ajram', 'Elissa', 'Sherine', 'Tamer Hosny', 'Nassif Zeytoun', 'Majid Al Mohandis', 'Mohamed Ramadan', 'Saad Lamjarred', 'Hamza Namira', 'Hussein Al Jassmi']
};

const TIKTOK_DATA = {
    'Viral 🔥': ['TikTok Viral 2025', 'Trending Reels', 'Viral Dance Hits', 'Global Top 50'],
    'Moods 🎭': ['Sad', 'Happy', 'Romantic', 'Gym Phonk', 'Chill', 'Broken Heart'],
    'Categories': ['Sped Up', 'Slowed + Reverb', 'Phonk', 'Sigma', 'Aesthetic', 'LoFi', 'Bass Boosted', 'Nightcore']
};

bot.use(async (ctx, next) => { trackUser(ctx); await next(); });

// ====================== 5. KEYBOARDS & START ======================
const getMainMenu = (uid) => {
    const mode = getUserMode(uid) === 'youtube' ? '🔄 Tiktok Mode' : '🔄 Youtube Mode';
    return Markup.keyboard([['🎶 Top Music', '📂 Playlist'], [mode]]).resize();
};

const getPlaylistMenu = () => Markup.keyboard([['➕ Create', '🗑 Delete'], ['🔙 Main']]).resize();
const getInsidePlaylistMenu = () => Markup.keyboard([['➕ Add', '➖ Remove'], ['🔙 Playlists']]).resize();

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
        await ctx.replyWithVideo(CONFIG.startVideo, { caption: getText(uid, 'welcome'), ...getMainMenu(uid) });
    } catch (e) { ctx.reply(getText(uid, 'welcome'), getMainMenu(uid)); }
});

bot.hears('🔄 Tiktok Mode', async (ctx) => {
    appSettings.userModes[ctx.from.id] = 'tiktok'; saveJSON(FILES.settings, appSettings);
    await ctx.reply('✅ Tiktok Mode On', getMainMenu(ctx.from.id));
});
bot.hears('🔄 Youtube Mode', async (ctx) => {
    appSettings.userModes[ctx.from.id] = 'youtube'; saveJSON(FILES.settings, appSettings);
    await ctx.reply('✅ YouTube Mode On', getMainMenu(ctx.from.id));
});

// ====================== 6. COMMANDS & ADMIN ======================
bot.command('lang', (ctx) => {
    ctx.reply('🏳️ Language:', Markup.inlineKeyboard([
        [Markup.button.callback('English', 'setlang_en'), Markup.button.callback('বাংলা', 'setlang_bn')]
    ]));
});
bot.action(/setlang_(.+)/, async (ctx) => {
    appSettings.userLangs[ctx.from.id] = ctx.match[1]; saveJSON(FILES.settings, appSettings);
    await ctx.deleteMessage(); await ctx.reply(LANGUAGES[ctx.match[1]].success);
});

bot.command('stats', (ctx) => { if (isAdmin(ctx.from.id)) ctx.reply(`📊 Users: ${usersData.list.length}`); });
bot.command('broadcast', async (ctx) => {
    if(!isAdmin(ctx.from.id) || !ctx.message.reply_to_message) return;
    await ctx.reply('🚀 Sending...');
    for(const uid of usersData.list) { try { await ctx.telegram.copyMessage(uid, ctx.chat.id, ctx.message.reply_to_message.message_id); } catch(e){} await sleep(30); }
    ctx.reply('✅ Done');
});

// ====================== 7. PLAYLIST ======================
bot.hears('📂 Playlist', async (ctx) => {
    const uid = ctx.from.id; if (!playlists[uid]) playlists[uid] = {};
    const plButtons = Object.keys(playlists[uid]).map(name => Markup.button.text(`📂 ${name}`));
    await ctx.reply('📂 Playlists:', { ...Markup.keyboard([...chunk(plButtons, 2), ['➕ Create', '🗑 Delete'], ['🔙 Main']]).resize() });
});
bot.hears('🔙 Main', (ctx) => { delete userSession[ctx.from.id]; ctx.reply('🏠 Main Menu', getMainMenu(ctx.from.id)); });
bot.hears('➕ Create', (ctx) => { userSession[ctx.from.id] = { state: 'pl_name' }; ctx.reply('✏️ Name:'); });
bot.hears('🗑 Delete', (ctx) => { userSession[ctx.from.id] = { state: 'del_pl' }; ctx.reply('✏️ Name to delete:'); });
bot.hears(/^📂 (.+)/, async (ctx) => {
    const plName = ctx.match[1]; const uid = ctx.from.id;
    if (playlists[uid] && playlists[uid][plName]) {
        userSession[ctx.from.id] = { currentPl: plName };
        await ctx.reply(`📂 ${plName}`, getInsidePlaylistMenu());
        await showPlaylistSongs(ctx, plName, 0);
    }
});
bot.hears('🔙 Playlists', async (ctx) => {
    const uid = ctx.from.id; const plButtons = Object.keys(playlists[uid] || {}).map(name => Markup.button.text(`📂 ${name}`));
    await ctx.reply('📂 Menu', Markup.keyboard([...chunk(plButtons, 2), ['➕ Create', '🗑 Delete'], ['🔙 Main']]).resize());
});
bot.hears('➕ Add', async (ctx) => {
    const uid = ctx.from.id; const plName = userSession[uid]?.currentPl; if (!plName) return;
    const history = (usersData.history[uid] || []).slice(-15).reverse();
    if (history.length === 0) return ctx.reply('⚠️ No history.');
    const btns = history.map(s => [Markup.button.callback(`➕ ${s.title.substring(0,15)}`, `addpl_${s.id}`)]);
    btns.push([Markup.button.callback('🔙 Close', `close_list`)]);
    await ctx.reply(`Add to ${plName}:`, Markup.inlineKeyboard(btns));
});
bot.action(/addpl_(.+)/, async (ctx) => {
    const vidId = ctx.match[1]; const uid = ctx.from.id; const plName = userSession[uid]?.currentPl;
    if (plName && playlists[uid][plName]) {
        const song = usersData.history[uid].find(s => s.id === vidId);
        if (song) { playlists[uid][plName].push(song); saveJSON(FILES.playlists, playlists); ctx.answerCbQuery('✅ Added!'); }
    }
});
async function showPlaylistSongs(ctx, plName, page) {
    const uid = ctx.from.id; const songs = playlists[uid][plName]; if (!songs || !songs.length) return ctx.reply('Empty.');
    const start = page * 10; const pageSongs = songs.slice(start, start + 10);
    let msg = `📂 <b>${plName}</b>\n`;
    const btns = pageSongs.map((s, i) => Markup.button.callback(`${start+i+1}`, `plplay_${s.id}`));
    const kb = chunk(btns, 5); 
    const nav = []; if(page>0) nav.push(Markup.button.callback('⬅️', `plpg_${page-1}`)); if(start+10<songs.length) nav.push(Markup.button.callback('➡️', `plpg_${page+1}`)); if(nav.length) kb.push(nav);
    pageSongs.forEach((s, i) => msg += `${start+i+1}. ${s.title.substring(0,25)}\n`);
    await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(kb) });
}
bot.action(/plpg_(\d+)/, async (ctx) => { ctx.deleteMessage(); showPlaylistSongs(ctx, userSession[ctx.from.id]?.currentPl, parseInt(ctx.match[1])); });
bot.action(/plplay_(.+)/, (ctx) => handleDirectDownload(ctx, ctx.match[1], "Audio", false));

// ====================== 8. SEARCH & LINKS ======================
bot.hears(['🎶 Top Music', '/top'], (ctx) => handleTopMusic(ctx));

bot.on('text', async (ctx) => {
    const uid = ctx.from.id; const txt = ctx.message.text;
    if(userSession[uid]?.state === 'pl_name') {
        if(!playlists[uid]) playlists[uid] = {}; playlists[uid][txt] = []; saveJSON(FILES.playlists, playlists);
        delete userSession[uid]; return ctx.reply('✅ Created', getPlaylistMenu());
    }
    if (txt.startsWith('/')) return;
    
    // Link Handler (Slim & Fast)
    if (isUrl(txt)) {
        const fsub = await checkForceSubscribe(ctx, uid);
        if (!fsub.joined) return ctx.reply(getText(uid, 'join_alert'), Markup.inlineKeyboard(fsub.buttons));
        
        const waitMsg = await ctx.reply('🔎');
        try {
            // Check metadata FAST
            const p = spawn('python3', ['-m', 'yt_dlp', '-j', '--no-warnings', '--user-agent', 'Mozilla/5.0', txt]);
            let output = ''; p.stdout.on('data', d => output += d);
            p.on('close', async () => {
                try {
                    await ctx.deleteMessage(waitMsg.message_id);
                    const info = JSON.parse(output);
                    userLinkStash[uid] = txt;
                    await ctx.replyWithPhoto({ url: info.thumbnail || CONFIG.defaultThumb }, {
                        caption: `🔗 <b>Detected</b>\n\n📄 ${info.title || 'Video'}\n🔗 <code>${txt}</code>`,
                        parse_mode: 'HTML',
                        reply_markup: { inline_keyboard: [[{ text: '🎵 MP3', callback_data: 'link_mp3' }, { text: '🎥 MP4', callback_data: 'link_mp4' }]] }
                    });
                } catch (e) {
                    userLinkStash[uid] = txt;
                    ctx.reply('🔗 Link Ready', Markup.inlineKeyboard([[{ text: '🎵 MP3', callback_data: 'link_mp3' }, { text: '🎥 MP4', callback_data: 'link_mp4' }]]));
                }
            });
        } catch(e) { ctx.deleteMessage(waitMsg.message_id); }
        return;
    }
    await handleSearch(ctx, txt);
});

bot.action('link_mp3', (ctx) => { ctx.deleteMessage(); handleDirectDownload(ctx, userLinkStash[ctx.from.id], 'Audio', false, true, 'Audio'); });
bot.action('link_mp4', (ctx) => { ctx.deleteMessage(); handleDirectDownload(ctx, userLinkStash[ctx.from.id], 'Video', false, true, 'Video'); });

// ====================== 9. SEARCH ENGINE ======================
async function handleSearch(ctx, query) {
    const uid = ctx.from.id;
    const waitMsg = await ctx.reply('🔎');
    try {
        const mode = getUserMode(uid) === 'tiktok' ? `${query} tiktok` : query;
        const results = await play.search(mode, { limit: 20, source: { youtube: 'video' } });
        if (!results.length) { await ctx.deleteMessage(waitMsg.message_id); return ctx.reply(getText(uid, 'not_found')); }
        userSearchResults[uid] = results;
        await sendResultsList(ctx, 0, waitMsg.message_id);
    } catch (e) { try{ctx.deleteMessage(waitMsg.message_id)}catch(ex){} }
}

async function sendResultsList(ctx, page, msgId) {
    const uid = ctx.from.id; const results = userSearchResults[uid]; if (!results) return;
    const start = page * 10; const list = results.slice(start, start + 10);
    let text = `🔎 <b>Results</b>\n\n`;
    const btns = []; let row = [];
    list.forEach((v, i) => {
        text += `${start+i+1}. ${v.title.substring(0, 35)}\n`;
        row.push(Markup.button.callback(`${start+i+1}`, `chk_${start+i}`));
        if (row.length === 5) { btns.push(row); row = []; }
    });
    if (row.length) btns.push(row);
    const nav = [];
    if (page > 0) nav.push(Markup.button.callback('⬅️', `srch_${page - 1}`));
    if (start + 10 < results.length) nav.push(Markup.button.callback('➡️', `srch_${page + 1}`));
    if (nav.length) btns.push(nav);

    try {
        if (msgId) await ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(btns) });
        else await ctx.replyWithHTML(text, Markup.inlineKeyboard(btns));
    } catch (e) { await ctx.replyWithHTML(text, Markup.inlineKeyboard(btns)); }
}

bot.action(/srch_(\d+)/, (ctx) => sendResultsList(ctx, parseInt(ctx.match[1]), ctx.callbackQuery.message.message_id));

// FIXED: Removed ctx.deleteMessage() so list stays
bot.action(/chk_(\d+)/, async (ctx) => {
    const idx = parseInt(ctx.match[1]); const uid = ctx.from.id;
    const fsub = await checkForceSubscribe(ctx, uid);
    if (!fsub.joined) return ctx.reply(getText(uid, 'join_alert'), Markup.inlineKeyboard(fsub.buttons));
    
    const v = userSearchResults[uid][idx];
    const thumb = v.thumbnails[0]?.url || CONFIG.defaultThumb;
    
    try {
        await ctx.replyWithPhoto({ url: thumb }, {
            caption: `💿 <b>${v.title}</b>\n🔗 <code>${v.url}</code>`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🎵 MP3', callback_data: `mp3_${idx}` }, { text: '🎥 MP4', callback_data: `mp4_${idx}` }]] }
        });
    } catch (e) {
        await ctx.replyWithHTML(`💿 <b>${v.title}</b>`, Markup.inlineKeyboard([[{ text: '🎵 MP3', callback_data: `mp3_${idx}` }, { text: '🎥 MP4', callback_data: `mp4_${idx}` }]]));
    }
    ctx.answerCbQuery();
});

bot.action(/mp3_(\d+)/, (ctx) => { ctx.deleteMessage(); handleDirectDownload(ctx, userSearchResults[ctx.from.id][parseInt(ctx.match[1])].id, userSearchResults[ctx.from.id][parseInt(ctx.match[1])].title, false, false, 'Audio'); });
bot.action(/mp4_(\d+)/, (ctx) => { ctx.deleteMessage(); handleDirectDownload(ctx, userSearchResults[ctx.from.id][parseInt(ctx.match[1])].id, userSearchResults[ctx.from.id][parseInt(ctx.match[1])].title, false, false, 'Video'); });

// ====================== 10. DOWNLOAD ENGINE (OPTIMIZED) ======================
async function handleDirectDownload(ctx, vidId, title = 'Audio', isDeepLink = false, isLink = false, type = 'Audio') {
    const uid = ctx.from.id; const cid = ctx.chat.id;
    if(isDeepLink) {
        const fsub = await checkForceSubscribe(ctx, uid);
        if(!fsub.joined) {
             fsub.buttons.push([Markup.button.url('✅ Try Again', `https://t.me/${CONFIG.botUsername.replace('@', '')}?start=dl_${vidId}`)]);
             return ctx.reply(getText(uid, 'join_alert'), Markup.inlineKeyboard(fsub.buttons));
        } else { try { await ctx.deleteMessage(); } catch(e){} }
    }
    
    const dbKey = isLink ? Buffer.from(vidId).toString('base64').substring(0, 20) : vidId;
    const cached = songDatabase[`${type}_${dbKey}`];
    if (isDeepLink && cached) {
        try { return await sendMedia(ctx, cached, false, title, type); } catch(e) { delete songDatabase[`${type}_${dbKey}`]; }
    }

    let waitMsg; try { waitMsg = await ctx.reply('⏳'); } catch(e) { return; }
    if (ctx.callbackQuery) ctx.answerCbQuery('Downloading...').catch(()=>{});
    const anim = animateMessage(ctx, cid, waitMsg.message_id);
    const url = isLink ? vidId : `https://www.youtube.com/watch?v=${vidId}`;

    try {
        // Fast Metadata fetch
        let realTitle = title;
        if(title === 'Audio' || !title) {
             try {
                 const p = spawn('python3', ['-m', 'yt_dlp', '--get-title', '--no-warnings', url]);
                 p.stdout.on('data', d => realTitle = d.toString().trim());
             } catch(e) {}
        }

        const ext = type === 'Audio' ? 'm4a' : 'mp4';
        // Optimized Format Strings for Speed & Size
        const fmt = type === 'Audio' 
            ? 'bestaudio[ext=m4a][filesize<50M]/bestaudio[filesize<50M]/best[ext=m4a]' 
            : 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]';
        
        const file = path.join(__dirname, `${Date.now()}.${ext}`);
        
        await new Promise((resolve, reject) => {
            const p = spawn('python3', [
                '-m', 'yt_dlp', 
                '-f', fmt, 
                '--no-check-certificate', 
                '--no-playlist', 
                '--geo-bypass',        
                '--no-warnings',
                '--quiet',             
                '--force-ipv4',
                '--concurrent-fragments', '4', // SPEED BOOST
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                '-o', file, 
                url
            ]);
            p.on('close', c => c === 0 ? resolve() : reject(new Error('Exited: ' + c)));
            p.on('error', e => reject(e));
        });

        const stats = fs.statSync(file);
        if (stats.size > 49.5 * 1024 * 1024) throw new Error('TOO_LARGE');

        const sent = await sendMedia(ctx, { source: file }, true, realTitle, type);
        const fid = type === 'Audio' ? sent.audio.file_id : sent.video.file_id;
        
        songDatabase[`${type}_${dbKey}`] = fid; saveJSON(FILES.db, songDatabase);
        
        if(type === 'Audio') {
            if(!usersData.history[uid]) usersData.history[uid] = [];
            usersData.history[uid].push({ title: realTitle, id: dbKey });
        }
        if(usersData.info[uid]) usersData.info[uid].downloads++;
        saveJSON(FILES.users, usersData);

        try {
            const opts = { caption: makeChannelCaption(realTitle, url, uid), parse_mode: 'HTML', title: realTitle };
            if(type === 'Audio') await bot.telegram.sendAudio(CONFIG.backupChannel, { source: file }, opts);
            else await bot.telegram.sendVideo(CONFIG.backupChannel, { source: file }, opts);
        } catch (e) {}

        fs.unlinkSync(file);
        clearInterval(anim); try { await ctx.deleteMessage(waitMsg.message_id); } catch(e){}
        if (appSettings.customMsg) await ctx.reply(appSettings.customMsg);
        
    } catch (e) {
        clearInterval(anim); try { await ctx.deleteMessage(waitMsg.message_id); } catch(e){}
        if (e.message.includes('TOO_LARGE')) ctx.reply('❌ File > 50MB.');
        else ctx.reply(getText(uid, 'not_found'));
        try { if(fs.existsSync(file)) fs.unlinkSync(file); } catch(err){}
    }
}

async function sendMedia(ctx, src, isNew, title, type) {
    const opts = { caption: makeUserCaption(), parse_mode: 'HTML' };
    if (isNew) { opts.title = title; opts.performer = CONFIG.botUsername; }
    if(type === 'Audio') return await ctx.replyWithAudio(src, opts);
    else return await ctx.replyWithVideo(src, { ...opts, supports_streaming: true });
}

// ====================== 11. TOP MUSIC ======================
async function handleTopMusic(ctx) {
    const data = getUserMode(ctx.from.id) === 'tiktok' ? { ...TIKTOK_DATA } : YOUTUBE_DATA;
    await sendPaginatedList(ctx, Object.keys(data), 'top_cntry', 0, 'country');
}
async function sendPaginatedList(ctx, items, titleKey, page, type, extra = '') {
    const start = page * 10; const list = items.slice(start, start + 10);
    const btns = []; let row = [];
    list.forEach(i => {
        row.push(Markup.button.callback(i, type === 'country' ? `cntry_${i}` : `sngr_${i}`));
        if (row.length === 2) { btns.push(row); row = []; }
    });
    if (row.length) btns.push(row);
    const nav = [];
    if(type === 'singer') {
        if(page===0) nav.push(Markup.button.callback(getText(ctx.from.id, 'country_menu'), 'back_to_cntry'));
        else nav.push(Markup.button.callback('⬅️', `nav_${type}_${page-1}_${extra}`));
    } else { if(page>0) nav.push(Markup.button.callback('⬅️', `nav_${type}_${page-1}`)); }
    if(start+10<items.length) nav.push(Markup.button.callback('➡️', `nav_${type}_${page+1}_${extra}`));
    btns.push(nav);
    
    try { await ctx.editMessageText(getText(ctx.from.id, titleKey), Markup.inlineKeyboard(btns)); } 
    catch (e) { await ctx.reply(getText(ctx.from.id, titleKey), Markup.inlineKeyboard(btns)); }
}
bot.action(/nav_(.+)_(.+)_(.*)/, (ctx) => {
    const [t, p, e] = [ctx.match[1], parseInt(ctx.match[2]), ctx.match[3]];
    const d = getUserMode(ctx.from.id) === 'tiktok' ? { ...TIKTOK_DATA } : YOUTUBE_DATA;
    sendPaginatedList(ctx, t === 'country' ? Object.keys(d) : d[e], t === 'country' ? 'top_cntry' : 'top_sngr', p, t, e);
    ctx.answerCbQuery();
});
bot.action('back_to_cntry', (ctx) => handleTopMusic(ctx));
bot.action(/cntry_(.+)/, (ctx) => {
    const c = ctx.match[1]; const d = getUserMode(ctx.from.id) === 'tiktok' ? TIKTOK_DATA : YOUTUBE_DATA;
    sendPaginatedList(ctx, d[c] || [], 'top_sngr', 0, 'singer', c); ctx.answerCbQuery();
});
bot.action(/sngr_(.+)/, (ctx) => { ctx.deleteMessage(); handleSearch(ctx, ctx.match[1]); });

// ====================== SERVER & START ======================
const http = require('http');
http.createServer((req, res) => { res.writeHead(200); res.end('Bot Running'); }).listen(process.env.PORT || 10000);

bot.catch((e) => console.log('Error:', e));
const startBot = () => {
    bot.launch().then(() => console.log('🚀 Launched!')).catch(e => {
        console.error('❌ Error:', e.message); setTimeout(() => startBot(), 10000);
    });
};
startBot();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
