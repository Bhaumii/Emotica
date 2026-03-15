# 🎭 Emotica

<p align="center">
  <img src="https://img.shields.io/badge/Tech-Supabase-green?style=for-the-badge&logo=supabase" />
  <img src="https://img.shields.io/badge/AI-MediaPipe-047FFB?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Status-Deployed-success?style=for-the-badge" />
</p>

## The Vision
Modern games lose billions to **player churn**, yet studios rarely know *why* players quit. **Emotica** is a real-time emotional telemetry system that treats human emotion as a primary, measurable variable in game design. 

By bridging the gap between player psychology and game mechanics, we allow developers to stop guessing and start scaling engagement.

[Try the Demo](https://699a805f8418dbf101ada3cf--zingy-druid-40761a.netlify.app/) | [Devpost Submission]([https://devpost.com/software/emotica](https://devpost.com/software/ec-b6cfai))


## Key Technical Features

### The Emotion Engine
* **Real-Time Detection:** Uses browser-based facial landmark recognition to classify **Engaged, Bored, Frustrated, and Surprised** states every 2 seconds.
* **Streak-Based Heuristics:** To eliminate false positives (like blinks or head tilts), I implemented a "streak filter"—emotions must persist across multiple readings before triggering a system response.

###  Adaptive Difficulty Engine
* **Ragebait Intervention:** When the system detects a sustained "Frustration" score, it triggers real-time gameplay adjustments.
* **Dynamic Balancing:** Parameters like enemy speed, spawn rates, and health pack frequency shift automatically to stabilize player mood without breaking immersion.

###  Live Telemetry Pipeline
* **Supabase Integration:** Every session pushes a rich dataset to a **PostgreSQL** cloud instance, including:
    * **Frustration Intensity Index**
    * **Emotional Stability Curves**
    * **Adaptive Intervention Effectiveness** (Measuring if the difficulty tweak actually lowered frustration).

## Tech Stack

| Category | Technology |
| :--- | :--- |
| **Frontend** | JavaScript (ES6+), HTML5, CSS3 |
| **AI / Computer Vision** | MediaPipe (Facial Landmark Detection) |
| **Backend / Database** | Supabase (PostgreSQL Cloud) |
| **Data Visualization** | Chart.js (Developer Analytics Dashboard) |
| **Design** | Canva, Figma |


## Engineering Challenges & Solutions

* **The Performance Gap:** Running AI facial detection in-browser alongside a game loop caused frame drops. 
    * *Solution:* Optimized the detection loop to run **asynchronously**, keeping the gameplay smooth at 60FPS while maintaining 0.5Hz emotion polling.
* **The Noise Problem:** Raw facial data is messy.
    * *Solution:* Developed a **weighted frustration score** that combines emotion streak length with performance volatility (how much the player is losing) to predict churn-risk moments before they happen.
---

<p align="center">
  <b>Developed for Hacklytics 2026: Golden Byte</b>
</p>
