import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist', 'client');
const outDir = resolve(root, 'dist', 'trailer');
const outFile = resolve(outDir, 'taaranight-real-gameplay.mp4');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const width = 1280;
const height = 720;
const fps = 15;

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

if (!existsSync(join(dist, 'game.html'))) {
  throw new Error('Build first: npm run build');
}
if (!existsSync(chromePath)) {
  throw new Error(`Chrome not found at ${chromePath}`);
}

mkdirSync(outDir, { recursive: true });
const framesDir = await mkdtemp(join(tmpdir(), 'taara-real-trailer-'));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const cleanPath = url.pathname === '/' ? '/splash.html' : url.pathname;
    const file = resolve(dist, `.${decodeURIComponent(cleanPath)}`);
    if (!file.startsWith(dist) || !existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolveServer({ server, port: address.port });
    });
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 1;
    this.pending = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id) return;
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result);
    };
  }

  send(method, params = {}) {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function waitForChrome(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error('Chrome did not expose a DevTools endpoint');
}

async function connectChrome(startUrl) {
  const debugPort = 9337;
  const profile = await mkdtemp(join(tmpdir(), 'taara-chrome-profile-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    `--window-size=${width},${height}`,
    '--force-device-scale-factor=1',
    startUrl,
  ]);
  chrome.stderr.on('data', () => {});

  const wsUrl = await waitForChrome(debugPort);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Input.setIgnoreInputEvents', { ignore: false });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  return { cdp, chrome, profile };
}

async function evalValue(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
    throw new Error(detail ?? 'Runtime evaluation failed');
  }
  return result.result.value;
}

async function waitFor(cdp, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evalValue(cdp, expression)) return;
    } catch {
      // The page may be between navigations or the app bundle may still be
      // installing globals. Keep polling until the timeout decides.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function caption(cdp, beat, progress = 1) {
  const data = typeof beat === 'string' ? { title: beat } : beat;
  await evalValue(
    cdp,
    `(() => {
      let el = document.getElementById('trailer-caption');
      if (!el) {
        el = document.createElement('div');
        el.id = 'trailer-caption';
        el.innerHTML = '<div data-role="eyebrow"></div><div data-role="title"></div><div data-role="body"></div>';
        el.style.cssText = [
          'position:fixed',
          'left:56px',
          'top:118px',
          'z-index:999999',
          'width:min(390px,calc(100vw - 112px))',
          'padding:0 0 0 18px',
          'border-left:2px solid rgba(255,217,143,.86)',
          'color:#fff7df',
          'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
          'text-align:left',
          'text-shadow:0 2px 18px rgba(0,0,0,.9),0 0 18px rgba(255,223,159,.22)',
          'pointer-events:none'
        ].join(';');
        const eyebrow = el.querySelector('[data-role="eyebrow"]');
        eyebrow.style.cssText = [
          'margin:0 0 9px',
          'color:rgba(255,220,150,.88)',
          'font:700 12px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
          'letter-spacing:.18em',
          'text-transform:uppercase'
        ].join(';');
        const title = el.querySelector('[data-role="title"]');
        title.style.cssText = [
          'margin:0',
          'color:#fff7df',
          'font:800 34px/1.04 Georgia,Times New Roman,serif',
          'letter-spacing:0'
        ].join(';');
        const body = el.querySelector('[data-role="body"]');
        body.style.cssText = [
          'margin:12px 0 0',
          'color:rgba(245,239,224,.9)',
          'font:600 17px/1.42 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
          'letter-spacing:0'
        ].join(';');
        document.body.appendChild(el);
      }
      const beat = ${JSON.stringify(data)};
      const progress = ${progress};
      const typed = (text, start, span) => {
        if (!text) return '';
        const p = Math.max(0, Math.min(1, (progress - start) / span));
        return text.slice(0, Math.round(text.length * p));
      };
      const placements = {
        title: { left: '50%', right: 'auto', top: '58px', transform: 'translateX(-50%)', width: 'min(700px,calc(100vw - 112px))', textAlign: 'center', borderLeft: '0', borderRight: '0', padding: '0' },
        left: { left: '56px', right: 'auto', top: '118px', transform: 'none', width: 'min(390px,calc(100vw - 112px))', textAlign: 'left', borderLeft: '2px solid rgba(255,217,143,.86)', borderRight: '0', padding: '0 0 0 18px' },
        midleft: { left: '56px', right: 'auto', top: '178px', transform: 'none', width: 'min(390px,calc(100vw - 112px))', textAlign: 'left', borderLeft: '2px solid rgba(255,217,143,.86)', borderRight: '0', padding: '0 0 0 18px' },
        right: { left: 'auto', right: '56px', top: '150px', transform: 'none', width: 'min(390px,calc(100vw - 112px))', textAlign: 'right', borderLeft: '0', borderRight: '2px solid rgba(255,217,143,.86)', padding: '0 18px 0 0' }
      };
      const place = placements[beat.place || 'left'];
      Object.assign(el.style, place);

      const eyebrow = el.querySelector('[data-role="eyebrow"]');
      const title = el.querySelector('[data-role="title"]');
      const body = el.querySelector('[data-role="body"]');
      eyebrow.textContent = beat.eyebrow || '';
      title.textContent = beat.type === false ? beat.title || '' : typed(beat.title || '', 0, 0.54);
      body.textContent = beat.type === false ? beat.body || '' : typed(beat.body || '', 0.46, 0.54);
      eyebrow.style.display = beat.eyebrow ? 'block' : 'none';
      title.style.display = beat.title ? 'block' : 'none';
      body.style.display = beat.body ? 'block' : 'none';
      return true;
    })()`
  );
}

