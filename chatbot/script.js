// ---------- Firebase (CDN modular) ----------
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// Pull config from window (set in each HTML page). Fallback kept for dev.
const firebaseConfig = window.firebaseConfig ?? {
  apiKey: "AIzaSyC2c5wDZDSjJT_08vUyb6P6i0Ry2bGHTZk",
    authDomain: "webchatbot-df69c.firebaseapp.com",
    projectId: "webchatbot-df69c",
    storageBucket: "webchatbot-df69c.firebasestorage.app",
    messagingSenderId: "400213955287",
    appId: "1:400213955287:web:f8e3b8c1fc220a41ee5692",
    measurementId: "G-EFPFJG4EWH"
};

// Initialize once
if (!getApps().length) initializeApp(firebaseConfig);
const auth = getAuth();

// Small helper to print detailed errors under the field
function showError(whereId, err) {
  const el = document.getElementById(whereId);
  if (!el) return;
  // Common Firebase codes are very helpful to see
  const code = err?.code || "unknown/error";
  const msg  = err?.message || String(err);
  el.textContent = `${code.replace("auth/", "")}: ${msg}`;
}

// ---------- Page tag ----------
const page = document.body?.dataset?.page || "";

// ---------- Float labels + password eye (unchanged, just robust) ----------
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".smart-field").forEach((wrap) => {
    const input = wrap.querySelector("input");
    if (!input) return;
    const sync = () => wrap.classList.toggle("filled", !!input.value?.trim());
    ["input","change","blur"].forEach(evt => input.addEventListener(evt, sync));
    setTimeout(sync, 0); setTimeout(sync, 250); setTimeout(sync, 1000);
  });

  const eye = document.getElementById("passwordToggle");
  const pwd = document.getElementById("password");
  if (eye && pwd) {
    eye.type = "button";
    eye.addEventListener("click", (e) => {
      e.preventDefault();
      const show = pwd.type !== "text";
      pwd.type = show ? "text" : "password";
      eye.setAttribute("aria-pressed", String(show));
      try { pwd.focus({ preventScroll: true }); } catch {}
      const v = pwd.value; pwd.value = ""; pwd.value = v;
    });
  }
});

// ---------- Auth guards ----------
onAuthStateChanged(auth, (user) => {
  if (page === "app") {
    if (!user) { location.replace("index.html"); return; }
    const emailEl = document.getElementById("userEmail");
    if (emailEl) emailEl.textContent = user.email || "(no email)";
  } else if (page === "login" || page === "signup") {
    if (user) location.replace("app.html");
  }
});

// ---------- Sign In (index.html) ----------
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;

  // Config sanity check so we fail loudly if placeholders are used
  if (!firebaseConfig?.apiKey || firebaseConfig.apiKey.includes("YOUR_")) {
    showError("password-error", new Error("Firebase config missing. Set window.firebaseConfig in HTML."));
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email")?.value?.trim() || "";
    const pass  = document.getElementById("password")?.value || "";
    document.getElementById("email-error")?.replaceChildren();
    document.getElementById("password-error")?.replaceChildren();

    try {
      await signInWithEmailAndPassword(auth, email, pass);
      location.replace("app.html");
    } catch (err) {
      console.error("Sign in failed:", err);
      showError("password-error", err);
    }
  });
});

// ---------- Sign Up (signup.html) ----------
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");
  if (!form) return;

  // Config sanity check here too
  if (!firebaseConfig?.apiKey || firebaseConfig.apiKey.includes("YOUR_")) {
    showError("password-error", new Error("Firebase config missing. Set window.firebaseConfig in HTML."));
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email")?.value?.trim() || "";
    const pass  = document.getElementById("password")?.value || "";
    document.getElementById("email-error")?.replaceChildren();
    document.getElementById("password-error")?.replaceChildren();

    try {
      await createUserWithEmailAndPassword(auth, email, pass);
      const ok = document.getElementById("successMessage");
      if (ok) { ok.style.display = "block"; ok.textContent = "Account created! Redirecting…"; }
      location.replace("app.html");
    } catch (err) {
      console.error("Sign up failed:", err);
      showError("password-error", err); // shows e.g., weak-password, email-already-in-use
    }
  });
});

// ---------- Sign Out (app.html) ----------
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("signOutBtn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await signOut(auth);
      location.replace("index.html");
    } catch (err) {
      console.error("Sign-out failed:", err);
      btn.disabled = false;
      alert("Sign out failed. Please try again.");
    }
  });
});


// ===================== WebLLM: model load + chat =====================
// The HTML expects: #loadModelBtn, #initProgress host, #chatInput, #sendMsgBtn, #chatLog
let engine = null;
let chatHistory = [{ role: "system", content: "You are a helpful assistant." }];

// === Chat persistence (per-user, localStorage) ===
function chatStorageKey(uid) {
  return `chat:v1:${uid || "anon"}`;
}
function saveChat(uid) {
  try {
    localStorage.setItem(chatStorageKey(uid), JSON.stringify(chatHistory));
  } catch (e) {
    console.warn("Failed to persist chat", e);
  }
}
function loadChat(uid) {
  try {
    const raw = localStorage.getItem(chatStorageKey(uid));
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    // keep only messages with role + content
    return arr.filter(
      (m) =>
        m &&
        typeof m.content === "string" &&
        (m.role === "user" || m.role === "assistant" || m.role === "system")
    );
  } catch (e) {
    console.warn("Failed to load chat", e);
    return null;
  }
}
function renderChatToLog() {
  const log = $("#chatLog");
  if (!log) return;
  log.innerHTML = "";
  (chatHistory || []).forEach((m) => {
    if (m.role === "system") return; // don't render system prompt
    appendMsg(m.role, m.content);
  });
}


