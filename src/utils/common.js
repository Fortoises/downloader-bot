const fs = require('fs-extra');
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

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
    // Menyesuaikan opsi kompresi untuk mengurangi ukuran file secara signifikan
    // Prioritaskan kecepatan untuk pengalaman pengguna yang lebih baik, tapi mungkin mengorbankan kualitas sedikit.
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

// Fungsi helper untuk menjalankan yt-dlp dan mendapatkan path file yang diunduh
async function runYtDlp(args, ctx, downloadPathPrefix) {
  return new Promise((resolve, reject) => {
    const ytDlpProcess = spawn('yt-dlp', args);
    let errorOutput = '';

    ytDlpProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      // console.error(`yt-dlp stderr: ${data}`); // Untuk debugging
    });

    ytDlpProcess.on('close', (code) => {
      if (code === 0) {
        // Asumsi yt-dlp mencetak nama file terakhir ke stdout atau kita bisa menebak
        // Dengan output template `-o ${downloadPathPrefix}.%(ext)s`, kita perlu mencari
        // file yang cocok setelah download selesai.
        resolve(downloadPathPrefix); // Kita akan mencari file di luar fungsi ini
      } else {
        console.error(`yt-dlp exited with code ${code}\nError: ${errorOutput}`);
        ctx.reply('Terjadi kesalahan saat mengunduh. Pastikan link valid dan publik.');
        reject(new Error(`yt-dlp exited with code ${code}\nError: ${errorOutput}`));
      }
    });
  });
}

// Fungsi untuk menemukan file yang baru diunduh berdasarkan nama awal
async function findDownloadedFile(directory, baseFilename) {
  const files = await fs.readdir(directory);
  for (const file of files) {
    if (file.startsWith(path.basename(baseFilename))) {
      return path.join(directory, file);
    }
  }
  return null;
}

// Fungsi untuk menemukan semua file yang diunduh berdasarkan nama awal
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
