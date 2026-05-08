const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { spawn } = require('child_process');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');

// 🚀 Multi-Stream Key Manager
const STREAM_KEYS = {
    '1'   : '15254238731883_15281627925099_najspfkgne', 
    '1.1' : '15254260751979_15281671637611_2plrcfqzze', 
    '1.2' : '15254285524587_15281717840491_7e6qdknzsu',
    
    '2'   : '15254299352683_15281743071851_7dvz3h5d7q',
    '2.1' : '15254308986475_15281761618539_3xca7oij3u',
    '2.2' : '15254328122987_15281795566187_zjqa6bqzoq', 

    '3'   : '15254341885547_15281821059691_hhlpb5vicy', 
    '3.1' : '15254357089899_15281848322667_sxeexgvzl4', 
    '3.2' : '15254367510123_15281868180075_pc4jrytfgm',

    '4'   : '15255022345835_15283095800427_vwrupxzstm', 
    '4.1' : '15255038074475_15283122080363_ai5qqp2we4', 
    '4.2' : '15255045480043_15283135842923_tldl4bhmii',
    '4.3' : '15255208599147_15283449629291_abltofuc7m', 
    '4.4' : '15255217708651_15283466603115_bojrrqtlmu', 
    '4.5' : '15255227670123_15283486263915_jpntt54mve'
};

const TARGET_URL = process.env.TARGET_URL || 'https://dadocric.st/player.php?id=starsp3&v=m';
const SELECTED_CHANNEL = process.env.OKRU_STREAM_ID || '1';
const ACTIVE_STREAM_KEY = STREAM_KEYS[SELECTED_CHANNEL] || STREAM_KEYS['1'];
const RTMP_DESTINATION = `rtmp://vsu.okcdn.ru/input/${ACTIVE_STREAM_KEY}`;

// Naya Variable Input Read Karne Ke Liye
const PLAYER_SELECTION = process.env.PLAYER_SELECTION || 'None';

let browser = null;
let ffmpegProcess = null;

