# Emotica Now
Real-time emotion detection for games. Emotica reads player facial expressions 
every 2 seconds, adapts gameplay difficulty based on mood, and logs emotional 
telemetry to a live cloud database for developer analysis.

## What It Does
- Detects Engaged, Bored, Frustrated, and Surprised states via webcam
- Adapts enemy speed, spawn rate, and difficulty in real time
- Triggers "Ragebait" intervention when sustained frustration is detected
- Pushes session data to Supabase — viewable in the Developer Portal

## How to Run
1. Clone the repo
2. Add your audio files to `assets/` as `music_menu.mp3` and `music_game.mp3`
3. Open with a local server: `npx serve .`
4. Open local host in browser

## Tech Stack
JavaScript · HTML/CSS · MediaPipe · Chart.js · Supabase 