async function pointer(cdp, x, y, active = false) {
  await evalValue(
    cdp,
    `(() => {
      let el = document.getElementById('trailer-pointer');
      if (!el) {
        el = document.createElement('div');
        el.id = 'trailer-pointer';
        el.innerHTML = '<div></div>';
        el.style.cssText = [
          'position:fixed',
          'z-index:1000000',
          'width:40px',
          'height:40px',
          'margin:-20px 0 0 -20px',
          'border-radius:999px',
          'border:2px solid rgba(255,229,157,.95)',
          'box-shadow:0 0 0 7px rgba(255,229,157,.18),0 0 28px rgba(255,229,157,.78)',
          'pointer-events:none',
          'opacity:0',
          'transition:opacity .12s ease, transform .12s ease'
        ].join(';');
        el.firstChild.style.cssText = [
          'position:absolute',
          'left:50%',
          'top:50%',
          'width:8px',
          'height:8px',
          'margin:-4px 0 0 -4px',
          'border-radius:999px',
          'background:#fff3bd'
        ].join(';');
        document.body.appendChild(el);
      }
      el.style.left = '${x}px';
      el.style.top = '${y}px';
      el.style.opacity = '1';
      el.style.transform = 'scale(${active ? 0.74 : 1})';
      return true;
    })()`
  );
}

async function hidePointer(cdp) {
  await evalValue(cdp, `document.getElementById('trailer-pointer')?.style.setProperty('opacity', '0'); true`);
}

let frame = 0;
async function snap(cdp) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const path = join(framesDir, `frame_${String(frame++).padStart(5, '0')}.png`);
  writeFileSync(path, Buffer.from(shot.data, 'base64'));
}

async function captureFor(cdp, seconds, text) {
  const count = Math.max(1, Math.round(seconds * fps));
  for (let i = 0; i < count; i++) {
    if (text) await caption(cdp, text, Math.min(1, i / Math.max(1, count * 0.36)));
    await snap(cdp);
    await delay(1000 / fps);
  }
}

async function click(cdp, x, y) {
  await pointer(cdp, x, y, false);
  await snap(cdp);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await pointer(cdp, x, y, true);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await delay(70);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await pointer(cdp, x, y, false);
  await snap(cdp);
}

async function drag(cdp, from, to) {
  await pointer(cdp, from.x, from.y, false);
  await snap(cdp);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, button: 'none' });
  await pointer(cdp, from.x, from.y, true);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    const p = i / 8;
    const x = from.x + (to.x - from.x) * p;
    const y = from.y + (to.y - from.y) * p;
    await pointer(cdp, x, y, true);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'left',
    });
    await delay(35);
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
  await pointer(cdp, to.x, to.y, false);
}

