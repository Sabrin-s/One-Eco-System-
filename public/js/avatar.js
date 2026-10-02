// Avatar greeter: plays Jalpa's recorded voice note over her portrait.
// While audio plays, the portrait gets a glowing ring and a waveform driven
// by the Web Audio analyser (falls back to a CSS animation if unavailable).

(function () {
  const stage = document.getElementById("avatarPhotoWrap");
  const caption = document.getElementById("avatarCaption");
  const playBtn = document.getElementById("playIntroBtn");
  const replayBtn = document.getElementById("replayAvatarBtn");
  const muteBtn = document.getElementById("muteBtn");
  const audio = document.getElementById("avatarAudio");
  const wave = document.getElementById("avatarWave");
  const progress = document.getElementById("avatarProgress");
  if (!stage || !audio) return;

  const BAR_COUNT = 28;
  const bars = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement("i");
    bar.style.animationDelay = `${(i % 7) * 0.09}s`;
    wave.appendChild(bar);
    bars.push(bar);
  }

  let analyser = null;
  let levels = null;
  let rafId = 0;

  function setupAnalyser() {
    if (analyser || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      levels = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      if (ctx.state === "suspended") ctx.resume();
      stage.classList.add("reactive");
    } catch {
      analyser = null;
    }
  }

  function draw() {
    if (analyser) {
      analyser.getByteFrequencyData(levels);
      bars.forEach((bar, i) => {
        const v = levels[i % levels.length] / 255;
        bar.style.transform = `scaleY(${0.15 + v * 1.1})`;
      });
    }
    if (audio.duration) progress.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    rafId = requestAnimationFrame(draw);
  }

  function formatTime(s) {
    if (!isFinite(s)) return "";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  function playIntro() {
    setupAnalyser();
    audio.currentTime = 0;
    audio.play().catch(() => {
      caption.textContent = "Your browser blocked audio — tap play again.";
    });
  }

  function togglePlay() {
    if (audio.paused) {
      if (audio.ended || audio.currentTime === 0) playIntro();
      else audio.play();
    } else {
      audio.pause();
    }
  }

  audio.addEventListener("play", () => {
    stage.classList.add("speaking");
    playBtn.textContent = "❚❚ Pause";
    caption.textContent = "🎙 Jalpa is speaking…";
    cancelAnimationFrame(rafId);
    draw();
  });
  audio.addEventListener("pause", () => {
    stage.classList.remove("speaking");
    playBtn.textContent = audio.ended ? "↻ Replay greeting" : "▶ Resume";
    cancelAnimationFrame(rafId);
  });
  audio.addEventListener("ended", () => {
    progress.style.width = "100%";
    caption.textContent = "Ready when you are — choose a company below to begin.";
  });
  audio.addEventListener("timeupdate", () => {
    if (!audio.paused) caption.textContent = `🎙 Jalpa is speaking… ${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
  });
  audio.addEventListener("error", () => {
    caption.textContent = "This browser can't play the voice note (OGG). Try Chrome, Edge or Firefox.";
  });

  playBtn?.addEventListener("click", togglePlay);
  replayBtn?.addEventListener("click", playIntro);

  muteBtn?.addEventListener("click", () => {
    audio.muted = !audio.muted;
    muteBtn.textContent = audio.muted ? "🔈 Voice off" : "🔊 Voice on";
  });
})();
