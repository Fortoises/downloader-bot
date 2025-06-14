const { URL } = require('url');
const fs = require('fs-extra');
const path = require('path');
const { handleYouTubeDownload } = require('./utils/youtube');
const { handleTikTokDownload } = require('./utils/tiktok');
const { handleInstagramDownload } = require('./utils/instagram');
const { getFileSize } = require('./utils/common'); // Hanya ambil getFileSize

async function setupBot(bot, downloadDir) {
  // Callback queries harus diinisialisasi di sini karena memerlukan akses ke `bot` instance
  // dan `downloadDir` (atau bisa pass via `ctx.state` atau closure jika diperlukan)

  // Contoh generic handler untuk callback query (akan diproses lebih spesifik di masing-masing util)
  bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    const userDownloadDir = path.join(downloadDir, String(userId));
    await fs.ensureDir(userDownloadDir);

    try {
      if (data.startsWith('youtube_')) {
        const [, type, formatId] = data.split('_');
        const originalUrl = ctx.callbackQuery.message.text.split('\n')[0].replace('Memproses link Anda, mohon tunggu sebentar...', '').trim(); // Ini sedikit hacky, lebih baik simpan URL di session
        
        // Asumsi URL asli disimpan di suatu tempat atau bisa diambil dari konteks chat sebelumnya
        // Untuk demo ini, kita akan coba ambil dari pesan sebelumnya
        // Di aplikasi nyata, Anda bisa menyimpan URL di session Telegraf
        const messages = await bot.telegram.getChatHistory(ctx.chat.id, { limit: 2 });
        const urlFromHistory = messages.messages.find(msg => msg.text && msg.text.startsWith('http'))?.text;
        
        if (!urlFromHistory) {
          await ctx.answerCbQuery('Gagal menemukan URL asli.');
          await ctx.reply('Terjadi kesalahan: Tidak dapat menemukan URL asli untuk mengunduh. Mohon kirim ulang link.');
          return;
        }

        await ctx.answerCbQuery(`Mengunduh ${type === 'video' ? 'video' : 'audio'}...`);
        await ctx.reply(`Mengunduh ${type === 'video' ? 'video' : 'audio'} dengan kualitas ${formatId}...`);

        const filename = path.join(userDownloadDir, `youtube_download_${Date.now()}`);
        await handleYouTubeDownload(ctx, new URL(urlFromHistory), downloadDir, type, formatId);

      } else if (data.startsWith('tiktok_audio_')) {
        const [, , videoId] = data.split('_');
        await ctx.answerCbQuery('Mengunduh audio TikTok...');
        await ctx.reply('Mengunduh audio TikTok...');

        // Untuk TikTok audio, kita perlu merekonstruksi URL asli jika tidak disimpan
        // Ini contoh paling sederhana, mungkin perlu disempurnakan
        const url = `https://www.tiktok.com/t/${videoId}/`; // Ini mungkin tidak selalu bekerja, lebih baik simpan URL lengkap
        await handleTikTokDownload(ctx, new URL(url), downloadDir, true); // True untuk menandakan audio
      }
    } catch (error) {
      console.error('Error in callback query handler:', error);
      await ctx.reply('Terjadi kesalahan saat memproses permintaan Anda.');
    } finally {
      await fs.emptyDir(userDownloadDir);
    }
  });

  bot.start(async (ctx) => {
    await ctx.reply('Halo! Kirimkan saya link TikTok, Instagram, atau YouTube.');
  });

  bot.on('text', async (ctx) => {
    const message = ctx.message.text;
    let url;

    try {
      url = new URL(message);
    } catch (error) {
      return ctx.reply('Mohon kirimkan link yang valid.');
    }

    await ctx.reply('Memproses link Anda, mohon tunggu sebentar...');

    // Deteksi berdasarkan hostname
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      await handleYouTubeDownload(ctx, url, downloadDir);
    } else if (url.hostname.includes('tiktok.com')) {
      await handleTikTokDownload(ctx, url, downloadDir);
    } else if (url.hostname.includes('instagram.com')) {
      await handleInstagramDownload(ctx, url, downloadDir);
    } else {
      await ctx.reply('Maaf, link ini tidak didukung. Saya hanya mendukung TikTok, Instagram, dan YouTube.');
    }
  });
}

module.exports = { setupBot };