async function starPosition(cdp, id) {
  return evalValue(
    cdp,
    `(() => {
      const play = window.__TAARA_GAME__.scene.getScene('Play');
      const star = play.byId.get(${id});
      return { x: star.container.x, y: star.container.y };
    })()`
  );
}

async function renderVideo() {
  const duration = frame / fps;
  const audio =
    `sine=frequency=130.81:duration=${duration}[root];` +
    `sine=frequency=155.56:duration=${duration}[minor];` +
    `sine=frequency=196.00:duration=${duration}[fifth];` +
    `sine=frequency=4380:duration=${duration}[cr1];` +
    `sine=frequency=4820:duration=${duration}[cr2];` +
    `anoisesrc=color=brown:duration=${duration}:amplitude=0.05[wind];` +
    '[root]volume=0.045[vroot];[minor]volume=0.018[vminor];[fifth]volume=0.018[vfifth];' +
    '[cr1]volume=0.006,apulsator=hz=0.18:amount=0.85[vcr1];[cr2]volume=0.004,apulsator=hz=0.13:amount=0.85[vcr2];' +
    `[vroot][vminor][vfifth][wind][vcr1][vcr2]amix=inputs=6:duration=first,lowpass=f=5200,afade=t=in:st=0:d=1.4,afade=t=out:st=${Math.max(0, duration - 2.2)}:d=2.2[a]`;

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-framerate',
      String(fps),
      '-i',
      join(framesDir, 'frame_%05d.png'),
      '-filter_complex',
      audio,
      '-map',
      '0:v',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '18',
      '-preset',
      'medium',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outFile,
    ]);
    ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

const { server, port } = await serve();
const base = `http://127.0.0.1:${port}`;
const { cdp, chrome, profile } = await connectChrome(`${base}/splash.html`);

