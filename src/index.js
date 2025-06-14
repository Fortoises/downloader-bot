require('dotenv').config();
const { Telegraf } = require('telegraf');
const { setupBot } = require('./bot');
const fs = require('fs-extra');
const path = require('path');

const DOWNLOAD_DIR = path.join(__dirname, '..', 'downloads');
const COOKIES_DIR = path.join(__dirname, '..', 'cookies'); // Mendefinisikan direktori cookies

// Pastikan direktori downloads dan cookies ada saat bot dimulai
fs.ensureDirSync(DOWNLOAD_DIR);
fs.ensureDirSync(COOKIES_DIR);

const bot = new Telegraf(process.env.BOT_TOKEN);

// Meneruskan COOKIES_DIR ke setupBot
setupBot(bot, DOWNLOAD_DIR, COOKIES_DIR);

bot.launch()
  .then(() => console.log('Bot started!'))
  .catch((err) => console.error('Error starting bot:', err));

// Mengatur graceful stop untuk membersihkan sumber daya saat bot dihentikan
process.once('SIGINT', () => {
  console.log('SIGINT received, stopping bot...');
  bot.stop('SIGINT');
  fs.emptyDirSync(DOWNLOAD_DIR); // Bersihkan direktori downloads saat stop
});
process.once('SIGTERM', () => {
  console.log('SIGTERM received, stopping bot...');
  bot.stop('SIGTERM');
  fs.emptyDirSync(DOWNLOAD_DIR); // Bersihkan direktori downloads saat stop
});
