const folderInput = document.querySelector("#folderInput");
const cover = document.querySelector("#cover");
const disc = document.querySelector("#disc");
const songTitle = document.querySelector("#songTitle");
const songDesc = document.querySelector("#songDesc");
const folderName = document.querySelector("#folderName");
const progress = document.querySelector("#progress");
const currentTimeEl = document.querySelector("#currentTime");
const durationEl = document.querySelector("#duration");
const prevBtn = document.querySelector("#prevBtn");
const playBtn = document.querySelector("#playBtn");
const playIcon = document.querySelector("#playIcon");
const nextBtn = document.querySelector("#nextBtn");
const volume = document.querySelector("#volume");
const playlist = document.querySelector("#playlist");
const songCount = document.querySelector("#songCount");
const toast = document.querySelector("#toast");
const lyricsView = document.querySelector("#lyricsView");
const lyricsMode = document.querySelector("#lyricsMode");

const audio = new Audio();
audio.volume = Number(volume.value);

let songs = [];
let currentIndex = -1;
let isSeeking = false;
let toastTimer = null;
let currentLyricIndex = -1;

const fallbackCover = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#9BA7FF"/>
      <stop offset="0.5" stop-color="#6E75FF"/>
      <stop offset="1" stop-color="#15172E"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="400" cy="400" r="210" fill="rgba(255,255,255,.18)"/>
  <circle cx="400" cy="400" r="92" fill="rgba(255,255,255,.28)"/>
  <path d="M345 275v250l205-125-205-125Z" fill="white" opacity=".9"/>
</svg>
`)}`;

cover.src = fallbackCover;
renderLyrics(null);

folderInput.addEventListener("change", handleFolderImport);
playBtn.addEventListener("click", togglePlay);
prevBtn.addEventListener("click", playPrevious);
nextBtn.addEventListener("click", playNext);
volume.addEventListener("input", () => {
  audio.volume = Number(volume.value);
});

progress.addEventListener("input", () => {
  isSeeking = true;
  updateSeekPreview();
});

progress.addEventListener("change", () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
    updateActiveLyric(audio.currentTime, true);
  }
  isSeeking = false;
});

audio.addEventListener("play", () => {
  disc.classList.add("playing");
  setPlayIcon(false);
});

audio.addEventListener("pause", () => {
  disc.classList.remove("playing");
  setPlayIcon(true);
});

audio.addEventListener("timeupdate", () => {
  if (!isSeeking && Number.isFinite(audio.duration) && audio.duration > 0) {
    progress.value = String((audio.currentTime / audio.duration) * 1000);
    currentTimeEl.textContent = formatTime(audio.currentTime);
  }

  updateActiveLyric(audio.currentTime);
});

audio.addEventListener("loadedmetadata", () => {
  durationEl.textContent = formatTime(audio.duration);
});

audio.addEventListener("ended", () => {
  playNext(true);
});

audio.addEventListener("error", () => {
  showToast("当前音频无法播放，请检查 MP3 文件");
});

async function handleFolderImport(event) {
  const files = Array.from(event.target.files || []);

  if (files.length === 0) {
    return;
  }

  revokeOldObjectUrls();

  const grouped = groupFilesByFolder(files);
  const importedSongs = [];

  for (const [folderPath, items] of grouped.entries()) {
    const audioFile = items.find((file) => isMp3(file));
    const coverFile = items.find((file) => isCover(file));
    const lyricFile = items.find((file) => isLyrics(file));

    if (!audioFile) {
      continue;
    }

    const lyricText = lyricFile ? await lyricFile.text() : "";

    importedSongs.push({
      title: removeExt(audioFile.name),
      folder: getLastFolderName(folderPath),
      folderPath,
      audioUrl: URL.createObjectURL(audioFile),
      coverUrl: coverFile ? URL.createObjectURL(coverFile) : fallbackCover,
      lyrics: lyricText ? parseLyrics(lyricText) : null,
      audioFile,
      coverFile,
      lyricFile
    });
  }

  importedSongs.sort((a, b) => a.folderPath.localeCompare(b.folderPath, "zh-CN"));

  if (importedSongs.length === 0) {
    showToast("没有找到 MP3 文件，请检查文件夹结构");
    return;
  }

  songs = importedSongs;
  currentIndex = 0;
  renderPlaylist();
  loadSong(0, false);
  showToast(`已导入 ${songs.length} 首歌曲`);
}

function groupFilesByFolder(files) {
  const map = new Map();

  files.forEach((file) => {
    const relativePath = file.webkitRelativePath || file.name;
    const parts = relativePath.split("/").filter(Boolean);
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "未分组";

    if (!map.has(folderPath)) {
      map.set(folderPath, []);
    }

    map.get(folderPath).push(file);
  });

  return map;
}

