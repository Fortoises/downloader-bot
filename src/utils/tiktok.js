const { runYtDlp, getFileSize, compressFile, findDownloadedFile, findDownloadedFiles } = require('./common');
const fs = require('fs-extra');
const path = require('path');

async function handleTikTokDownload(ctx, url, downloadDir, isAudioOnly = false) {
  const userId = ctx.from.id;
  const userDownloadDir = path.join(downloadDir, String(userId));
  await fs.ensureDir(userDownloadDir);

  await ctx.reply('Mengunduh dari TikTok...');

  const filenamePrefix = path.join(userDownloadDir, `tiktok_download_${Date.now()}`);

  try {
    // Dapatkan info JSON untuk menentukan tipe konten
    const infoJson = await runYtDlp(['--dump-json', url.href], ctx, null); // Tidak perlu filename di sini
    const videoInfo = JSON.parse(infoJson);

    if (isAudioOnly) {
      await ctx.reply('Mengunduh audio dari TikTok...');
      const audioFilename = `${filenamePrefix}_audio.%(ext)s`;
      await runYtDlp([
        '-f', 'bestaudio/best',
        '--extract-audio',
        '--audio-format', 'mp3', // Atau 'm4a', 'opus'
        url.href,
        '-o', audioFilename
      ], ctx, audioFilename);

      const downloadedFilePath = await findDownloadedFile(userDownloadDir, path.basename(audioFilename.replace('.%(ext)s', '')));
      if (!downloadedFilePath) {
        return ctx.reply('Gagal menemukan file audio TikTok yang diunduh.');
      }

      const fileSize = await getFileSize(downloadedFilePath);
      const fileSizeMB = fileSize / (1024 * 1024);

      let finalFilePath = downloadedFilePath;
      if (fileSizeMB > 50) {
        const compressedFilePath = path.join(userDownloadDir, `compressed_${path.basename(downloadedFilePath)}`);
        finalFilePath = await compressFile(downloadedFilePath, compressedFilePath, fileSizeMB, ctx);
        await fs.remove(downloadedFilePath);
        if (!finalFilePath) return;
      }

      await ctx.replyWithAudio({ source: finalFilePath });
      await fs.remove(finalFilePath);
      await ctx.reply('Audio TikTok berhasil diunduh.');

    } else if (videoInfo._type === 'playlist' && videoInfo.entries && videoInfo.entries.length > 0) {
      // Ini kemungkinan slide foto TikTok
      await ctx.reply('Mendeteksi slide foto TikTok, mengunduh semua gambar...');

      for (let i = 0; i < videoInfo.entries.length; i++) {
        const entry = videoInfo.entries[i];
        if (entry.url && entry.ext) {
          const photoFilename = path.join(userDownloadDir, `tiktok_photo_${Date.now()}_${i}.${entry.ext}`);
          // Unduh setiap foto satu per satu
          await runYtDlp([
            entry.url,
            '-o', photoFilename,
            '--no-playlist' // Pastikan hanya satu entry yang diunduh
          ], ctx, photoFilename);

          const downloadedFilePath = await findDownloadedFile(userDownloadDir, path.basename(photoFilename));
          if (!downloadedFilePath) {
            console.error(`Gagal menemukan foto slide TikTok ${i}`);
            continue;
          }

          const fileSize = await getFileSize(downloadedFilePath);
          const fileSizeMB = fileSize / (1024 * 1024);

          let finalFilePath = downloadedFilePath;
          if (fileSizeMB > 50) {
            const compressedFilePath = path.join(userDownloadDir, `compressed_${path.basename(downloadedFilePath)}`);
            finalFilePath = await compressFile(downloadedFilePath, compressedFilePath, fileSizeMB, ctx);
            await fs.remove(downloadedFilePath);
            if (!finalFilePath) continue;
          }

          await ctx.replyWithPhoto({ source: finalFilePath });
          await fs.remove(finalFilePath);
        }
      }
      await ctx.reply('Selesai mengunduh semua foto slide TikTok.');

    } else {
      // Ini kemungkinan video TikTok
      await ctx.reply('Mendeteksi video TikTok. Mengunduh video kualitas terbaik...');

      const videoFilename = `${filenamePrefix}.%(ext)s`;
      await runYtDlp([
        '-f', 'bestvideo+bestaudio/best', // Kualitas terbaik
        '--merge-output-format', 'mp4', // Gabungkan jika video dan audio terpisah
        url.href,
        '-o', videoFilename,
      ], ctx, videoFilename);

      const downloadedFilePath = await findDownloadedFile(userDownloadDir, path.basename(filenamePrefix));
      if (!downloadedFilePath) {
        return ctx.reply('Gagal menemukan file video TikTok yang diunduh.');
      }

      const fileSize = await getFileSize(downloadedFilePath);
      const fileSizeMB = fileSize / (1024 * 1024);

      let finalFilePath = downloadedFilePath;
      if (fileSizeMB > 50) {
        const compressedFilePath = path.join(userDownloadDir, `compressed_${path.basename(downloadedFilePath)}`);
        finalFilePath = await compressFile(downloadedFilePath, compressedFilePath, fileSizeMB, ctx);
        await fs.remove(downloadedFilePath);
        if (!finalFilePath) return;
      }

      await ctx.replyWithVideo({ source: finalFilePath });
      await fs.remove(finalFilePath);
      await ctx.reply('Video TikTok berhasil diunduh.');

      // Opsi untuk download audio
      await ctx.reply('Apakah Anda ingin mengunduh audio dari video ini juga?', {
        reply_markup: {
          inline_keyboard: [[{ text: 'Unduh Audio', callback_data: `tiktok_audio_${videoInfo.id}` }]]
        }
      });
    }

  } catch (error) {
    console.error('Error handling TikTok download:', error);
    await ctx.reply('Terjadi kesalahan saat mengunduh dari TikTok. Pastikan link valid dan publik.');
  } finally {
    await fs.emptyDir(userDownloadDir);
  }
}

module.exports = { handleTikTokDownload };
