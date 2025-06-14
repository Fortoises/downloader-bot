const fs = require('fs-extra');
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const path = require('path');

async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size; // Ukuran dalam byte
  } catch (error) {
    console.error(`Error getting file size for ${filePath}:`, error);
    return 0;
  }
}

async function compressFile(inputPath, outputPath, originalSizeMB, ctx) {
  await ctx.reply(`File Anda berukuran ${originalSizeMB.toFixed(2)} MB, lebih dari 50 MB. Mencoba mengompres file...`);

  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn(ffmpegPath, [
      '-i', inputPath,
      '-vf', 'scale=min(1280\\,iw):-2', // Batasi lebar maksimum 1280px, pertahankan rasio aspek
      '-crf', '32', // CRF yang lebih tinggi untuk kompresi lebih agresif (32-38 adalah rentang yang baik)
      '-preset', 'medium', // Kecepatan kompresi: ultrafast, superfast, fast, medium, slow, slower, slowest
      '-map_metadata', '-1', // Hapus metadata
      outputPath
    ]);

    ffmpegProcess.stderr.on('data', (data) => {
      // console.error(`FFmpeg stderr: ${data.toString()}`); // Untuk debugging
    });

    ffmpegProcess.on('close', async (code) => {
      if (code === 0) {
        const compressedSize = await getFileSize(outputPath);
        const compressedSizeMB = compressedSize / (1024 * 1024);
        console.log(`File compressed. Original: ${originalSizeMB.toFixed(2)} MB, Compressed: ${compressedSizeMB.toFixed(2)} MB`);

        if (compressedSizeMB > 50) {
          await ctx.reply('Maaf, file masih terlalu besar setelah dikompres dan tidak dapat dikirim. Batas Telegram adalah 50MB.');
          fs.remove(outputPath);
          resolve(null); // Tandakan gagal
        } else {
          resolve(outputPath);
        }
      } else {
        console.error(`FFmpeg exited with code ${code}. Error output: ${ffmpegProcess.stderr.read()}`);
        await ctx.reply('Gagal mengompres file. Mungkin file sudah terlalu besar atau formatnya tidak didukung untuk kompresi.');
        fs.remove(outputPath);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

// FUNGSI runYtDlp SUDAH DIUPDATE DAN DIPERBAIKI
async function runYtDlp(args, ctx, downloadPathPrefix, cookiesDir, urlHost = null) {
  return new Promise(async (resolve, reject) => {
    const fullArgs = [...args];
    let cookieFilePath = null;

    if (cookiesDir && urlHost) {
      // Tentukan file cookies berdasarkan hostname
      if (urlHost.includes('youtube.com') || urlHost.includes('youtu.be')) {
        cookieFilePath = path.join(cookiesDir, 'youtube.txt');
      } else if (urlHost.includes('instagram.com')) {
        cookieFilePath = path.join(cookiesDir, 'instagram.txt');
      } else if (urlHost.includes('tiktok.com')) { // TikTok juga bisa pakai cookies, terutama untuk akun tertentu/rate limit
        cookieFilePath = path.join(cookiesDir, 'tiktok.txt');
      }
      // Anda bisa menambahkan platform lain di sini

      if (cookieFilePath && await fs.pathExists(cookieFilePath)) { // Cek apakah file cookies ada
        fullArgs.unshift('--cookies', cookieFilePath);
        console.log(`Using cookies from: ${cookieFilePath}`);
      } else if (cookieFilePath) {
        console.warn(`Cookie file not found for ${urlHost}: ${cookieFilePath}. Proceeding without cookies for this platform.`);
      }
    }

    const ytDlpProcess = spawn('yt-dlp', fullArgs);
    let errorOutput = '';

    ytDlpProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      // console.error(`yt-dlp stderr: ${data}`); // Untuk debugging detail
    });

    ytDlpProcess.on('close', (code) => {
      if (code === 0) {
        resolve(downloadPathPrefix);
      } else {
        console.error(`yt-dlp exited with code ${code}\nError: ${errorOutput}`);
        let userErrorMessage = 'Terjadi kesalahan saat mengunduh. Pastikan link valid dan publik.';
        
        // Pesan error yang lebih spesifik untuk pengguna
        if (errorOutput.includes('Sign in to confirm you’re not a bot') || errorOutput.includes('Please log in')) {
          userErrorMessage += '\n\nMungkin konten memerlukan login atau terdeteksi sebagai bot. Pastikan Anda telah menyediakan file cookies yang valid di direktori `cookies/` untuk platform ini.';
        } else if (errorOutput.includes('This video is unavailable') || errorOutput.includes('Video unavailable')) {
            userErrorMessage += '\n\nVideo atau media ini mungkin tidak tersedia atau telah dihapus.';
        } else if (errorOutput.includes('This account is private') || errorOutput.includes('Private account')) {
            userErrorMessage += '\n\nAkun ini bersifat pribadi. Saya hanya bisa mengunduh dari akun publik.';
        } else if (errorOutput.includes('No such file or directory')) {
            userErrorMessage += '\n\nFile cookies yang dikonfigurasi tidak ditemukan. Pastikan path file cookies benar.';
        } else if (errorOutput.includes('RateLimitError') || errorOutput.includes('Too Many Requests')) {
            userErrorMessage += '\n\nTerlalu banyak permintaan ke situs. Coba lagi nanti atau pastikan cookies Anda sudah benar.';
        } else if (errorOutput.includes('unsupported URL') || errorOutput.includes('No extractor found')) {
            userErrorMessage += '\n\nLink yang Anda berikan tidak didukung atau tidak valid.';
        }

        ctx.reply(userErrorMessage);
        reject(new Error(`yt-dlp exited with code ${code}\nError: ${errorOutput}`));
      }
    });
  });
}

async function findDownloadedFile(directory, baseFilename) {
  const files = await fs.readdir(directory);
  for (const file of files) {
    if (file.startsWith(path.basename(baseFilename))) {
      return path.join(directory, file);
    }
  }
  return null;
}

async function findDownloadedFiles(directory, baseFilename) {
  const files = await fs.readdir(directory);
  const downloaded = [];
  for (const file of files) {
    if (file.startsWith(path.basename(baseFilename))) {
      downloaded.push(path.join(directory, file));
    }
  }
  return downloaded;
}

module.exports = {
  getFileSize,
  compressFile,
  runYtDlp,
  findDownloadedFile,
  findDownloadedFiles
};
