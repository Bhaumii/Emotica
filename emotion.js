// emotion.js: emotion detection
// Uses MediaPipe FaceMesh to read facial landmarks and classifyNthe player's current mood using Paul Ekman's Action Units.

// Engaged    — AU6+AU12 (Duchenne smile + eye widening)
// Surprised  — AU1+AU2+AU5+AU26 (brows up + eyes wide + jaw drop)
// Frustrated — AU46 (eye squinting, relative to personal baseline)
// Bored      — default state, low expression energy

window.currentMood      = 'Engaged';
window.isRagebait       = false;
window.engagementScore  = 0.5;
window.frustrationScore = 0.0;
window.rageIndex        = 0.0;
window.cameraIsOn       = false;

var cameraOn        = false;
var faceMesh        = null;
var camInstance     = null;
var frameProcessing = false; 
var moodBuffer      = [];
var BUFFER          = 8;  
var SUSTAIN         = 6;  
var ragebaitCooldown = false;

// Behavioral tracking
var prevNoseX      = null;
var prevNoseY      = null;
var headShake      = 0;
var faceGoneFrames = 0;
var lookAwayFrames = 0;

// Eye baseline personalized for each player
var eyeBaseline    = null;
var baselineFrames = [];
var BASELINE_COUNT = 30;


// Demo Mode

var DEMO    = ['Engaged', 'Engaged', 'Bored', 'Engaged', 'Frustrated', 'Surprised'];
var demoIdx = 0;

setInterval(function() {
    if (!cameraOn) {
        demoIdx = (demoIdx + 1) % DEMO.length;
        window.currentMood = DEMO[demoIdx];
        setDisplay(window.currentMood);
    }
}, 5000);

function setDisplay(mood) {
    var el = document.getElementById('mood-display');
    if (el) el.textContent = mood;
}
setDisplay('Demo');


// Public Toggle

window.toggleCamera = function() {
    if (cameraOn) { stopCam(); } else { startCam(); }
};


// Start Camera

function startCam() {
    var btn = document.getElementById('camera-toggle');
    if (btn) btn.textContent = '📷 Loading...';

    eyeBaseline     = null;
    baselineFrames  = [];
    frameProcessing = false;

    faceMesh = new FaceMesh({
        locateFile: function(file) {
        return 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/' + file;
        }
    });

    faceMesh.setOptions({
        maxNumFaces:            1,
        refineLandmarks:        true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence:  0.5,
    });

    faceMesh.onResults(onResults);

    var video = document.getElementById('cam-preview');

    camInstance = new Camera(video, {
        // The frameProcessing lock is critical. MediaPipe is async — if we send
        // a new frame before the last one finishes, frames pile up in a queue
        // and the browser chokes. Dropping frames is fine; freezing is not.
        onFrame: async function() {
        if (frameProcessing) return;
        frameProcessing = true;
        try {
            await faceMesh.send({ image: video });
        } catch (e) {
            console.warn('MediaPipe frame skipped:', e.message);
        }
        frameProcessing = false;
        },
        width:  640,
        height: 480,
    });

    camInstance.start()
        .then(function() {
        cameraOn          = true;
        window.cameraIsOn = true;
        video.style.display = 'block';
        if (btn) {
            btn.textContent = '📷 Camera: ON';
            btn.classList.add('active');
        }
        console.log('Camera on — hold a neutral expression for ~3 seconds to calibrate.');
        })
        .catch(function(err) {
        console.error('Camera error:', err.name, err.message);
        if (btn) btn.textContent = '📷 Camera: OFF';
        frameProcessing = false;
        if (err.name === 'NotAllowedError') {
            alert('Camera permission denied.\n\nClick the camera icon in your address bar and select Allow, then refresh.');
        } else if (err.name === 'NotFoundError') {
            alert('No camera found. Make sure a webcam is connected.');
        }
        });
}


// Stop Camera

function stopCam() {
    if (camInstance) {
        try { camInstance.stop(); } catch(e) {}
        camInstance = null;
    }

    frameProcessing = false;
    cameraOn        = false;
    window.cameraIsOn = false;
    eyeBaseline     = null;
    baselineFrames  = [];
    moodBuffer      = [];

    var video = document.getElementById('cam-preview');
    if (video) video.style.display = 'none';

    window.currentMood      = 'Engaged';
    window.engagementScore  = 0.5;
    window.frustrationScore = 0.0;
    window.rageIndex        = 0.0;
    setDisplay('Demo');

    var btn = document.getElementById('camera-toggle');
    if (btn) {
        btn.textContent = '📷 Camera: OFF';
        btn.classList.remove('active');
    }
}


// Results

