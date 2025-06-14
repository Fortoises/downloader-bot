const { runYtDlp, getFileSize, compressFile, findDownloadedFile } = require('./common');
const fs = require('fs-extra');
const path = require('path');

async function handleYouTubeDownload(ctx, url, downloadDir, cookiesDir, selectedType = null, selectedFormatId = null) { // Menerima cookiesDir
  const userId = ctx.from.id;
  const userDownloadDir = path.join(downloadDir, String(userId));
  await fs.ensureDir(userDownloadDir);

  try {
    if (!selectedType || !selectedFormatId) {
      await ctx.reply('Menganalisis opsi kualitas YouTube...');

      // Dapatkan info format dari yt-dlp
      // Meneruskan cookiesDir dan url.hostname
      const infoJson = await runYtDlp(['--dump-json', url.href], ctx, null, cookiesDir, url.hostname);
      const videoInfo = JSON.parse(infoJson);

      // Filter format video dan audio terpisah
      const availableFormats = videoInfo.formats;

      const videoOptions = [];
      const audioOptions = [];

      for (const f of availableFormats) {
        if (f.vcodec !== 'none' && f.acodec !== 'none' && f.height) { // Video dengan audio
          const sizeEstimateMB = ((f.filesize || f.filesize_approx) / (1024 * 1024)).toFixed(2);
          videoOptions.push({
            text: `${f.height}p (${sizeEstimateMB}MB)`, // Pakai height untuk resolusi
            callback_data: `youtube_video_${f.format_id}`
          });
        } else if (f.acodec !== 'none' && f.vcodec === 'none' && f.filesize_approx) { // Audio saja
          const sizeEstimateMB = ((f.filesize || f.filesize_approx) / (1024 * 1024)).toFixed(2);
          audioOptions.push({
            text: `Audio Only (${f.ext}, ${sizeEstimateMB}MB)`,
            callback_data: `youtube_audio_${f.format_id}`
          });
        }
      }

      // Batasi jumlah opsi agar tidak terlalu banyak tombol
      const combinedOptions = [
        ...videoOptions.slice(0, 5), // Ambil 5 opsi video teratas
        ...audioOptions.slice(0, 3) // Ambil 3 opsi audio teratas
      ];

      if (combinedOptions.length === 0) {
        return ctx.reply('Tidak ada format yang tersedia untuk diunduh.');
      }

      await ctx.reply('Pilih kualitas video atau audio:', {
        reply_markup: {
          inline_keyboard: combinedOptions.map(option => [option])
        }
      });
      
    } else { // Jika sudah ada pilihan format
      const filename = path.join(userDownloadDir, `youtube_download_${Date.now()}`);
      let args;
      let replyMessage;
      let telegramMethod;

      if (selectedType === 'video') {
        args = [
          '-f', selectedFormatId,
          url.href,
          '-o', `${filename}.%(ext)s`,
        ];
        replyMessage = `Mengunduh video YouTube dengan format ID ${selectedFormatId}...`;
        telegramMethod = 'replyWithVideo';
      } else if (selectedType === 'audio') {
        args = [
          '-f', selectedFormatId,
          '--extract-audio',
          '--audio-format', 'mp3', // Atau 'm4a', 'opus'
          url.href,
          '-o', `${filename}.%(ext)s`,
        ];
        replyMessage = `Mengunduh audio YouTube dengan format ID ${selectedFormatId}...`;
        telegramMethod = 'replyWithAudio';
      } else {
        return ctx.reply('Tipe unduhan tidak dikenal.');
      }

      await ctx.reply(replyMessage);

      // Jalankan yt-dlp dan tunggu hingga selesai
      // Meneruskan cookiesDir dan url.hostname
      await runYtDlp(args, ctx, filename, cookiesDir, url.hostname);

      const downloadedFilePath = await findDownloadedFile(userDownloadDir, path.basename(filename));

      if (!downloadedFilePath) {
        return ctx.reply('Gagal menemukan file yang diunduh setelah proses yt-dlp.');
      }

      const fileSize = await getFileSize(downloadedFilePath);
      const fileSizeMB = fileSize / (1024 * 1024);

      let finalFilePath = downloadedFilePath;
      if (fileSizeMB > 50) {
        const compressedFilePath = path.join(userDownloadDir, `compressed_${path.basename(downloadedFilePath)}`);
        finalFilePath = await compressFile(downloadedFilePath, compressedFilePath, fileSizeMB, ctx);
        await fs.remove(downloadedFilePath); // Hapus file asli setelah kompresi
        if (!finalFilePath) return; // Kompresi gagal atau file masih terlalu besar
      }

      // Kirim file ke Telegram
      await ctx[telegramMethod]({ source: finalFilePath });
      await fs.remove(finalFilePath); // Hapus file setelah dikirim
      await ctx.reply('Unduhan selesai!');
    }

  } catch (error) {
    console.error('Error handling YouTube download:', error);
    await ctx.reply('Terjadi kesalahan saat memproses link YouTube. Pastikan link valid dan publik.');
  } finally {
    // Selalu bersihkan direktori setelah proses selesai atau gagal
    await fs.emptyDir(userDownloadDir);
  }
}

module.exports = { handleYouTubeDownload };
