const { URL } = require('url');
const fs = require('fs-extra');
const path = require('path');
const { handleYouTubeDownload } = require('./utils/youtube');
const { handleTikTokDownload } = require('./utils/tiktok');
const { handleInstagramDownload } = require('./utils/instagram');

// Terima cookiesDir sebagai argumen baru
async function setupBot(bot, downloadDir, cookiesDir) { 
  // Callback queries handler
  bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    const userDownloadDir = path.join(downloadDir, String(userId));
    await fs.ensureDir(userDownloadDir);

    try {
      // YouTube callback handling
      if (data.startsWith('youtube_')) {
        const [, type, formatId] = data.split('_');
        
        // **PERBAIKAN:** Ambil URL asli dari session atau mekanisme penyimpanan lain.
        // Metode history messages ini sangat tidak reliable.
        // Untuk demo ini, kita akan coba ambil dari pesan sebelumnya,
        // tapi di produksi, pakai Telegraf.session atau database.
        const messages = await ctx.telegram.getChatHistory(ctx.chat.id, { limit: 2 });
        const urlFromHistory = messages.messages.find(msg => msg.text && msg.text.startsWith('http'))?.text;
        
        if (!urlFromHistory) {
          await ctx.answerCbQuery('Gagal menemukan URL asli.');
          await ctx.reply('Terjadi kesalahan: Tidak dapat menemukan URL asli untuk mengunduh. Mohon kirim ulang link.');
          return;
        }

        await ctx.answerCbQuery(`Mengunduh ${type === 'video' ? 'video' : 'audio'}...`);
        await ctx.reply(`Mengunduh ${type === 'video' ? 'video' : 'audio'} dengan kualitas ${formatId}...`);

        // Meneruskan cookiesDir ke handleYouTubeDownload
        await handleYouTubeDownload(ctx, new URL(urlFromHistory), downloadDir, cookiesDir, type, formatId);

      } 
      // TikTok audio callback handling
      else if (data.startsWith('tiktok_audio_')) {
        const [, , videoId] = data.split('_');
        await ctx.answerCbQuery('Mengunduh audio TikTok...');
        await ctx.reply('Mengunduh audio TikTok...');

        // REKONSTRUKSI URL: Ini tetap tidak ideal. Lebih baik simpan URL lengkap di callback data atau session.
        const url = `https://www.tiktok.com/t/${videoId}/`; 
        // Meneruskan cookiesDir ke handleTikTokDownload
        await handleTikTokDownload(ctx, new URL(url), downloadDir, cookiesDir, true); // true untuk menandakan audio
      }
      // Anda bisa menambahkan callback handler lain di sini jika ada (misal dari Instagram)

    } catch (error) {
      console.error('Error in callback query handler:', error);
      await ctx.reply('Terjadi kesalahan saat memproses permintaan Anda.');
    } finally {
      // Pastikan userDownloadDir selalu dibersihkan
      if (await fs.pathExists(userDownloadDir)) {
          await fs.emptyDir(userDownloadDir);
      }
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

    // Deteksi berdasarkan hostname dan panggil handler yang sesuai
    // Meneruskan cookiesDir ke masing-masing handler
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      await handleYouTubeDownload(ctx, url, downloadDir, cookiesDir);
    } else if (url.hostname.includes('tiktok.com')) {
      await handleTikTokDownload(ctx, url, downloadDir, cookiesDir);
    } else if (url.hostname.includes('instagram.com')) {
      await handleInstagramDownload(ctx, url, downloadDir, cookiesDir);
    } else {
      await ctx.reply('Maaf, link ini tidak didukung. Saya hanya mendukung TikTok, Instagram, dan YouTube.');
    }
  });
}

module.exports = { setupBot };