// =========================================================================
// 🔄 MAIN LOOP
// =========================================================================
async function mainLoop() {
    while (true) {
        try {
            await startDirectStreaming();
        } catch (error) {
            console.error(`\n[!] FATAL ERROR: ${error.message}`);
            console.log('[*] 🔄 Doing a full HARD RESTART in 3 seconds...');
            await cleanup();
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

async function startDirectStreaming() {
    console.log(`[*] Starting browser...`);
    const streamQuality = process.env.STREAM_QUALITY || '110KBps (Balanced 480p)';
    
    // 🌐 1. LAUNCH BROWSER
    browser = await puppeteer.launch({
        headless: false, 
        defaultViewport: { width: 1280, height: 720 },
        ignoreDefaultArgs: ['--enable-automation'], 
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', 
            '--disable-gpu', '--disable-software-rasterizer', '--disable-accelerated-2d-canvas', 
            '--force-color-profile=srgb', '--window-size=1280,720', '--kiosk', 
            '--autoplay-policy=no-user-gesture-required'
        ]
    });

    const page = await browser.newPage(); // Main stream page
    const holdingPage = await browser.newPage(); // The Safe Black Screen

    // Set up the Safe Black Screen
    await holdingPage.evaluate(() => {
        document.body.innerHTML = `
            <div style="background-color: black; color: #ffaa00; width: 100vw; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; margin: 0;">
                <h1 style="font-size: 40px; margin-bottom: 10px;">Reconnecting Stream...</h1>
                <p style="color: white; font-size: 20px;">Please wait, catching up with live broadcast.</p>
            </div>
        `;
        document.body.style.margin = '0';
        document.body.style.overflow = 'hidden';
    });

    // Close any other default pages
    const pages = await browser.pages();
    for (const p of pages) {
        if (p !== page && p !== holdingPage) await p.close();
    }

    // 🛑 POPUP & REDIRECT BLOCKER
    browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
            try {
                const newPage = await target.page();
                if (newPage && newPage !== page && newPage !== holdingPage) {
                    console.log(`[!] Ad Popup detected and KILLED! Focus maintained.`);
                    await page.bringToFront(); 
                    await newPage.close();
                }
            } catch (e) {}
        }
    });

    // 📡 2. START FFMPEG IMMEDIATELY
    console.log(`[+] Broadcasting to OK.ru CHANNEL: ${SELECTED_CHANNEL}`);
    let vfScale, bv, maxrate, bufsize, ba;

    if (streamQuality.includes('50KBps')) {
        vfScale = 'scale=640:360'; bv = '350k'; maxrate = '400k'; bufsize = '800k'; ba = '32k';
    } else if (streamQuality.includes('30KBps')) {
        vfScale = 'scale=426:240'; bv = '200k'; maxrate = '220k'; bufsize = '440k'; ba = '32k';
    } else {
        vfScale = 'scale=854:480'; bv = '800k'; maxrate = '850k'; bufsize = '1700k'; ba = '64k';
    }

    const displayNum = process.env.DISPLAY || ':99';
    let ffmpegArgs = [
        '-y', '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '1024',
        '-f', 'x11grab', '-draw_mouse', '0', '-video_size', '1280x720', '-framerate', '30',
        '-i', displayNum, '-thread_queue_size', '1024', '-f', 'pulse', '-i', 'default',
        '-vf', vfScale, '-af', 'adelay=975|975', 
        '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
        '-b:v', bv, '-maxrate', maxrate, '-bufsize', bufsize,
        '-pix_fmt', 'yuv420p', '-g', '60', '-max_muxing_queue_size', '1024',
        '-c:a', 'aac', '-b:a', ba, '-ac', '2', '-ar', '44100',
        '-f', 'flv', RTMP_DESTINATION 
    ];
    
    ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    ffmpegProcess.stderr.on('data', (data) => {
        if (data.toString().includes('Error')) console.log(`[FFmpeg Error]: ${data}`);
    });

    let isFirstRun = true;

    // =========================================================================
    // ⚡ SAFE SOFT RELOAD LOOP
    // =========================================================================
    while (true) {
        try {
            // 🛡️ STEP A: Bring holding page to front so viewers only see "Reconnecting" while website loads
            await holdingPage.bringToFront();
            console.log(`\n[*] Safe Screen Active. Navigating to Stream in background...`);
            
            await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // --- YAHAN CUSTOM PLAYER SELECTION LOGIC ADD KIYA HAI ---
            if (PLAYER_SELECTION !== 'None') {
                console.log(`[*] Switching to selected player: ${PLAYER_SELECTION}...`);
                try {
                    // Button group ka wait karega
                    await page.waitForSelector('#playerBtns', { timeout: 5000 }).catch(() => {});
                    // Exact Title walay button pe click karega (e.g. PLAYER 1)
                    const playerBtn = await page.$(`button[title="${PLAYER_SELECTION}"]`);
                    if (playerBtn) {
                        await playerBtn.click();
                        console.log(`[+] Successfully clicked on ${PLAYER_SELECTION}. Waiting for new stream iframe to load...`);
                        await new Promise(r => setTimeout(r, 5000)); // Naya player load hone ke liye wait karega
                    } else {
                        console.log(`[-] Could not find the button for ${PLAYER_SELECTION}.`);
                    }
                } catch (err) {
                    console.log(`[-] Error during player selection: ${err.message}`);
                }
            }
            // --------------------------------------------------------

            if (isFirstRun) {
                const recorder = new PuppeteerScreenRecorder(page, { followNewTab: false, fps: 30, videoFrame: { width: 1280, height: 720 } });
                console.log('[*] 🔴 Debug Recording Started...');
                await recorder.start('./recording.mp4');
                setTimeout(async () => { await recorder.stop(); }, 30000);
                isFirstRun = false;
            }

            await new Promise(r => setTimeout(r, 5000));

            // 🖱️ STEP B: Clickers (Runs invisibly in background)
            let buttonGone = false, attempts = 0;
            while (!buttonGone && attempts < 10) {
                buttonGone = true;
                for (const frame of page.frames()) {
                    try {
                        const playBtn = await frame.$('.jw-icon-display[aria-label="Play"]');
                        if (playBtn) {
                            const isVisible = await frame.evaluate(el => window.getComputedStyle(el).display !== 'none', playBtn);
                            if (isVisible) {
                                buttonGone = false; await frame.evaluate(el => el.click(), playBtn); 
                                await new Promise(r => setTimeout(r, 2000)); break; 
                            }
                        }
                    } catch (err) {}
                }
                attempts++; await new Promise(r => setTimeout(r, 1000));
            }

            let unmuteClicked = false, unmuteAttempts = 0;
            while (!unmuteClicked && unmuteAttempts < 15) {
                for (const frame of page.frames()) {
                    try {
                        const unmuteBtn = await frame.$('#UnMutePlayer button.unmute');
                        if (unmuteBtn) {
                            const isVisible = await frame.evaluate(el => window.getComputedStyle(el).display !== 'none', unmuteBtn);
                            if (isVisible) {
                                await new Promise(r => setTimeout(r, 1500)); 
                                await frame.evaluate(el => el.click(), unmuteBtn); 
                                unmuteClicked = true; await new Promise(r => setTimeout(r, 2000)); break; 
                            }
                        }
                    } catch (err) {}
                }
                if (unmuteClicked) break; 
                unmuteAttempts++; await new Promise(r => setTimeout(r, 1000));
            }

            // 🧠 STEP C: Locate Video and Force Fullscreen (Still in background)
            let targetFrame = null;
            let frameAttempts = 0;
            
            console.log("[*] Searching for live video frame...");
            
            // Fix: 20 seconds tak wait karega taaki reload ke baad video tag miss na ho
            while (!targetFrame && frameAttempts < 20) {
                for (const frame of page.frames()) {
                    try {
                        const hasVideo = await frame.evaluate(() => {
                            const vid = document.querySelector('video');
                            return vid !== null; 
                        });
                        if (hasVideo) { targetFrame = frame; break; }
                    } catch (e) { }
                }
                
                if (!targetFrame) {
                    frameAttempts++;
                    await new Promise(r => setTimeout(r, 1000)); // 1 second wait karega aur phir dhundega
                }
            }

            if (!targetFrame) {
                console.log("[-] Warning: Could not find iframe with video tag. Defaulting to main frame.");
                targetFrame = page.mainFrame();
            }

            // --- YAHAN IFRAME URL PRINT KARNE KA LOGIC ADD KIYA HAI ---
            console.log(`[+] Live Stream detected in Iframe Source URL: ${targetFrame.url()}`);
            // ----------------------------------------------------------

            await page.evaluate(() => {
                document.body.style.backgroundColor = 'black'; document.body.style.overflow = 'hidden';
                document.querySelectorAll('iframe').forEach(iframe => {
                    iframe.style.position = 'fixed'; iframe.style.top = '0'; iframe.style.left = '0';
                    iframe.style.width = '100vw'; iframe.style.height = '100vh';
                    iframe.style.zIndex = '999999'; iframe.style.backgroundColor = 'black'; iframe.style.border = 'none';
                });
            }).catch(() => {});

            await targetFrame.evaluate(async () => {
                const style = document.createElement('style');
                style.innerHTML = `.jw-controls, .jw-ui, .plyr__controls, .vjs-control-bar, [data-player] .controls, #UnMutePlayer { display: none !important; }`;
                document.head.appendChild(style);

                const video = document.querySelector('video');
                if (video) { 
                    video.muted = false; video.volume = 1.0; 
                    // Fix: Ensure video display is forced block and opacity is 1
                    video.style.display = 'block'; video.style.opacity = '1';
                    video.style.position = 'fixed'; video.style.top = '0'; video.style.left = '0';
                    video.style.width = '100vw'; video.style.height = '100vh';
                    video.style.zIndex = '2147483647'; video.style.backgroundColor = 'black'; video.style.objectFit = 'contain';
                }
            }).catch(()=>{});

            // 🌟 STEP D: Everything is ready, bring the clean video to the front!
            console.log(`[+] Video is ready. Switching live feed from Holding Screen to Video!`);
            await page.bringToFront();

            // 🧠 STEP E: THE SMART WATCHDOG
            console.log('\n[*] Smart Engine Connected! 24/7 Monitoring Active...');
            let needsReload = false;

            while (!needsReload) {
                if (!browser || !browser.isConnected()) throw new Error("Browser closed unexpectedly.");

                const status = await targetFrame.evaluate(() => {
                    const bodyText = document.body.innerText.toLowerCase();
                    if (bodyText.includes("stream error") || bodyText.includes("could not be loaded") || bodyText.includes("network error")) return 'CRITICAL_ERROR';
                    
                    const v = document.querySelector('video');
                    if (!v || v.ended) return 'DEAD';
                    
                    if (v.paused) {
                        v.muted = false; v.play().catch(()=>{});
                        return 'PAUSED_AND_RECOVERED';
                    }
                    
                    if (typeof window.lastVideoTime === 'undefined') {
                        window.lastVideoTime = -1; window.stuckCount = 0;
                    }

                    if (v.currentTime === window.lastVideoTime) window.stuckCount++;
                    else window.stuckCount = 0; 
                    window.lastVideoTime = v.currentTime;

                    if (window.stuckCount > 3) return 'FROZEN';
                    return 'HEALTHY';
                }).catch(() => 'EVAL_ERROR');

                if (status === 'CRITICAL_ERROR' || status === 'DEAD' || status === 'FROZEN') {
                    console.log(`\n[!] ⚡ STREAM ${status} DETECTED! Doing a FAST SOFT RELOAD...`);
                    needsReload = true; // Loop break hoga, upar jayega, holdingPage wapas front par aa jayegi!
                } else if (status === 'PAUSED_AND_RECOVERED') {
                    await page.bringToFront();
                }

                await new Promise(r => setTimeout(r, 5000)); 
            }

        } catch (innerError) {
            console.error(`\n[!] Minor Error caught during stream: ${innerError.message}`);
            if (!browser || !browser.isConnected()) throw innerError;
        }
    }
}

async function cleanup() {
    if (ffmpegProcess) { try { ffmpegProcess.kill('SIGKILL'); } catch(e){} ffmpegProcess = null; }
    if (browser) { try { await browser.close(); } catch(e){} browser = null; }
}

process.on('SIGINT', async () => {
    console.log('\n[*] Stopping live script cleanly...');
    await cleanup();
    process.exit(0);
});

mainLoop();
