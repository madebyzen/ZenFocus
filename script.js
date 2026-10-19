(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Settings / storage ----------
  const DEFAULTS = { focus: 25, short: 5, long: 15, auto: false, scene: 'rain', ambient: 'off', vol: 50, vSound: false, vVol: 60 };
  const load = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
  };
  const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

  const settings = Object.assign({}, DEFAULTS, load('zf-settings', {}));
  const saveSettings = () => save('zf-settings', settings);

  const todayKey = () => 'zf-today-' + new Date().toISOString().slice(0, 10);

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
  }

  // ---------- Timer ----------
  const LABELS = { focus: 'Focus time', short: 'Short break', long: 'Long break' };
  const CIRC = 2 * Math.PI * 130;
  const prog = $('prog');
  prog.style.strokeDasharray = CIRC;

  let mode = 'focus';
  let total = settings.focus * 60;
  let remaining = total;
  let running = false;
  let endAt = 0;
  let tickId = null;
  let cycle = 0; // focus sessions completed in the current set of 4

  const fmt = (s) => {
    s = Math.max(0, Math.ceil(s));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };

  function render() {
    $('time').textContent = fmt(remaining);
    $('label').textContent = LABELS[mode];
    prog.style.strokeDashoffset = CIRC * (1 - remaining / total);
    document.title = (running ? fmt(remaining) + ' · ' : '') + 'ZenFocus - Pomodoro Timer';
    $('startBtn').textContent = running ? 'Pause' : (remaining < total ? 'Resume' : 'Start');
    document.querySelectorAll('#dots i').forEach((d, i) => d.classList.toggle('done', i < cycle));
    const n = load(todayKey(), 0);
    $('today').textContent = n ? `Today: ${n} focus session${n === 1 ? '' : 's'} 🌱` : '';
  }

  function setMode(m) {
    mode = m;
    stop();
    total = settings[m] * 60;
    remaining = total;
    document.body.className = document.body.className.replace(/\bm-\w+/g, '').trim() + ' m-' + m;
    document.querySelectorAll('#modeTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
    render();
  }

  function start() {
    if (running) return;
    ensureAudio();
    running = true;
    endAt = Date.now() + remaining * 1000;
    tickId = setInterval(tick, 250);
    render();
  }

  function stop() {
    running = false;
    clearInterval(tickId);
    tickId = null;
  }

  function tick() {
    remaining = (endAt - Date.now()) / 1000;
    if (remaining <= 0) { remaining = 0; complete(); return; }
    render();
  }

  function complete() {
    stop();
    chime();
    let next;
    if (mode === 'focus') {
      save(todayKey(), load(todayKey(), 0) + 1);
      cycle++;
      next = cycle >= 4 ? 'long' : 'short';
      toast(next === 'long' ? 'Great work! Time for a long break 🌙' : 'Focus done! Take a short break ☕');
    } else {
      if (mode === 'long') cycle = 0;
      next = 'focus';
      toast('Break over. Back to focus 🌿');
    }
    notify(next === 'focus' ? 'Break over — time to focus.' : 'Focus session complete — take a break.');
    setMode(next);
    if (settings.auto) start();
  }

  function notify(body) {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification('ZenFocus', { body }); } catch {}
    }
  }

  $('startBtn').addEventListener('click', () => {
    if (running) { stop(); render(); return; }
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    start();
  });
  $('resetBtn').addEventListener('click', () => setMode(mode));
  $('skipBtn').addEventListener('click', () => { remaining = 0; complete(); });
  document.querySelectorAll('#modeTabs .tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  // Settings inputs
  const inputs = { focus: $('sFocus'), short: $('sShort'), long: $('sLong') };
  Object.entries(inputs).forEach(([k, el]) => {
    el.value = settings[k];
    el.addEventListener('change', () => {
      const v = Math.min(+el.max, Math.max(1, Math.round(+el.value) || DEFAULTS[k]));
      el.value = v;
      settings[k] = v;
      saveSettings();
      if (k === mode && !running) setMode(mode);
    });
  });
  $('sAuto').checked = settings.auto;
  $('sAuto').addEventListener('change', (e) => { settings.auto = e.target.checked; saveSettings(); });

  // ---------- Audio (generated, no files needed) ----------
  let ctx = null, master = null, ambientNodes = [];

  function ensureAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = settings.vol / 100;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBuffer(type) {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else if (type === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.15;
      } else {
        d[i] = w;
      }
    }
    return buf;
  }

  function stopAmbient() {
    ambientNodes.forEach((n) => { try { n.stop ? n.stop() : null; } catch {} try { n.disconnect(); } catch {} });
    ambientNodes = [];
  }

  function playAmbient(kind) {
    stopAmbient();
    if (kind === 'off' || !ensureAudio()) return;

    const src = ctx.createBufferSource();
    src.loop = true;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    if (kind === 'rain') {
      src.buffer = noiseBuffer('white');
      filter.type = 'lowpass'; filter.frequency.value = 2500; filter.Q.value = 0.3;
      gain.gain.value = 0.25;
      lfo.frequency.value = 0.15; lfoGain.gain.value = 0.04;
      lfoGain.connect(gain.gain);
    } else if (kind === 'ocean') {
      src.buffer = noiseBuffer('brown');
      filter.type = 'lowpass'; filter.frequency.value = 700;
      gain.gain.value = 0.5;
      lfo.frequency.value = 0.09; lfoGain.gain.value = 0.4;
      lfoGain.connect(gain.gain);
    } else { // wind
      src.buffer = noiseBuffer('pink');
      filter.type = 'bandpass'; filter.frequency.value = 500; filter.Q.value = 0.8;
      gain.gain.value = 0.9;
      lfo.frequency.value = 0.07; lfoGain.gain.value = 300;
      lfoGain.connect(filter.frequency);
    }

    lfo.connect(lfoGain);
    src.connect(filter).connect(gain).connect(master);
    src.start(); lfo.start();
    ambientNodes = [src, lfo, filter, gain, lfoGain];
  }

  function chime() {
    if (!ensureAudio()) return;
    const now = ctx.currentTime;
    [659.25, 880, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = now + i * 0.22;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 1.7);
    });
  }

  $('ambient').value = settings.ambient;
  $('vol').value = settings.vol;
  $('ambient').addEventListener('change', (e) => {
    settings.ambient = e.target.value; saveSettings();
    playAmbient(settings.ambient);
  });
  $('vol').addEventListener('input', (e) => {
    settings.vol = +e.target.value; saveSettings();
    if (master) master.gain.value = settings.vol / 100;
  });
  // Browsers block audio until the user interacts, so resume the saved sound on first click.
  const resumeSound = () => {
    if (settings.ambient !== 'off' && !ambientNodes.length) playAmbient(settings.ambient);
    window.removeEventListener('pointerdown', resumeSound);
  };
  window.addEventListener('pointerdown', resumeSound);

  // ---------- Animated canvas scenes ----------
  const canvas = $('bg');
  const g2 = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, scene = null, particles = [], t0 = performance.now(), rafId = null;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    g2.setTransform(DPR, 0, 0, DPR, 0, 0);
    initParticles();
    drawStill();
  }

  const rnd = (a, b) => a + Math.random() * (b - a);

  function initParticles() {
    particles = [];
    const area = W * H;
    if (scene === 'rain') {
      const n = Math.round(area / 3500);
      for (let i = 0; i < n; i++) particles.push({ x: rnd(0, W), y: rnd(0, H), l: rnd(10, 24), v: rnd(9, 16), a: rnd(0.15, 0.45) });
    } else if (scene === 'stars') {
      const n = Math.round(area / 2500);
      for (let i = 0; i < n; i++) particles.push({ x: rnd(0, W), y: rnd(0, H * 0.85), r: rnd(0.3, 1.6), p: rnd(0, Math.PI * 2), s: rnd(0.5, 2) });
    } else if (scene === 'forest') {
      const n = Math.round(area / 18000) + 20;
      for (let i = 0; i < n; i++) particles.push({ x: rnd(0, W), y: rnd(H * 0.3, H), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), p: rnd(0, Math.PI * 2), r: rnd(1.5, 3) });
    } else if (scene === 'aurora') {
      const n = Math.round(area / 6000);
      for (let i = 0; i < n; i++) particles.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.3, 1.2), p: rnd(0, Math.PI * 2) });
    }
  }

  function grad(stops) {
    const gr = g2.createLinearGradient(0, 0, 0, H);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g2.fillStyle = gr;
    g2.fillRect(0, 0, W, H);
  }

  const draw = {
    rain() {
      grad([[0, '#1b2433'], [1, '#2c3a4d']]);
      g2.strokeStyle = '#aac4e6';
      g2.lineWidth = 1;
      for (const p of particles) {
        g2.globalAlpha = p.a;
        g2.beginPath(); g2.moveTo(p.x, p.y); g2.lineTo(p.x - 2, p.y + p.l); g2.stroke();
        p.y += p.v; p.x -= 0.6;
        if (p.y > H) { p.y = -p.l; p.x = rnd(0, W + 50); }
      }
      g2.globalAlpha = 1;
    },
    aurora(t) {
      grad([[0, '#040a18'], [1, '#0b1e2e']]);
      for (const p of particles) {
        g2.globalAlpha = 0.4 + 0.4 * Math.sin(t + p.p);
        g2.fillStyle = '#fff';
        g2.beginPath(); g2.arc(p.x, p.y, p.r, 0, Math.PI * 2); g2.fill();
      }
      g2.globalCompositeOperation = 'lighter';
      const bands = [['rgba(80,255,170,', 0.35, 0], ['rgba(90,160,255,', 0.25, 2], ['rgba(190,110,255,', 0.18, 4]];
      for (const [col, a, off] of bands) {
        const gr = g2.createLinearGradient(0, H * 0.1, 0, H * 0.7);
        gr.addColorStop(0, col + '0)'); gr.addColorStop(0.5, col + a + ')'); gr.addColorStop(1, col + '0)');
        g2.fillStyle = gr;
        g2.beginPath();
        g2.moveTo(0, H);
        for (let x = 0; x <= W; x += 20) {
          const y = H * 0.35 + Math.sin(x * 0.004 + t * 0.4 + off) * 60 + Math.sin(x * 0.011 + t * 0.7 + off) * 30;
          g2.lineTo(x, y);
        }
        g2.lineTo(W, H * 0.1); g2.lineTo(0, H * 0.1);
        g2.closePath(); g2.fill();
      }
      g2.globalCompositeOperation = 'source-over';
      g2.globalAlpha = 1;
    },
    ocean(t) {
      grad([[0, '#2b1f4a'], [0.35, '#c4577a'], [0.55, '#f7a26b'], [0.56, '#1f3b5c'], [1, '#0d1d33']]);
      const hy = H * 0.555;
      const sun = g2.createRadialGradient(W / 2, hy, 0, W / 2, hy, H * 0.25);
      sun.addColorStop(0, 'rgba(255,220,150,0.9)'); sun.addColorStop(1, 'rgba(255,180,120,0)');
      g2.fillStyle = sun;
      g2.fillRect(0, 0, W, hy);
      for (let i = 0; i < 6; i++) {
        const y = hy + (H - hy) * (i / 6) + 8;
        g2.strokeStyle = `rgba(255,200,160,${0.25 - i * 0.03})`;
        g2.lineWidth = 1.5;
        g2.beginPath();
        for (let x = 0; x <= W; x += 10) g2.lineTo(x, y + Math.sin(x * 0.02 + t * (1 + i * 0.2) + i) * (2 + i));
        g2.stroke();
      }
    },
    stars(t) {
      grad([[0, '#02030a'], [1, '#141a35']]);
      g2.fillStyle = '#fff';
      for (const p of particles) {
        g2.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * p.s + p.p));
        g2.beginPath(); g2.arc(p.x, p.y, p.r, 0, Math.PI * 2); g2.fill();
      }
      g2.globalAlpha = 1;
      g2.fillStyle = '#06080f';
      g2.beginPath(); g2.moveTo(0, H);
      for (let x = 0; x <= W; x += 30) g2.lineTo(x, H * 0.86 + Math.sin(x * 0.006) * 25 + Math.sin(x * 0.017) * 10);
      g2.lineTo(W, H); g2.closePath(); g2.fill();
    },
    forest(t) {
      grad([[0, '#06140f'], [1, '#0f2a1c']]);
      g2.fillStyle = '#030a07';
      for (let i = 0; i < 14; i++) {
        const x = (i / 13) * W, h = H * (0.35 + ((i * 37) % 10) / 30);
        g2.beginPath(); g2.moveTo(x - 50, H); g2.lineTo(x, H - h); g2.lineTo(x + 50, H); g2.fill();
      }
      g2.globalCompositeOperation = 'lighter';
      for (const p of particles) {
        p.vx += rnd(-0.03, 0.03); p.vy += rnd(-0.03, 0.03);
        p.vx *= 0.98; p.vy *= 0.98;
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < H * 0.2) p.y = H; if (p.y > H) p.y = H * 0.2;
        const a = 0.5 + 0.5 * Math.sin(t * 1.5 + p.p);
        const gl = g2.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        gl.addColorStop(0, `rgba(220,255,120,${a})`); gl.addColorStop(1, 'rgba(220,255,120,0)');
        g2.fillStyle = gl;
        g2.beginPath(); g2.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2); g2.fill();
      }
      g2.globalCompositeOperation = 'source-over';
    },
  };

  // ---------- Still scenes (drawn once, no motion) ----------
  // Seeded random so a still scene looks the same after every resize.
  let seed = 1;
  const srnd = (a, b) => { seed = (seed * 16807) % 2147483647; return a + ((seed - 1) / 2147483646) * (b - a); };

  function ridge(base, amp, color, s, step = 8) {
    seed = s;
    const ph = [srnd(0, 6), srnd(0, 6), srnd(0, 6)];
    g2.fillStyle = color;
    g2.beginPath(); g2.moveTo(0, H);
    for (let x = 0; x <= W + step; x += step) {
      const y = base - amp * (0.55 * Math.sin(x * 0.0023 + ph[0]) + 0.3 * Math.sin(x * 0.0061 + ph[1]) + 0.15 * Math.sin(x * 0.017 + ph[2]));
      g2.lineTo(x, y);
    }
    g2.lineTo(W, H); g2.closePath(); g2.fill();
  }

  function glow(x, y, r, inner, outer) {
    const gr = g2.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g2.fillStyle = gr;
    g2.fillRect(0, 0, W, H);
  }

  function cloud(x, y, w, a) {
    for (let i = 0; i < 7; i++) {
      const cx = x + srnd(-w / 2, w / 2), cy = y + srnd(-w * 0.08, w * 0.08), r = srnd(w * 0.15, w * 0.3);
      const gr = g2.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = gr;
      g2.beginPath(); g2.arc(cx, cy, r, 0, Math.PI * 2); g2.fill();
    }
  }

  function mist(y, h, a) {
    const gr = g2.createLinearGradient(0, y - h, 0, y + h);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = gr;
    g2.fillRect(0, y - h, W, h * 2);
  }

  const still = {
    mountains() {
      grad([[0, '#6f8fb8'], [0.45, '#e9b7a4'], [0.7, '#f6d9b8'], [1, '#f6d9b8']]);
      glow(W * 0.62, H * 0.52, H * 0.4, 'rgba(255,236,200,0.9)', 'rgba(255,236,200,0)');
      ridge(H * 0.58, H * 0.2, '#9aa6c4', 11);
      mist(H * 0.62, H * 0.05, 0.35);
      ridge(H * 0.68, H * 0.16, '#6f7ea3', 23);
      mist(H * 0.72, H * 0.05, 0.25);
      ridge(H * 0.8, H * 0.12, '#47567c', 37);
      ridge(H * 0.92, H * 0.08, '#2a3554', 41);
    },
    lake() {
      const hy = H * 0.6;
      const sky = g2.createLinearGradient(0, 0, 0, hy);
      sky.addColorStop(0, '#9cc7e0'); sky.addColorStop(1, '#f3e3cf');
      g2.fillStyle = sky; g2.fillRect(0, 0, W, hy);
      seed = 5;
      cloud(W * 0.25, H * 0.18, W * 0.22, 0.5); cloud(W * 0.75, H * 0.12, W * 0.18, 0.4);
      ridge(hy, H * 0.12, '#7c9cab', 7);
      ridge(hy, H * 0.06, '#4f7480', 19);
      // Water mirrors the sky, darker towards the viewer.
      const wat = g2.createLinearGradient(0, hy, 0, H);
      wat.addColorStop(0, '#d9dfd6'); wat.addColorStop(0.4, '#8db6c9'); wat.addColorStop(1, '#3e6577');
      g2.fillStyle = wat; g2.fillRect(0, hy, W, H - hy);
      g2.save(); g2.globalAlpha = 0.3; g2.translate(0, hy * 2); g2.scale(1, -1);
      ridge(hy, H * 0.12, '#7c9cab', 7); ridge(hy, H * 0.06, '#4f7480', 19);
      g2.restore();
      g2.fillStyle = 'rgba(255,255,255,0.18)';
      seed = 3;
      for (let i = 0; i < 40; i++) {
        const y = srnd(hy + 4, H), w = srnd(20, 120) * (y / H);
        g2.fillRect(srnd(0, W), y, w, 1);
      }
    },
    meadow() {
      grad([[0, '#8ec5ea'], [0.6, '#dff1f7'], [1, '#dff1f7']]);
      glow(W * 0.2, H * 0.15, H * 0.35, 'rgba(255,250,220,0.8)', 'rgba(255,250,220,0)');
      seed = 9;
      cloud(W * 0.55, H * 0.16, W * 0.25, 0.7); cloud(W * 0.85, H * 0.26, W * 0.16, 0.6); cloud(W * 0.15, H * 0.32, W * 0.14, 0.5);
      ridge(H * 0.66, H * 0.07, '#a9cf9a', 13, 12);
      ridge(H * 0.76, H * 0.08, '#86bb73', 29, 12);
      ridge(H * 0.88, H * 0.07, '#5f9a51', 31, 12);
      seed = 17;
      for (let i = 0; i < 160; i++) {
        const x = srnd(0, W), y = srnd(H * 0.8, H);
        g2.fillStyle = ['#fff7d6', '#ffd1dc', '#f9e27d'][i % 3];
        g2.globalAlpha = 0.8;
        g2.beginPath(); g2.arc(x, y, srnd(1, 2.6) * (y / H), 0, Math.PI * 2); g2.fill();
      }
      g2.globalAlpha = 1;
    },
    lavender() {
      grad([[0, '#3d3a6e'], [0.4, '#a77fb8'], [0.62, '#f3c3b0'], [1, '#f3c3b0']]);
      glow(W * 0.5, H * 0.6, H * 0.35, 'rgba(255,220,190,0.9)', 'rgba(255,220,190,0)');
      ridge(H * 0.62, H * 0.04, '#6c5a8f', 3);
      const hy = H * 0.62;
      const field = g2.createLinearGradient(0, hy, 0, H);
      field.addColorStop(0, '#7a62a6'); field.addColorStop(1, '#3f2b63');
      g2.fillStyle = field; g2.fillRect(0, hy, W, H - hy);
      // Rows of lavender converging on the horizon.
      for (let i = -12; i <= 12; i++) {
        g2.strokeStyle = 'rgba(190,150,230,0.55)';
        g2.lineWidth = 1.5;
        g2.beginPath(); g2.moveTo(W / 2 + i * 6, hy); g2.lineTo(W / 2 + i * W * 0.12, H); g2.stroke();
        g2.strokeStyle = 'rgba(40,25,70,0.35)';
        g2.beginPath(); g2.moveTo(W / 2 + i * 6 + 3, hy); g2.lineTo(W / 2 + i * W * 0.12 + W * 0.06, H); g2.stroke();
      }
    },
    clouds() {
      grad([[0, '#a9c6ef'], [0.5, '#e7d7f0'], [1, '#fbe3d9']]);
      seed = 21;
      for (let i = 0; i < 9; i++) cloud(srnd(0, W), srnd(H * 0.1, H * 0.9), srnd(W * 0.15, W * 0.35), srnd(0.35, 0.6));
    },
  };

  function drawStill() {
    if (still[scene]) still[scene]();
  }

  function loop(now) {
    const t = (now - t0) / 1000;
    if (draw[scene]) draw[scene](t);
    rafId = requestAnimationFrame(loop);
  }

  // ---------- Video background ----------
  const videoLayer = $('videoLayer'), ytFrame = $('ytFrame'), fileVideo = $('fileVideo');
  let fileUrl = null;

  function ytId(url) {
    url = url.trim();
    if (/^[\w-]{11}$/.test(url)) return url;
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12);
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(embed|live|shorts|v)\/([\w-]{11})/);
      if (m) return m[2];
    } catch {}
    return null;
  }

  function playYouTube(id) {
    clearFile();
    ytFrame.classList.remove('hidden');
    ytFrame.src = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`;
    videoLayer.classList.remove('hidden');
    $('vhint').textContent = settings.vSound ? 'Playing with video sound.' : 'Playing muted. Turn on video sound to hear it.';
  }

  // Talk to the YouTube player through its iframe API messages.
  function ytCmd(func, args = []) {
    try { ytFrame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch {}
  }

  function applyVideoSound() {
    $('vSoundBtn').textContent = settings.vSound ? '🔊 Video sound on' : '🔇 Video sound off';
    $('vSoundBtn').classList.toggle('on', settings.vSound);
    $('vVol').value = settings.vVol;
    fileVideo.muted = !settings.vSound;
    fileVideo.volume = settings.vVol / 100;
    if (settings.vSound) { ytCmd('unMute'); ytCmd('setVolume', [settings.vVol]); ytCmd('playVideo'); }
    else ytCmd('mute');
  }

  // The player needs a moment after loading before it accepts commands.
  ytFrame.addEventListener('load', () => {
    if (ytFrame.src === 'about:blank') return;
    try { ytFrame.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*'); } catch {}
    [300, 1200, 3000].forEach((ms) => setTimeout(applyVideoSound, ms));
  });

  $('vSoundBtn').addEventListener('click', () => {
    settings.vSound = !settings.vSound; saveSettings();
    applyVideoSound();
    if (!videoLayer.classList.contains('hidden')) $('vhint').textContent = settings.vSound ? 'Video sound on.' : 'Video muted.';
  });
  $('vVol').addEventListener('input', (e) => {
    settings.vVol = +e.target.value; saveSettings();
    applyVideoSound();
  });
  applyVideoSound();

  function clearFile() {
    fileVideo.pause();
    fileVideo.removeAttribute('src');
    fileVideo.classList.add('hidden');
    if (fileUrl) { URL.revokeObjectURL(fileUrl); fileUrl = null; }
  }

  function clearVideo() {
    clearFile();
    ytFrame.src = 'about:blank';
    videoLayer.classList.add('hidden');
  }

  $('ytGo').addEventListener('click', () => {
    const id = ytId($('ytLink').value);
    if (!id) { $('vhint').textContent = 'That does not look like a YouTube link.'; return; }
    save('zf-yt', id);
    playYouTube(id);
  });
  $('ytLink').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ytGo').click(); });
  // Pasting a link plays it straight away.
  $('ytLink').addEventListener('paste', () => setTimeout(() => { if (ytId($('ytLink').value)) $('ytGo').click(); }, 0));
  $('ytPaste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      $('ytLink').value = text.trim();
      if (ytId(text)) $('ytGo').click();
      else $('vhint').textContent = 'The copied text is not a YouTube link.';
    } catch {
      $('ytLink').focus();
      $('vhint').textContent = 'Press Ctrl+V (or long-press and Paste) in the box.';
    }
  });
  $('ytLofi').addEventListener('click', () => { save('zf-yt', 'jfKfPfyJRdk'); playYouTube('jfKfPfyJRdk'); });
  $('fileIn').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    clearFile();
    ytFrame.src = 'about:blank';
    ytFrame.classList.add('hidden');
    fileUrl = URL.createObjectURL(f);
    fileVideo.src = fileUrl;
    fileVideo.classList.remove('hidden');
    videoLayer.classList.remove('hidden');
    applyVideoSound();
    fileVideo.play().catch(() => {});
    $('vhint').textContent = 'Playing: ' + f.name;
  });

  // ---------- Scene switching ----------
  function setScene(s) {
    scene = s;
    settings.scene = s; saveSettings();
    document.querySelectorAll('#scenes .scene').forEach((b) => b.classList.toggle('active', b.dataset.scene === s));
    const isVideo = s === 'video';
    $('vbox').classList.toggle('hidden', !isVideo);
    if (isVideo) {
      cancelAnimationFrame(rafId); rafId = null;
      const last = load('zf-yt', null);
      if (last && videoLayer.classList.contains('hidden')) playYouTube(last);
    } else if (still[s]) {
      clearVideo();
      cancelAnimationFrame(rafId); rafId = null;
      drawStill();
    } else {
      clearVideo();
      initParticles();
      if (!rafId) rafId = requestAnimationFrame(loop);
    }
  }
  document.querySelectorAll('#scenes .scene').forEach((b) => b.addEventListener('click', () => setScene(b.dataset.scene)));

  // ---------- Panel hide / fullscreen / shortcuts ----------
  const togglePanel = () => document.body.classList.toggle('panel-hidden');
  $('hideBtn').addEventListener('click', togglePanel);
  $('fsBtn').addEventListener('click', () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'h' || e.key === 'H') togglePanel();
    else if (e.code === 'Space') { e.preventDefault(); $('startBtn').click(); }
  });

  // ---------- Init ----------
  window.addEventListener('resize', resize);
  resize();
  setScene(draw[settings.scene] || still[settings.scene] || settings.scene === 'video' ? settings.scene : 'rain');
  setMode('focus');
})();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
