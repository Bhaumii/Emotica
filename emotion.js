window.currentMood = 'Engaged';
window.isRagebait  = false;

var cameraOn   = false;
var faceMesh   = null;
var camInstance = null;
var moodBuffer = [];
var BUFFER     = 5;
var sadStreak  = 0;
var shakeScore = 0;
var prevNoseX  = null;
var prevNoseY  = null;

// Demo mode cycles moods when camera is off
var DEMO = ['Engaged','Engaged','Bored','Engaged','Frustrated','Surprised'];
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


// TOGGLE
window.toggleCamera = function() {
  if (cameraOn) { stopCam(); } else { startCam(); }
};

function startCam() {
  var btn = document.getElementById('camera-toggle');
  if (btn) btn.textContent = '📷 Loading...';

  // FaceMesh global comes from face_mesh.js loaded in <head>
  faceMesh = new FaceMesh({
    locateFile: function(file) {
      return 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/' + file;
    }
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  faceMesh.onResults(onResults);

  var video = document.getElementById('cam-preview');

  // Camera class from camera_utils.js handles getUserMedia + frame loop
  camInstance = new Camera(video, {
    onFrame: async function() {
      await faceMesh.send({ image: video });
    },
    width: 640,
    height: 480
  });

  camInstance.start()
    .then(function() {
      cameraOn = true;
      video.style.display = 'block';
      if (btn) {
        btn.textContent = '📷 Camera: ON';
        btn.classList.add('active');
      }
      console.log('✅ Camera + FaceMesh running');
    })
    .catch(function(err) {
      console.error('Camera error:', err.name, err.message);
      if (btn) btn.textContent = '📷 Camera: OFF';
      if (err.name === 'NotAllowedError') {
        alert('Camera blocked!\n\n1. Click camera icon in Chrome address bar\n2. Select Always Allow\n3. Refresh the page');
      }
    });
}

function stopCam() {
  if (camInstance) { camInstance.stop(); camInstance = null; }
  var video = document.getElementById('cam-preview');
  if (video) video.style.display = 'none';
  cameraOn = false;
  window.currentMood = 'Engaged';
  setDisplay('Demo');
  var btn = document.getElementById('camera-toggle');
  if (btn) { btn.textContent = '📷 Camera: OFF'; btn.classList.remove('active'); }
}

// RESULTS 
function onResults(results) {
  if (!cameraOn) return;
  if (!results.multiFaceLandmarks || !results.multiFaceLandmarks.length) return;

  var lm = results.multiFaceLandmarks[0];
  var raw = classify(lm);

  // Head shake for ragebait
  var nx = lm[1].x, ny = lm[1].y;
  if (prevNoseX !== null) {
    var move = Math.abs(nx - prevNoseX) + Math.abs(ny - prevNoseY);
    shakeScore = move > 0.02 ? Math.min(20, shakeScore + 2) : Math.max(0, shakeScore - 1);
  }
  prevNoseX = nx; prevNoseY = ny;

  // Smooth
  moodBuffer.push(raw);
  if (moodBuffer.length > BUFFER) moodBuffer.shift();
  var final = vote(moodBuffer);

  window.currentMood = final;
  setDisplay(final);

  // Ragebait
  sadStreak = (final === 'Frustrated') ? sadStreak + 1 : 0;
  var hp = parseInt((document.getElementById('health-display') || {}).textContent) || 100;
  if (sadStreak >= 3 || shakeScore >= 8 || (hp < 30 && final === 'Frustrated')) {
    window.isRagebait = true;
    sadStreak = 0; shakeScore = 0;
    console.log('🔴 Ragebait triggered');
  }
}

// CLASSIFY 
function classify(lm) {
  var faceH = dist(lm[10], lm[152]);
  if (faceH < 0.05) return window.currentMood;

  var mouthW    = dist(lm[61], lm[291]) / faceH;
  var mouthOpen = dist(lm[13], lm[14])  / faceH;
  var cornerY   = (lm[61].y + lm[291].y) / 2;
  var smileLift = lm[13].y - cornerY;
  var frownPull = cornerY - lm[13].y;
  var browRaise = (dist(lm[70], lm[159]) + dist(lm[300], lm[386])) / 2 / faceH;
  var innerBrow = dist(lm[63], lm[293]) / faceH;

  // Console log ~every 60 frames so you can tune thresholds
  if (Math.random() < 0.016) {
    console.log('mouthW:', mouthW.toFixed(3),
      '| smile:', smileLift.toFixed(3),
      '| frown:', frownPull.toFixed(3),
      '| browRaise:', browRaise.toFixed(3),
      '| innerBrow:', innerBrow.toFixed(3),
      '| open:', mouthOpen.toFixed(3));
  }

  
  if (browRaise > 0.17 && mouthOpen > 0.04)  return 'Surprised';
  if (mouthW > 0.26 && smileLift > 0.005)   return 'Engaged';
  if (frownPull > 0.003 || innerBrow < 0.46) return 'Frustrated';
  return 'Bored';

}

function dist(a, b) {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

function vote(arr) {
  var t = {};
  arr.forEach(function(m) { t[m] = (t[m] || 0) + 1; });
  return Object.keys(t).reduce(function(a, b) { return t[a] > t[b] ? a : b; });
}