function onResults(results) {
    if (!cameraOn) return;

    if (!results.multiFaceLandmarks || !results.multiFaceLandmarks.length) {
        faceGoneFrames++;
        if (faceGoneFrames > 45 && !ragebaitCooldown) {
        triggerRagebait('face left frame');
        }
        return;
    }
    faceGoneFrames = 0;

    var lm    = results.multiFaceLandmarks[0];
    var faceH = dist(lm[10], lm[152]);
    if (faceH < 0.05) return; // too far from camera

    // Raw measurements — all divided by faceH to be scale-independent
    var mouthW    = dist(lm[61],  lm[291]) / faceH; // AU12 — smile width
    var mouthOpen = dist(lm[13],  lm[14])  / faceH; // AU26 — jaw drop

    var leftEyeH    = dist(lm[159], lm[145]) / faceH;
    var rightEyeH   = dist(lm[386], lm[374]) / faceH;
    var eyeAperture = (leftEyeH + rightEyeH) / 2;

    var leftBrowY  = (lm[70].y  + lm[105].y) / 2;
    var rightBrowY = (lm[300].y + lm[334].y) / 2;
    var eyeCenterY = (lm[159].y + lm[386].y) / 2;
    var browHeight = eyeCenterY - (leftBrowY + rightBrowY) / 2;
    var browRaise  = normalize(browHeight / faceH, 0.08, 0.14);

    // Head shake — exponential moving average of nose movement per frame
    var nx = lm[1].x, ny = lm[1].y;
    if (prevNoseX !== null) {
        var move  = Math.abs(nx - prevNoseX) + Math.abs(ny - prevNoseY);
        headShake = clamp(headShake * 0.88 + normalize(move, 0, 0.020) * 0.12);
    }
    prevNoseX = nx;
    prevNoseY = ny;

    // Look away — how far the nose is from horizontal center
    var lookAway = Math.max(0, normalize(Math.abs(lm[1].x - 0.5), 0.15, 0.35));
    lookAwayFrames = lookAway > 0.5 ? lookAwayFrames + 1 : Math.max(0, lookAwayFrames - 2);


    // Calibration — first 30 frames set the personal eye baseline.
    // After that, all eye measurements are relative to the player's own neutral face.
    if (!eyeBaseline) {
        baselineFrames.push(eyeAperture);
        if (baselineFrames.length >= BASELINE_COUNT) {
        eyeBaseline = baselineFrames.reduce(function(a, b) { return a + b; }, 0) / baselineFrames.length;
        console.log('Eye baseline locked in:', eyeBaseline.toFixed(4));
        }
        window.currentMood = 'Bored';
        setDisplay('Calibrating...');
        return;
    }

    // eyeRelative: 1.0 = neutral, above = wide open, below = squinting
    var eyeRelative = eyeAperture / eyeBaseline;


    // Composite FACS scores

    // Engaged — smile is the main signal, eye widening and brow raise support it
    var smileScore   = normalize(mouthW,      0.20, 0.34);
    var eyeWideScore = normalize(eyeRelative, 0.95, 1.12);
    var engScore     = clamp(smileScore * 0.55 + eyeWideScore * 0.25 + browRaise * 0.20);

    // Surprised — requires actual jaw drop, not just a wide smile
    var jawScore   = normalize(mouthOpen, 0.020, 0.055);
    var surprScore = clamp(jawScore * 0.50 + browRaise * 0.35 + eyeWideScore * 0.15);

    // Frustrated — eye squinting is the primary signal for this player.
    // Floor is at 0.06 so natural micro-blinks don't score. Head shake is
    // intentionally excluded here — it feeds ragebait instead.
    var eyeNarrowScore = normalize(1 - eyeRelative, 0.06, 0.35);
    var frustScore     = clamp(eyeNarrowScore * 0.85 + lookAway * 0.15);

    // Rage index — behavioral signals only (head shake + look away + leaving frame)
    var rageIdx = clamp(
        headShake * 0.50 +
        lookAway  * 0.30 +
        (faceGoneFrames > 10 ? 0.20 : 0)
    );

    window.engagementScore  = parseFloat(engScore.toFixed(3));
    window.frustrationScore = parseFloat(frustScore.toFixed(3));
    window.rageIndex        = parseFloat(rageIdx.toFixed(3));


    // Raw mood classification
    var raw;
    if      (surprScore > 0.50 && jawScore > 0.30) raw = 'Surprised';
    else if (engScore   > 0.42)                     raw = 'Engaged';
    else if (frustScore > 0.35)                     raw = 'Frustrated';
    else                                            raw = 'Bored';


    // Sustained window — 6 of the last 8 readings must agree before
    // we commit to a mood change. Prevents flickering on blinks / micro-moves.
    moodBuffer.push(raw);
    if (moodBuffer.length > BUFFER) moodBuffer.shift();

    var counts = {};
    moodBuffer.forEach(function(m) { counts[m] = (counts[m] || 0) + 1; });

    var topMood = Object.keys(counts).reduce(function(a, b) {
        return counts[a] > counts[b] ? a : b;
    });

    if (counts[topMood] >= SUSTAIN) {
        window.currentMood = topMood;
        setDisplay(topMood);
    }


    // Ragebait triggers — behavioral signals that mean the player is genuinely fed up
    if (!ragebaitCooldown) {
        if (headShake > 0.72)    triggerRagebait('head shake');
        if (lookAwayFrames > 60) triggerRagebait('looking away');
        var hp = parseInt((document.getElementById('health-display') || {}).textContent || '100');
        if (hp < 30 && frustScore > 0.55) triggerRagebait('low HP + frustrated');
    }

    // Sparse debug log — about 1% of frames
    if (Math.random() < 0.01) {
        console.log(
        'eng:', engScore.toFixed(2),
        '| frust:', frustScore.toFixed(2),
        '| eyeRel:', eyeRelative.toFixed(3),
        '| shake:', headShake.toFixed(2),
        '| mood:', window.currentMood
        );
    }
}


// Ragebait

function triggerRagebait(reason) {
    if (ragebaitCooldown) return;
    window.isRagebait = true;
    ragebaitCooldown  = true;
    lookAwayFrames    = 0;
    console.log('Ragebait triggered:', reason);
    setTimeout(function() { ragebaitCooldown = false; }, 15000);
}


// Helpers

function normalize(val, min, max) {
    if (max === min) return 0;
    return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

function clamp(val) {
    return Math.max(0, Math.min(1, val));
}

function dist(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}