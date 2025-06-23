const express = require('express');
const fs = require('fs');
const path = require('path');
const { remote } = require('webdriverio');

const app = express();
const port = process.env.PORT || 3000;

const VIRTUAL_START_STR = "2025-06-13 00:00:00";
const VIRTUAL_START = new Date(VIRTUAL_START_STR);
const BOOT_TIME_FILE = path.join(__dirname, 'boot_time.txt');
const LOG_FILE = path.join(__dirname, 'logs.txt');
const WEBLIST_FILE = path.join(__dirname, 'weblist.txt');

// Suppress noisy Chrome errors
process.stderr.write = () => {};

let REAL_SERVER_START;
if (fs.existsSync(BOOT_TIME_FILE)) {
  REAL_SERVER_START = new Date(fs.readFileSync(BOOT_TIME_FILE, 'utf-8').trim());
} else {
  REAL_SERVER_START = new Date();
  fs.writeFileSync(BOOT_TIME_FILE, REAL_SERVER_START.toISOString().split('.')[0]);
}

const interval = 5 * 60 * 1000;
let browser;

async function launchBrowser() {
  console.log("🔧 Launching browser...");
  browser = await remote({
    logLevel: 'error',
    capabilities: {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: [
          '--headless',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--disable-logging',
          '--log-level=3'
        ]
      }
    }
  });
  console.log("🚀 WebDriverIO Chrome launched.");
}

async function checkWebsites() {
  const now = new Date();
  const nowStr = `[${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
  const logLines = [];

  try {
    const urls = fs.readFileSync(WEBLIST_FILE, 'utf-8')
      .split('\n')
      .map(url => url.trim())
      .filter(Boolean);

    console.log(`🔁 Checking ${urls.length} sites...`);

    for (const url of urls) {
      try {
        await browser.url(url);
        await browser.execute(() => window.scrollTo(0, document.body.scrollHeight));
        await browser.pause(3000);
        logLines.push(`${nowStr} ✅ ${url} → 200`);
      } catch (e) {
        logLines.push(`${nowStr} ❌ ${url} → Error: ${e.message}`);
      }
    }
  } catch (e) {
    logLines.push(`${nowStr} ❌ weblist.txt not found.`);
  }

  if (logLines.length) {
    fs.appendFileSync(LOG_FILE, logLines.join('\n') + '\n', 'utf-8');
    console.log(logLines.join('\n'));
  }
}

async function startBot() {
  await launchBrowser();
  await checkWebsites();

  let count = 1;
  setInterval(async () => {
    console.log(`⏱️ Timer ticked (run ${++count})`);
    try {
      await checkWebsites();
    } catch (e) {
      console.error("⛔ Error in checkWebsites:", e);
    }
  }, interval);
}

// Web GUI
app.get('/', (req, res) => {
  const elapsedSec = Math.floor((Date.now() - REAL_SERVER_START.getTime()) / 1000);
  const currentVirtual = new Date(VIRTUAL_START.getTime() + elapsedSec * 1000);
  const timeString = currentVirtual.toISOString().replace('T', ' ').split('.')[0];

  let lastLines = [];
  if (fs.existsSync(LOG_FILE)) {
    const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
    lastLines = lines.slice(-100);
  }

  res.send(`
    <html>
      <head>
        <title>Wake Web (WDIO)</title>
        <meta http-equiv="refresh" content="1">
        <style>
          body { font-family: monospace; padding: 20px; }
          .log-box {
            background-color: #f9f9f9;
            padding: 10px;
            border-radius: 5px;
            border: 1px solid #ccc;
            height: 400px;
            overflow: auto;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <h2>Wake Web (Node + WebDriverIO)</h2>
        <p>🌐 Web running since: <code>${timeString}</code></p>
        <h3>Request Log (last 100 entries)</h3>
        <div class="log-box">${lastLines.map(l => l).join('<br>')}</div>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`🌐 Server running at http://localhost:${port}`);
  startBot();
});
