// emotion.js
// For Phase 1, this is a STUB (fake emotion engine)
// It randomly cycles moods so Person A can test game adaptation
// Person B will replace this with real MediaPipe camera detection later

window.currentMood = "Engaged";
window.isRagebait = false;

const moods = ["Engaged", "Bored", "Frustrated", "Surprised"];
let moodIndex = 0;

// Fake mood cycling every 8 seconds — just for testing Phase 1
setInterval(() => {
  moodIndex = (moodIndex + 1) % moods.length;
  window.currentMood = moods[moodIndex];
  console.log("🎭 Mood changed to:", window.currentMood);
}, 8000);