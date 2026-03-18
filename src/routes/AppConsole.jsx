import React, { useEffect, useState, useRef } from "react";
import { getMe } from "../ui/api";
import OnboardingModal from "../components/OnboardingModal";

// =========================
// ENV CONFIG
// =========================
const MIN_CHARS = Number(import.meta.env.VITE_REALTIME_MIN_CHARS || 4);
const ARM_DEBOUNCE = Number(import.meta.env.VITE_REALTIME_ARM_DEBOUNCE_MS || 340);
const GLOBAL_COOLDOWN = Number(import.meta.env.VITE_REALTIME_COOLDOWN_AFTER_REPLY_MS || 1900);

// =========================
// DEVICE DETECTION
// =========================
const ua = navigator.userAgent || "";
const isIPhone = /iPhone|iPad|iPod/i.test(ua);
const isAndroid = /Android/i.test(ua);

// =========================
// DEVICE-SPECIFIC TUNING
// =========================
const DEVICE_CONFIG = isIPhone
? {
vadEnergy: 0.018,
silenceMs: 1600,
minSpeechMs: 700,
restartAfterTts: 900,
cooldown: 2200,
}
: {
vadEnergy: 0.02,
silenceMs: 1400,
minSpeechMs: 600,
restartAfterTts: 650,
cooldown: 1800,
};

// =========================
// COMPONENT
// =========================
export default function AppConsole() {
const [user, setUser] = useState(null);
const [loading, setLoading] = useState(true);
const [showOnboarding, setShowOnboarding] = useState(false);
const [realtimeState, setRealtimeState] = useState("idle");
const [apiDown, setApiDown] = useState(false);

const lastSpeechEnd = useRef(0);
const debounceTimer = useRef(null);

// VAD refs
const audioContextRef = useRef(null);
const analyserRef = useRef(null);
const micStreamRef = useRef(null);
const speakingRef = useRef(false);
const speechStartRef = useRef(0);
const silenceStartRef = useRef(0);

// =========================
// AUTH BOOTSTRAP
// =========================
useEffect(() => {
async function bootstrap() {
try {
const me = await getMe();

```
    if (!me || !me.approved) {
      localStorage.removeItem("token");
      window.location.href = "/auth";
      return;
    }

    setUser(me);

    if (!me.onboarding_completed) {
      setShowOnboarding(true);
    }

    setApiDown(false);
  } catch (err) {
    console.error("Bootstrap error:", err);

    setApiDown(true);

    setTimeout(() => {
      localStorage.removeItem("token");
      window.location.href = "/auth";
    }, 1500);
  } finally {
    setLoading(false);
  }
}

bootstrap();
```

}, []);

// =========================
// START VAD MIC
// =========================
async function startMic() {
if (audioContextRef.current) return;

```
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
micStreamRef.current = stream;

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const source = audioContext.createMediaStreamSource(stream);
const analyser = audioContext.createAnalyser();

analyser.fftSize = 512;
source.connect(analyser);

audioContextRef.current = audioContext;
analyserRef.current = analyser;

detectSpeech();
```

}

function stopMic() {
micStreamRef.current?.getTracks().forEach(t => t.stop());
audioContextRef.current?.close();

```
audioContextRef.current = null;
analyserRef.current = null;
```

}

// =========================
// VAD DETECTION LOOP
// =========================
function detectSpeech() {
const analyser = analyserRef.current;
if (!analyser) return;

```
const data = new Uint8Array(analyser.frequencyBinCount);

function loop() {
  analyser.getByteFrequencyData(data);

  const energy = data.reduce((a, b) => a + b, 0) / data.length / 255;

  const now = Date.now();

  if (energy > DEVICE_CONFIG.vadEnergy) {
    if (!speakingRef.current) {
      speakingRef.current = true;
      speechStartRef.current = now;
      setRealtimeState("listening");
    }

    silenceStartRef.current = 0;
  } else {
    if (speakingRef.current) {
      if (!silenceStartRef.current) {
        silenceStartRef.current = now;
      }

      if (now - silenceStartRef.current > DEVICE_CONFIG.silenceMs) {
        speakingRef.current = false;

        const duration = now - speechStartRef.current;

        if (duration > DEVICE_CONFIG.minSpeechMs) {
          handleTranscript("voice input detected");
        }

        setRealtimeState("processing");
      }
    }
  }

  requestAnimationFrame(loop);
}

loop();
```

}

// =========================
// PROCESS SPEECH
// =========================
function handleTranscript(text) {
if (!text || text.length < MIN_CHARS) return;

```
const now = Date.now();

if (now - lastSpeechEnd.current < DEVICE_CONFIG.cooldown) return;

clearTimeout(debounceTimer.current);

debounceTimer.current = setTimeout(() => {
  processSpeech(text);
}, ARM_DEBOUNCE);
```

}

function processSpeech(text) {
setRealtimeState("processing");

```
setTimeout(() => {
  setRealtimeState("speaking");

  setTimeout(() => {
    setRealtimeState("idle");
    lastSpeechEnd.current = Date.now();
  }, DEVICE_CONFIG.restartAfterTts);
}, 500);
```

}

// =========================
// UI BADGE
// =========================
function RealtimeBadge() {
const map = {
idle: "Ready",
listening: "Listening...",
processing: "Thinking...",
speaking: "Responding..."
};

```
return (
  <div style={{
    position: "fixed",
    bottom: 20,
    right: 20,
    padding: "8px 12px",
    borderRadius: 12,
    background: "#111",
    color: "#fff",
    fontSize: 12,
    opacity: 0.9
  }}>
    {map[realtimeState]}
  </div>
);
```

}

// =========================
// RENDER
// =========================
if (loading) return <div>Loading...</div>;

if (apiDown) {
return (
<div style={{ padding: 40 }}> <h2>Connection issue</h2> <p>We are reconnecting...</p> </div>
);
}

return ( <div>
{showOnboarding && (
<OnboardingModal
user={user}
onComplete={(updatedUser) => {
setUser(updatedUser);
setShowOnboarding(false);
}}
/>
)}

```
  <RealtimeBadge />

  <div style={{ padding: 40 }}>
    <h1>Orkio Console</h1>
    <p>Welcome back, {user?.email}</p>

    <button onClick={startMic}>Start Voice</button>
    <button onClick={stopMic}>Stop Voice</button>
  </div>
</div>
```

);
}