function isMp3(file) {
  return file.type === "audio/mpeg" || /\.mp3$/i.test(file.name);
}

function isCover(file) {
  return /^image\//.test(file.type) || /\.(png|jpg|jpeg|webp)$/i.test(file.name);
}

function isLyrics(file) {
  return /\.(lrc|txt)$/i.test(file.name);
}

function removeExt(name) {
  return name.replace(/\.[^.]+$/, "");
}

function getLastFolderName(path) {
  const parts = path.split("/").filter(Boolean);
  return parts.at(-1) || path;
}

function loadSong(index, autoPlay = false) {
  if (!songs[index]) {
    return;
  }

  currentIndex = index;
  currentLyricIndex = -1;

  const song = songs[index];

  audio.src = song.audioUrl;
  cover.src = song.coverUrl || fallbackCover;
  songTitle.textContent = song.title;
  folderName.textContent = song.folder;
  songDesc.textContent = song.folderPath;
  progress.value = "0";
  currentTimeEl.textContent = "00:00";
  durationEl.textContent = "00:00";

  renderPlaylist();
  renderLyrics(song.lyrics);
  extractThemeFromCover(song.coverUrl || fallbackCover);

  if (autoPlay) {
    audio.play().catch(() => {
      showToast("浏览器阻止了自动播放，请手动点击播放");
    });
  }
}

function togglePlay() {
  if (songs.length === 0) {
    folderInput.click();
    return;
  }

  if (audio.paused) {
    audio.play().catch(() => showToast("播放失败，请重新选择歌曲"));
  } else {
    audio.pause();
  }
}

function playPrevious() {
  if (songs.length === 0) {
    folderInput.click();
    return;
  }

  const nextIndex = (currentIndex - 1 + songs.length) % songs.length;
  loadSong(nextIndex, true);
}

function playNext(fromEnded = false) {
  if (songs.length === 0) {
    folderInput.click();
    return;
  }

  const nextIndex = (currentIndex + 1) % songs.length;
  loadSong(nextIndex, fromEnded || !audio.paused);
}

function setPlayIcon(showPlay) {
  playIcon.innerHTML = showPlay
    ? '<path d="M8 5v14l11-7L8 5Z"/>'
    : '<path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z"/>';
}

function renderPlaylist() {
  songCount.textContent = `${songs.length} 首`;

  if (songs.length === 0) {
    playlist.innerHTML = `
      <div class="empty">
        <p>还没有歌曲</p>
        <span>点击右上角导入文件夹</span>
      </div>
    `;
    return;
  }

  playlist.innerHTML = "";

  songs.forEach((song, index) => {
    const button = document.createElement("button");
    button.className = `track ${index === currentIndex ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <img src="${song.coverUrl}" alt="">
      <span>
        <strong>${escapeHtml(song.title)}</strong>
        <span>${escapeHtml(song.folder)}</span>
      </span>
    `;

    button.addEventListener("click", () => {
      loadSong(index, true);
    });

    playlist.appendChild(button);
  });
}

function parseLyrics(text) {
  const normalizedText = text.replace(/\r/g, "");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const timedLines = [];
  const plainLines = [];

  lines.forEach((line) => {
    const timeMatches = [...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    const content = line.replace(/\[[^\]]+\]/g, "").trim();

    if (timeMatches.length > 0 && content) {
      timeMatches.forEach((match) => {
        const minute = Number(match[1]);
        const second = Number(match[2]);
        const fraction = match[3] ? Number(`0.${match[3].padEnd(3, "0").slice(0, 3)}`) : 0;
        timedLines.push({
          time: minute * 60 + second + fraction,
          text: content
        });
      });
    } else if (content && !/^\[(ti|ar|al|by|offset):/i.test(line)) {
      plainLines.push(content);
    }
  });

  if (timedLines.length > 0) {
    return {
      type: "lrc",
      lines: timedLines.sort((a, b) => a.time - b.time)
    };
  }

  if (plainLines.length > 0) {
    return {
      type: "plain",
      lines: plainLines.map((textLine) => ({
        time: 0,
        text: textLine
      }))
    };
  }

  return null;
}

function renderLyrics(lyrics) {
  currentLyricIndex = -1;

  if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) {
    lyricsMode.textContent = "未加载";
    lyricsView.innerHTML = `
      <p class="lyric-line empty active">当前歌曲没有歌词文件</p>
      <p class="lyric-line empty">在歌曲文件夹中加入 .lrc 或 .txt 即可显示歌词</p>
    `;
    return;
  }

  lyricsMode.textContent = lyrics.type === "lrc" ? "LRC 同步" : "TXT 文本";

  lyricsView.innerHTML = lyrics.lines
    .map((line, index) => {
      const active = lyrics.type === "plain" && index === 0 ? " active" : "";
      return `<p class="lyric-line${active}" data-index="${index}">${escapeHtml(line.text)}</p>`;
    })
    .join("");

  if (lyrics.type === "plain") {
    lyricsView.scrollTop = 0;
  }
}

