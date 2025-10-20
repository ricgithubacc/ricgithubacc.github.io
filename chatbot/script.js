// --- Firebase SDKs (ES modules) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firestore (lite) – small bundle for read/write chat history
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js";

// --- Your Firebase config (Web API key is fine client-side when restricted) ---
const firebaseConfig = {
  apiKey: "AIzaSyC2c5wDZDSjJT_08vUyb6P6i0Ry2bGHTZk",
  authDomain: "webchatbot-df69c.firebaseapp.com",
  projectId: "webchatbot-df69c",
  appId: "1:400213955287:web:f8e3b8c1fc220a41ee5692",
};

// Init + keep session across reloads
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

// Router helpers (you already use /chatbot/)
const BASE = "/chatbot/";
function go(path) {
  window.location.href = (BASE + path).replace(/\/{2,}/g, "/");
}
function here(file) {
  const p = location.pathname;
  if (file === "index.html") return /\/chatbot\/?$/.test(p) || p.endsWith("/chatbot/index.html");
  return p.endsWith("/chatbot/" + file);
}

// UI helpers
const $ = (sel) => document.querySelector(sel);
function append(role, text) {
  const logEl = $("#chatLog");
  const wrap = document.createElement("div");
  wrap.style.margin = "8px 0";
  wrap.innerHTML = `<div class="muted" style="font-size:12px">${role}</div><div>${(text || "").replace(/</g,"&lt;")}</div>`;
  logEl.appendChild(wrap);
  logEl.scrollTop = logEl.scrollHeight;
}
function setBusy(yes) {
  $("#sendMsgBtn")?.classList.toggle("loading", yes);
  if ($("#sendMsgBtn")) $("#sendMsgBtn").disabled = yes;
  if ($("#chatInput")) $("#chatInput").disabled = yes;
}

// ---------- Page-specific wiring ----------
const page = document.body.dataset.page; // "login" | "signup" | "app"

// Redirect & fill account box
onAuthStateChanged(auth, (user) => {
  if (page === "login" || page === "signup") {
    if (user && !here("app.html")) go("app.html");
  } else if (page === "app") {
    if (!user && !here("index.html")) go("index.html");
    const emailEl = $("#userEmail");
    const uidEl = $("#userUid");
    if (user) {
      if (emailEl) emailEl.textContent = user.email || "(no email)";
      if (uidEl) uidEl.textContent = user.uid || "—";
      // render saved chat on sign-in
      loadAndRenderChatHistory().catch(console.warn);
    }
  }
});

// LOGIN handler (if you keep index.html login form)
if (page === "login") {
  const form = $("#loginForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#email")?.value.trim();
    const pass  = $("#password")?.value;
    if (!email || !pass) return;
    $("#loginForm .neural-button")?.classList.add("loading");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      setTimeout(()=> go("app.html"), 300);
    } finally {
      $("#loginForm .neural-button")?.classList.remove("loading");
    }
  });
}

// SIGNUP handler (if you keep signup.html form)
if (page === "signup") {
  const form = $("#signupForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#email")?.value.trim();
    const pass  = $("#password")?.value;
    if (!email || !pass || pass.length < 6) return;
    $("#signupForm .neural-button")?.classList.add("loading");
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
      setTimeout(()=> go("app.html"), 300);
    } finally {
      $("#signupForm .neural-button")?.classList.remove("loading");
    }
  });
}

// APP page: sign out
if (page === "app") {
  $("#signOutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
    go("index.html");
  });
}

// ---------------- Remote Chat (Cloud Function) ----------------
const ENDPOINT = "https://us-central1-webchatbot-df69c.cloudfunctions.net/api/chat";

// Load + render history saved by the server: users/{uid}/chats/main
async function loadAndRenderChatHistory() {
  const user = auth.currentUser;
  if (!user) return;

  const ref = doc(db, "users", user.uid, "chats", "main");
  const snap = await getDoc(ref);

  // Clear UI
  const logEl = $("#chatLog");
  if (logEl) logEl.innerHTML = "";

  // (Keep a system prompt only in memory; don’t render it)
  window._chatHistory = [{ role: "system", content: "You are a concise, helpful assistant. Keep answers short and on-topic." }];

  if (snap.exists()) {
    const saved = snap.data()?.history;
    if (Array.isArray(saved)) {
      for (const m of saved) {
        if (m.role !== "system") {
          window._chatHistory.push(m);
          append(m.role === "user" ? "you" : "assistant", m.content);
        }
      }
    }
  }
}

async function sendPrompt() {
  const inputEl = $("#chatInput");
  const logEl = $("#chatLog");
  const text = (inputEl?.value || "").trim();
  if (!text) return;
  inputEl.value = "";
  append("you", text);

  const user = auth.currentUser;
  if (!user) { append("assistant", "Please sign in first."); return; }
  const idToken = await user.getIdToken();

  setBusy(true);
  const box = document.createElement("div");
  box.style.margin = "8px 0";
  box.innerHTML = `<div class="muted" style="font-size:12px">assistant</div><div id="__streaming"></div>`;
  logEl.appendChild(box);
  const streamEl = box.querySelector("#__streaming");

  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + idToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: text, thread: "main" }),
  });

  if (!resp.ok || !resp.body) {
    streamEl.textContent = "Server error.";
    setBusy(false);
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";

  try {
    let done = false;
    while (!done) {
      const r = await reader.read();
      done = !!r.done;
      if (done) break;
      const chunk = decoder.decode(r.value);

      // Parse OpenAI-style event-stream: "data: {json}"
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content || "";
          if (delta) {
            accumulated += delta;
            streamEl.textContent = accumulated;
            logEl.scrollTop = logEl.scrollHeight;
          }
        } catch (_) { /* non-JSON frames */ }
      }
    }
  } catch (e) {
    streamEl.textContent = "Stream error: " + String(e);
  } finally {
    setBusy(false);
  }

  // Server already persists history; if you want immediate local refresh, you can:
  // await loadAndRenderChatHistory();
}

// Wire up composer
if (page === "app") {
  $("#sendMsgBtn")?.addEventListener("click", sendPrompt);
  $("#chatInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
  });
}