try {
  await waitFor(cdp, 'document.readyState === "complete"');
  await captureFor(cdp, 4.8, {
    place: 'title',
    eyebrow: 'TaaraNight',
    title: 'One constellation story a night.',
    body: 'A daily sky ritual built for Reddit.',
  });

  await cdp.send('Page.navigate', { url: `${base}/game.html?capture=1` });
  await waitFor(cdp, '!!window.__TAARA_GAME__ && window.__TAARA_GAME__.scene.getScene("MainMenu").scene.isActive()');
  await captureFor(cdp, 4.4, {
    place: 'left',
    eyebrow: 'Step 1',
    title: 'Choose tonight’s sky.',
    body: 'Easy mode teaches the ritual before the mystery begins.',
  });

  await evalValue(
    cdp,
    `(() => {
      const main = window.__TAARA_GAME__.scene.getScene('MainMenu');
      main.scene.start('Play', { difficulty: 'easy', night: 10 });
      return true;
    })()`
  );
  await waitFor(cdp, '!!window.__TAARA_GAME__.scene.getScene("Play").puzzle');
  await waitFor(cdp, 'window.__TAARA_GAME__.scene.getScene("Play").difficulty === "easy"');
  await captureFor(cdp, 4.4, {
    place: 'right',
    eyebrow: 'Step 2',
    title: 'Learn the night.',
    body: 'The first run explains the rules without rushing the player.',
  });
  await click(cdp, width / 2, 462);
  await waitFor(cdp, 'window.__TAARA_GAME__.scene.getScene("Play").tutorial === null');
  await captureFor(cdp, 4.4, {
    place: 'left',
    eyebrow: 'Guided motion',
    title: 'Trace the glow.',
    body: 'A ghost comet shows the gesture. Then it is your turn.',
  });

  const solution = await evalValue(
    cdp,
    `(() => {
      const play = window.__TAARA_GAME__.scene.getScene('Play');
      return play.puzzle.solution.map((edge) => ({ from: edge.from, to: edge.to }));
    })()`
  );
  await caption(cdp, {
    place: 'left',
    eyebrow: 'The hook',
    title: 'Connect real stars.',
    body: 'Every line brings the hidden constellation into focus.',
  });
  for (const edge of solution) {
    const from = await starPosition(cdp, edge.from);
    const to = await starPosition(cdp, edge.to);
    await drag(cdp, from, to);
    await snap(cdp);
    await delay(110);
    await snap(cdp);
  }
  await waitFor(cdp, 'window.__TAARA_GAME__.scene.getScene("Play").complete === true');
  await hidePointer(cdp);

  await captureFor(cdp, 5.2, {
    place: 'left',
    eyebrow: 'Reveal',
    title: 'The sky answers.',
    body: 'Finish the pattern to reveal the constellation and its meaning.',
  });
  const namesPoint = await evalValue(
    cdp,
    `(() => {
      const play = window.__TAARA_GAME__.scene.getScene('Play');
      const pill = play.namesPill?.container;
      return pill ? { x: pill.x, y: pill.y } : null;
    })()`
  );
  if (namesPoint) {
    await caption(cdp, {
      place: 'left',
      eyebrow: 'Discovery',
      title: 'Reveal the star names.',
      body: 'Tap the star icon to see the real names behind the constellation.',
    });
    await click(cdp, namesPoint.x, namesPoint.y);
    await waitFor(cdp, 'window.__TAARA_GAME__.scene.getScene("Play").starLabels.length > 0');
    await captureFor(cdp, 5.0, {
      place: 'left',
      eyebrow: 'Discovery',
      title: 'Real stars, named.',
      body: 'The finished shape becomes a tiny sky lesson before the story opens.',
    });
  }
  await hidePointer(cdp);
  await evalValue(cdp, `window.__TAARA_GAME__.scene.getScene('Play').showStoryCard(); true`);
  await captureFor(cdp, 6.2, {
    place: 'right',
    eyebrow: 'Reward',
    title: 'A myth for tonight.',
    body: 'The payoff is a quiet story players can read before sleep.',
  });
  await evalValue(cdp, `window.__TAARA_GAME__.scene.getScene('Play').openResults(); true`);
  await waitFor(cdp, 'window.__TAARA_GAME__.scene.getScene("Results").scene.isActive()');
  await captureFor(cdp, 5.2, {
    place: 'midleft',
    eyebrow: 'Shareable',
    title: 'No spoilers.',
    body: 'Streaks and community progress invite people back tomorrow.',
  });
  await evalValue(
    cdp,
    `(() => {
      const results = window.__TAARA_GAME__.scene.getScene('Results');
      const id = results.params.constellationId;
      window.__TAARA_GAME__.scene.start('MySky', { tonight: { constellationId: id, night: 10 } });
      return true;
    })()`
  );
  await waitFor(cdp, 'window.__TAARA_GAME__.scene.getScene("MySky").scene.isActive()');
  await evalValue(
    cdp,
    `(() => {
      const sky = window.__TAARA_GAME__.scene.getScene('MySky');
      ['ursa-minor', 'cassiopeia', 'lyra', 'orion', 'cygnus', 'leo', 'scorpius', 'gemini', 'taurus', 'ursa-major'].forEach((id, i) => sky.gathered.set(id, i + 1));
      sky.answered = true;
      sky.buildFigures();
      sky.redraw();
      sky.updateCaptions();
      return true;
    })()`
  );
  await captureFor(cdp, 4.8, {
    place: 'midleft',
    eyebrow: 'Retention',
    title: 'Tonight joins the map.',
    body: 'The constellation you solved takes its place in your personal sky.',
  });
  await caption(cdp, {
    place: 'midleft',
    eyebrow: 'Retention',
    title: 'Zoom out.',
    body: 'Every completed night becomes part of a growing constellation map.',
  });
  await evalValue(cdp, `window.__TAARA_GAME__.scene.getScene('MySky').frameWholeSky(); true`);
  await captureFor(cdp, 7.0, {
    place: 'midleft',
    eyebrow: 'Retention',
    title: 'Build your sky.',
    body: 'Come back nightly to fill the whole dome with solved constellations.',
  });
  await renderVideo();
  console.log(`Trailer written to ${outFile}`);
} finally {
  server.close();
  cdp.ws?.close?.();
  chrome.kill('SIGTERM');
  await new Promise((resolve) => {
    chrome.once('exit', resolve);
    setTimeout(resolve, 1200);
  });
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await rm(framesDir, { recursive: true, force: true });
}