function updateActiveLyric(currentTime, force = false) {
  const song = songs[currentIndex];

  if (!song || !song.lyrics || song.lyrics.type !== "lrc") {
    return;
  }

  const lines = song.lyrics.lines;
  let nextIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime + 0.15) {
      nextIndex = i;
    } else {
      break;
    }
  }

  if (nextIndex === currentLyricIndex && !force) {
    return;
  }

  currentLyricIndex = nextIndex;

  lyricsView.querySelectorAll(".lyric-line").forEach((line) => {
    line.classList.remove("active");
  });

  if (nextIndex >= 0) {
    const activeLine = lyricsView.querySelector(`[data-index="${nextIndex}"]`);
    if (activeLine) {
      activeLine.classList.add("active");
      activeLine.scrollIntoView({
        block: "center",
        behavior: force ? "auto" : "smooth"
      });
    }
  }
}

function updateSeekPreview() {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
    return;
  }

  const nextTime = (Number(progress.value) / 1000) * audio.duration;
  currentTimeEl.textContent = formatTime(nextTime);
  updateActiveLyric(nextTime, true);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function extractThemeFromCover(imageUrl) {
  const img = new Image();
  img.crossOrigin = "anonymous";

  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const size = 48;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      const data = ctx.getImageData(0, 0, size, size).data;
      const color = getDominantColor(data);
      applyTheme(color);
    } catch {
      applyTheme({ r: 104, g: 124, b: 255 });
    }
  };

  img.onerror = () => applyTheme({ r: 104, g: 124, b: 255 });
  img.src = imageUrl;
}

function getDominantColor(data) {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];

    if (alpha < 120) {
      continue;
    }

    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    const brightness = (red + green + blue) / 3;

    if (brightness < 24 || brightness > 238) {
      continue;
    }

    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    const weight = 1 + saturation / 80;

    r += red * weight;
    g += green * weight;
    b += blue * weight;
    total += weight;
  }

  if (total === 0) {
    return { r: 104, g: 124, b: 255 };
  }

  return {
    r: Math.round(r / total),
    g: Math.round(g / total),
    b: Math.round(b / total)
  };
}

function applyTheme({ r, g, b }) {
  const base = boostThemeColor({ r, g, b });
  const light = mixColor(base, { r: 255, g: 255, b: 255 }, 0.36);
  const soft = mixColor(base, { r: 255, g: 255, b: 255 }, 0.58);
  const dark = mixColor(base, { r: 5, g: 8, b: 20 }, 0.72);
  const contrast = getReadableTextColor(base);

  document.documentElement.style.setProperty("--theme-rgb", `${base.r}, ${base.g}, ${base.b}`);
  document.documentElement.style.setProperty("--theme-light", `${light.r}, ${light.g}, ${light.b}`);
  document.documentElement.style.setProperty("--theme-soft", `${soft.r}, ${soft.g}, ${soft.b}`);
  document.documentElement.style.setProperty("--theme-dark", `${dark.r}, ${dark.g}, ${dark.b}`);
  document.documentElement.style.setProperty("--theme-contrast", `${contrast.r}, ${contrast.g}, ${contrast.b}`);
}

function boostThemeColor({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;

  if (saturation >= 0.28) {
    return { r, g, b };
  }

  const average = (r + g + b) / 3;

  return {
    r: clampColor(average + (r - average) * 1.45),
    g: clampColor(average + (g - average) * 1.45),
    b: clampColor(average + (b - average) * 1.45)
  };
}

function getReadableTextColor({ r, g, b }) {
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 150
    ? { r: 18, g: 22, b: 32 }
    : { r: 255, g: 255, b: 255 };
}

function clampColor(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mixColor(a, b, amount) {
  return {
    r: Math.round(a.r * (1 - amount) + b.r * amount),
    g: Math.round(a.g * (1 - amount) + b.g * amount),
    b: Math.round(a.b * (1 - amount) + b.b * amount)
  };
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[char];
  });
}

function revokeOldObjectUrls() {
  songs.forEach((song) => {
    if (song.audioUrl && song.audioUrl.startsWith("blob:")) {
      URL.revokeObjectURL(song.audioUrl);
    }

    if (song.coverUrl && song.coverUrl.startsWith("blob:")) {
      URL.revokeObjectURL(song.coverUrl);
    }
  });
}