// Single, determinate progress bar under #initProgress (no duplicates)
function makeProgressBar() {
  const host = $("#initProgress");
  if (!host) return null;

  let root = host.querySelector(".webllm-progress");
  if (!root) {
    host.innerHTML = `
      <div class="webllm-progress">
        <div class="track" role="progressbar" aria-label="Model download progress"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="fill" id="wlmFill" style="width:0%"></div>
        </div>
        <div class="label muted" id="wlmLabel" aria-live="polite" style="margin-top:6px; font-size:12px;">
          Model: 0%
        </div>
      </div>`;
  }
  const label = $("#wlmLabel", host);
  const fill  = $("#wlmFill", host);
  const track = $(".track", host);

  return {
    show(text = "Model: 0%") {
      if (label) label.textContent = text;
      if (fill)  fill.style.width = "0%";
      if (track) track.setAttribute("aria-valuenow", "0");
    },
    set(pct, text) {
      const p = Math.max(0, Math.min(100, pct|0));
      if (fill)  fill.style.width = p + "%";
      if (label) label.textContent = text ?? `Model: ${p}%`;
      if (track) track.setAttribute("aria-valuenow", String(p));
    },
    done(text = "Model: 100% Ready") {
      if (fill)  fill.style.width = "100%";
      if (label) label.textContent = text;
      if (track) track.setAttribute("aria-valuenow", "100");
    },
    error(text = "Model load failed") {
      if (label) label.textContent = text;
    }
  };
}
const bar = makeProgressBar();

// Restore chat from storage on app page when user is signed in
document.addEventListener("DOMContentLoaded", () => {
  if (page !== "app") return;
  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    const loaded = loadChat(user.uid);
    if (loaded && loaded.length) {
      chatHistory = loaded;
      renderChatToLog();
    }
  });
});


// Append message to chat log
function appendMsg(role, text) {
  const log = $("#chatLog");
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.style.margin = "8px 0";
  wrap.style.display = "flex";
  wrap.style.justifyContent = role === "user" ? "flex-end" : "flex-start";

  const bubble = document.createElement("div");
  bubble.style.maxWidth = "80%";
  bubble.style.padding = "10px 12px";
  bubble.style.borderRadius = "14px";
  bubble.style.whiteSpace = "pre-wrap";
  bubble.style.lineHeight = "1.35";
  bubble.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,.08)";
  bubble.style.background = role === "user" ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.06)";
  bubble.textContent = text;

  wrap.appendChild(bubble);
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
}

// Try several WebLLM create APIs for compatibility
async function createEngine(webllm, modelId, initCb) {
  if (webllm?.CreateMLCEngine) {
    return await webllm.CreateMLCEngine(modelId, { initProgressCallback: initCb });
  }
  if (webllm?.CreateWebWorkerMLCEngine) {
    return await webllm.CreateWebWorkerMLCEngine(
      new URL("./mlc-worker.js", import.meta.url),
      modelId,
      { initProgressCallback: initCb }
    );
  }
  throw new Error("WebLLM engine factory not found");
}

const MODEL_ID = "Llama-3.1-8B-Instruct-q4f32_1-MLC"; // change if you prefer a different supported model

// Load model button
document.addEventListener("DOMContentLoaded", () => {
  $("#loadModelBtn")?.addEventListener("click", async () => {
    if (engine) { bar?.done("Model: 100% Ready"); return; }
    try {
      bar?.show("Model: 0%");
      // Lazy import WebLLM
      const webllm = await import("https://esm.sh/@mlc-ai/web-llm@0.2.49");
      engine = await createEngine(webllm, MODEL_ID, (p) => {
        // p.progress is 0..1
        const pct = Math.max(0, Math.min(100, Math.round((p?.progress ?? 0) * 100)));
        bar?.set(pct, `Model: ${pct}%`);
      });
      bar?.done("Model: 100% Ready");
      $("#chatInput")?.focus();
    } catch (err) {
      console.error(err);
      bar?.error("Model load failed");
      engine = null;
    }
  });
});

// Send message
document.addEventListener("DOMContentLoaded", () => {
  const input = $("#chatInput");
  const sendBtn = $("#sendMsgBtn");

  // Enter to send, Shift+Enter = newline
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn?.click();
    }
  });

  sendBtn?.addEventListener("click", async () => {
    const text = (input?.value || "").trim();
    if (!text) return;
    appendMsg("user", text);
    input.value = "";

    if (!engine) {
      appendMsg("assistant", "Click **Load AI** to initialize the model first.");
      return;
    }

    // Build history + query
    chatHistory.push({ role: "user", content: text });
    try { saveChat(auth.currentUser && auth.currentUser.uid); } catch {}


    try {
      // Prefer modern chat.completions API if present
      let reply = null;

      if (engine?.chat?.completions?.create) {
        const res = await engine.chat.completions.create({
          messages: chatHistory.map(m => ({ role: m.role, content: m.content })),
          temperature: 0.7,
        });
        reply = res?.choices?.[0]?.message?.content ?? "";
      } else if (engine?.generate) {
        // Fallback older API
        reply = await engine.generate(text);
      } else {
        reply = "The chat API is unavailable in this WebLLM build.";
      }

      chatHistory.push({ role: "assistant", content: reply });
      try { saveChat(auth.currentUser && auth.currentUser.uid); } catch {}

      appendMsg("assistant", reply);
    } catch (err) {
      console.error(err);
      appendMsg("assistant", "There was an error generating a reply.");
    }
  });
});
