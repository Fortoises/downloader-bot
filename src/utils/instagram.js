const { runYtDlp, getFileSize, compressFile, findDownloadedFile, findDownloadedFiles } = require('./common');
const fs = require('fs-extra');
const path = require('path');

async function handleInstagramDownload(ctx, url, downloadDir, cookiesDir) { // Menerima cookiesDir
  const userId = ctx.from.id;
  const userDownloadDir = path.join(downloadDir, String(userId));
  await fs.ensureDir(userDownloadDir);

  await ctx.reply('Mengunduh dari Instagram...');

  try {
    const filenamePrefix = path.join(userDownloadDir, `instagram_download_${Date.now()}`);

    // Dapatkan info JSON untuk menentukan tipe konten dan URL thumbnail profil
    // Meneruskan cookiesDir dan url.hostname
    const infoJson = await runYtDlp(['--dump-json', url.href], ctx, null, cookiesDir, url.hostname);
    const mediaInfo = JSON.parse(infoJson);

    // Cek apakah ini link profil untuk download foto profil
    // Perbaikan: Pastikan match valid sebelum mengakses group 0
    if (url.pathname.match(/^\/[a-zA-Z0-9_.]+\/?$/) && mediaInfo.thumbnail) {
      await ctx.reply('Mendeteksi link profil Instagram. Mengunduh foto profil...');
      const profilePicUrl = mediaInfo.thumbnail;
      const picFilename = path.join(userDownloadDir, `profile_pic_${Date.now()}.jpg`);
      
      // Unduh foto profil langsung dari URL thumbnail
      // Meneruskan cookiesDir dan url.hostname
      await runYtDlp([profilePicUrl, '-o', picFilename], ctx, picFilename, cookiesDir, url.hostname);

      const downloadedFilePath = await findDownloadedFile(userDownloadDir, path.basename(picFilename));
      if (!downloadedFilePath) {
        return ctx.reply('Gagal menemukan foto profil yang diunduh.');
      }

      const fileSize = await getFileSize(downloadedFilePath);
      const fileSizeMB = fileSize / (1024 * 1024);

      let finalFilePath = downloadedFilePath;
      if (fileSizeMB > 50) {
        const compressedFilePath = path.join(userDownloadDir, `compressed_${path.basename(picFilename)}`);
        finalFilePath = await compressFile(downloadedFilePath, compressedFilePath, fileSizeMB, ctx);
        await fs.remove(downloadedFilePath);
        if (!finalFilePath) return;
      }

      await ctx.replyWithPhoto({ source: finalFilePath });
      await fs.remove(finalFilePath);
      await ctx.reply('Foto profil berhasil diunduh.');

    } else {
      // Ini adalah link post, reels, atau IGTV
      await ctx.reply('Mengunduh media Instagram (foto/video)...');
      
      const args = [
        '-f', 'bestvideo+bestaudio/best', // Kualitas terbaik
        '--merge-output-format', 'mp4',
        url.href,
        '-o', `${filenamePrefix}.%(ext)s`,
      ];

      // Meneruskan cookiesDir dan url.hostname
      await runYtDlp(args, ctx, filenamePrefix, cookiesDir, url.hostname); 

      // Temukan semua file yang diunduh (untuk slide/multi-post)
      const downloadedFiles = await findDownloadedFiles(userDownloadDir, path.basename(filenamePrefix));

      if (downloadedFiles.length === 0) {
        return ctx.reply('Gagal menemukan media yang diunduh. Pastikan link valid dan publik.');
      }

      for (const filePath of downloadedFiles) {
        const fileSize = await getFileSize(filePath);
        const fileSizeMB = fileSize / (1024 * 1024);

        let finalFilePath = filePath;
        if (fileSizeMB > 50) {
          const compressedFilePath = path.join(userDownloadDir, `compressed_${path.basename(filePath)}`);
          finalFilePath = await compressFile(filePath, compressedFilePath, fileSizeMB, ctx);
          await fs.remove(filePath);
          if (!finalFilePath) continue;
        }

        const fileExtension = path.extname(finalFilePath).toLowerCase();
        if (['.mp4', '.mov', '.avi', '.mkv'].includes(fileExtension)) {
          await ctx.replyWithVideo({ source: finalFilePath });
        } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fileExtension)) {
          await ctx.replyWithPhoto({ source: finalFilePath });
        } else {
          // Fallback untuk tipe file lain
          await ctx.replyWithDocument({ source: finalFilePath });
        }
        await fs.remove(finalFilePath);
      }
      await ctx.reply('Media Instagram berhasil diunduh.');
    }

  } catch (error) {
    console.error('Error handling Instagram download:', error);
    await ctx.reply('Terjadi kesalahan saat mengunduh dari Instagram. Pastikan link valid, akun publik, dan tidak ada pembatasan.');
  } finally {
    await fs.emptyDir(userDownloadDir);
  }
}

module.exports = { handleInstagramDownload };
