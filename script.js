/* Nwjjyy 1.0 · 原生交互，无第三方依赖。 */
(() => {
  "use strict";

  const supplied = window.SITE_CONFIG || {};
  const config = {
    title: "nwjjyy",
    welcome: "欢迎来到 nwjjyy 的小世界",
    subtitle: "这里藏着一些只属于我们的小惊喜。",
    ...supplied,
    bunny: { speech: "你咋这样！", surprise: "被你发现啦！", ...supplied.bunny },
    audio: {
      enabled: false,
      path: "assets/audio/ni-za-yang.mp3",
      title: "专属声音，待收藏",
      emptyText: "等一段特别的声音到来。",
      ...supplied.audio
    },
    note: {
      title: "留一页，给以后",
      text: "这里还没有写下故事。等一个值得记住的瞬间，再慢慢填上。",
      ...supplied.note
    },
    anniversary: { date: "", title: "属于我们的纪念日", ...supplied.anniversary }
  };

  const byId = (id) => document.getElementById(id);
  const write = (id, value) => {
    const element = byId(id);
    if (element && typeof value === "string") element.textContent = value;
  };

  // 只接受本地相对资源，避免误填远程网址或可执行 URL。
  function localPath(value) {
    if (typeof value !== "string") return "";
    const path = value.trim();
    if (!path || /^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(path) || /[\\?#]/.test(path)) return "";
    try {
      const parts = decodeURIComponent(path).split("/");
      if (parts.some((part) => part === ".." || /[:\\\u0000-\u001f]/.test(part))) return "";
      return path;
    } catch {
      return "";
    }
  }

  write("site-title", config.title);
  write("welcome-title", config.welcome);
  write("welcome-subtitle", config.subtitle);
  document.title = config.title;
  write("note-title", config.note.title);
  write("note-text", config.note.text);

  function setupBunny() {
    const stage = byId("bunny-stage");
    const bubble = byId("speech-bubble");
    if (!stage || !bubble) return;

    const particles = byId("surprise-particles");
    let stepTimer;
    let speechTimer;
    let surpriseTimer;
    let announceTimer;
    let taps = [];

    function announce(text) {
      const status = byId("interaction-status");
      if (!status) return;
      clearTimeout(announceTimer);
      status.textContent = "";
      announceTimer = setTimeout(() => { status.textContent = text; }, 40);
    }

    function showSpeech(text) {
      bubble.textContent = text;
      bubble.classList.add("show");
      bubble.setAttribute("aria-hidden", "false");
      announce(text);
    }

    function hideSpeech() {
      bubble.classList.remove("show");
      bubble.setAttribute("aria-hidden", "true");
    }

    function sprinkle() {
      if (!particles) return;
      particles.replaceChildren();
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < 9; index += 1) {
        const particle = document.createElement("span");
        particle.className = "surprise-particle";
        particle.style.setProperty("--x", `${Math.round((index - 4) * 31 + Math.random() * 15)}px`);
        particle.style.setProperty("--y", `${-Math.round(110 + Math.random() * 125)}px`);
        particle.style.setProperty("--r", `${Math.round(Math.random() * 180 - 90)}deg`);
        particle.style.setProperty("--delay", `${index * 0.035}s`);
        fragment.append(particle);
      }
      particles.append(fragment);
    }

    function interact() {
      const now = performance.now();
      taps = taps.filter((time) => now - time <= 1400);
      taps.push(now);

      clearTimeout(stepTimer);
      clearTimeout(speechTimer);
      stage.classList.remove("is-stepping");
      // 确保重复轻点也会从第一帧重新开始两脚的动作。
      void stage.offsetWidth;
      stage.classList.add("is-stepping");
      stepTimer = setTimeout(() => { stage.classList.remove("is-stepping"); }, 1700);

      if (taps.length >= 3) {
        taps = [];
        clearTimeout(surpriseTimer);
        stage.classList.add("is-surprised");
        showSpeech(config.bunny.surprise);
        sprinkle();
        surpriseTimer = setTimeout(() => {
          stage.classList.remove("is-surprised");
          particles?.replaceChildren();
          hideSpeech();
        }, 3000);
      } else if (!stage.classList.contains("is-surprised")) {
        showSpeech(config.bunny.speech);
        speechTimer = setTimeout(hideSpeech, 2100);
      }
    }

    byId("bunny-button")?.addEventListener("click", interact);
    byId("pet-button")?.addEventListener("click", interact);
  }

  const svgNS = "http://www.w3.org/2000/svg";
  function svgElement(tag, attributes) {
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  function placeholder(index, failed = false) {
    const holder = document.createElement("div");
    holder.className = "memory-photo memory-placeholder is-placeholder";
    const svg = svgElement("svg", {
      viewBox: "0 0 120 100", class: "placeholder-art", fill: "none", "aria-hidden": "true"
    });
    // 三个原创线描：小相机、嫩芽、小山。明确是插画占位，没有真实照片。
    const designs = [
      [
        ["path", { d: "M32 31h13l5-8h21l5 8h12a9 9 0 0 1 9 9v36a9 9 0 0 1-9 9H32a9 9 0 0 1-9-9V40a9 9 0 0 1 9-9Z" }],
        ["circle", { cx: "60", cy: "57", r: "17" }],
        ["path", { d: "M51 55a10 10 0 0 1 12-8M83 42h2M23 43h18M90 17v-7M86 14h8" }]
      ],
      [
        ["path", { d: "M60 82V44M60 62C36 64 26 50 26 36c20-1 34 8 34 26ZM60 48c0-22 14-31 33-30 0 20-14 32-33 30ZM41 82h38M37 88h46M24 20v10M19 25h10M97 62v8M93 66h8" }]
      ],
      [
        ["path", { d: "M16 79 46 42l21 27 15-17 24 27H16ZM38 52l8 5 7-5M16 87h90M79 23a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM20 24h17M24 18h19" }]
      ]
    ];
    for (const [tag, attributes] of designs[index % designs.length]) svg.append(svgElement(tag, attributes));
    const label = document.createElement("span");
    label.className = "placeholder-label";
    label.textContent = failed ? "照片暂时无法显示" : "照片待添加";
    holder.append(svg, label);
    return holder;
  }

  function renderMemories() {
    const grid = byId("memory-grid");
    // 配置缺失或数组无效时保留 HTML 的占位内容。
    if (!grid || !Array.isArray(config.memories) || !config.memories.length) return;
    const fragment = document.createDocumentFragment();
    config.memories.forEach((memory, index) => {
      if (!memory || typeof memory !== "object") return;
      const figure = document.createElement("figure");
      figure.className = "memory-card";
      const imagePath = localPath(memory.image);
      if (imagePath) {
        const holder = document.createElement("div");
        holder.className = "memory-photo";
        const image = document.createElement("img");
        image.alt = memory.alt || memory.title || "记忆照片";
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => { holder.replaceWith(placeholder(index, true)); }, { once: true });
        image.src = imagePath;
        holder.append(image);
        figure.append(holder);
      } else {
        figure.append(placeholder(index));
      }
      const caption = document.createElement("figcaption");
      const number = document.createElement("span");
      number.className = "memory-number memory-index";
      number.textContent = String(index + 1).padStart(2, "0");
      const title = document.createElement("h3");
      title.textContent = memory.title || "一段待收藏的记忆";
      const text = document.createElement("p");
      text.textContent = memory.caption || "照片与故事，等以后慢慢补上。";
      caption.append(number, title, text);
      figure.append(caption);
      fragment.append(figure);
    });
    if (fragment.childElementCount) grid.replaceChildren(fragment);
  }

  function renderAnniversary() {
    write("anniversary-label", config.anniversary.title);
    const raw = config.anniversary.date;
    const match = typeof raw === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    const date = match && new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const valid = date && date.getFullYear() === Number(match[1]) &&
      date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
    if (!valid) {
      write("anniversary-value", "日期待填写");
      write("anniversary-note", "给一个特别的日子，留个位置。");
      return;
    }
    const today = new Date();
    // 使用日历日期计算，避免午夜与夏令时改变天数。
    const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const targetDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.round((todayDay - targetDay) / 86400000);
    write("anniversary-value", `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`);
    write("anniversary-note", days < 0 ? `还有 ${Math.abs(days)} 天，等这一天到来。` : days === 0 ? "就是今天，记住这一刻。" : `这个特别的日子，已经过去 ${days} 天。`);
  }

  function setupAudio() {
    const audio = byId("memory-audio");
    const button = byId("audio-play");
    const progress = byId("audio-progress");
    if (!audio || !button || !progress) return;
    write("audio-title", config.audio.title);
    let ready = false;
    let loadRequested = false;
    let playRequest = 0;
    const label = button.querySelector("[data-play-label]");
    const formatTime = (seconds) => {
      const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
      return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
    };
    const setPlayState = (playing) => {
      button.setAttribute("aria-pressed", String(playing));
      button.dataset.state = playing ? "playing" : "paused";
      if (ready) button.setAttribute("aria-label", playing ? "暂停声音" : "播放声音");
      if (label) label.textContent = playing ? "暂停" : ready ? "播放声音" : "等待声音";
    };
    function updateProgress() {
      const duration = ready ? audio.duration : NaN;
      const hasDuration = Number.isFinite(duration) && duration > 0;
      const currentTime = ready && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      progress.disabled = !ready || !hasDuration;
      progress.value = hasDuration ? String(Math.min(100, Math.max(0, currentTime / duration * 100))) : "0";
      progress.style.setProperty("--progress", `${progress.value}%`);
      write("audio-current", formatTime(currentTime));
      write("audio-duration", formatTime(duration));
    }
    function emptyState() {
      ready = false;
      loadRequested = false;
      playRequest += 1;
      audio.pause();
      button.disabled = true;
      progress.disabled = true;
      button.setAttribute("aria-label", "声音尚未添加");
      setPlayState(false);
      write("audio-status", config.audio.emptyText);
      write("audio-current", "0:00");
      write("audio-duration", "0:00");
      progress.value = "0";
      progress.style.setProperty("--progress", "0%");
      button.dataset.state = "empty";
    }

    function syncReadiness(canPlay = false) {
      if (!loadRequested) return;
      const hasDuration = Number.isFinite(audio.duration) && audio.duration > 0;
      // 有些 MP3 的时长会稍后才确定；可播放时先允许播放，时长未知时不开放跳转。
      if (!ready && (hasDuration || canPlay || audio.readyState >= 3)) {
        ready = true;
        button.disabled = false;
        setPlayState(!audio.paused);
        write("audio-status", audio.paused ? "轻轻一点，让声音回到这里。" : "正在播放这段珍藏的声音。");
      }
      updateProgress();
    }

    audio.addEventListener("loadedmetadata", () => { syncReadiness(); });
    audio.addEventListener("canplay", () => { syncReadiness(true); });
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("durationchange", () => { syncReadiness(); });
    audio.addEventListener("play", () => {
      setPlayState(true);
      write("audio-status", "正在播放这段珍藏的声音。");
    });
    audio.addEventListener("pause", () => {
      setPlayState(false);
      if (ready && !audio.ended) write("audio-status", "已暂停，想听的时候再继续。");
    });
    audio.addEventListener("ended", () => {
      setPlayState(false);
      write("audio-status", "听完啦，随时可以再听一次。");
      updateProgress();
    });
    audio.addEventListener("error", emptyState);

    button.addEventListener("click", async () => {
      if (!ready) return;
      if (!audio.paused) {
        playRequest += 1;
        audio.pause();
        return;
      }
      const request = ++playRequest;
      try {
        if (audio.ended) audio.currentTime = 0;
        await audio.play();
      } catch {
        if (request !== playRequest) return;
        setPlayState(false);
        write("audio-status", "这次没有播放成功，轻点播放再试试。");
      }
    });
    progress.addEventListener("input", () => {
      if (ready && Number.isFinite(audio.duration)) {
        audio.currentTime = Number(progress.value) / 100 * audio.duration;
        updateProgress();
      }
    });

    emptyState();
    const path = localPath(config.audio.path);
    if (config.audio.enabled === true && path) {
      loadRequested = true;
      button.dataset.state = "loading";
      button.setAttribute("aria-label", "声音正在准备中");
      write("audio-status", "声音正在准备中…");
      audio.preload = "metadata";
      audio.src = path;
      audio.load();
    }
  }

  function setupNavigation() {
    const links = [...document.querySelectorAll(".nav-link")];
    const sections = links.map((link) => document.getElementById(link.hash.slice(1))).filter(Boolean);
    if (!("IntersectionObserver" in window)) return;
    const visible = new Map();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
      const current = sections.find((section) => visible.get(section.id));
      if (!current) return;
      for (const link of links) {
        const active = link.hash === `#${current.id}`;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    }, { rootMargin: "-15% 0px -40% 0px", threshold: 0 });
    sections.forEach((section) => observer.observe(section));
  }

  setupBunny();
  renderMemories();
  renderAnniversary();
  setupAudio();
  setupNavigation();
  document.documentElement.classList.add("js-ready");
})();
