// --- Firebase SDKs (ES modules) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firestore (lite) – tiny bundle, perfect for saving small docs
import {
    getFirestore,
    doc,
    getDoc,
    setDoc
  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js";

  

// 1) FILL THESE FROM Firebase Console → Project settings → Web app
const firebaseConfig = {
  apiKey: "AIzaSyC2c5wDZDSjJT_08vUyb6P6i0Ry2bGHTZk",
  authDomain: "webchatbot-df69c.firebaseapp.com",
  projectId: "webchatbot-df69c", // if your real projectId is webchatbot-df69c, change it
  appId: "1:400213955287:web:f8e3b8c1fc220a41ee5692",
};

// 2) Init + keep session across reloads

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);   // <-- MOVE here (after app)
await setPersistence(auth, browserLocalPersistence);

await setPersistence(auth, browserLocalPersistence);

// Custom domain + app under /chatbot
const REPO = "";            // not used for custom domain
// ----- App lives under /chatbot -----
const BASE = "/chatbot/";

function go(path) {
  // go("app.html") -> /chatbot/app.html
  window.location.href = (BASE + path).replace(/\/{2,}/g, "/");
}

function here(file) {
  // helps guards detect current page even for /chatbot
  const p = location.pathname;
  if (file === "index.html") return /\/chatbot\/?$/.test(p) || p.endsWith("/chatbot/index.html");
  return p.endsWith("/chatbot/" + file);
}

// Shared helpers for inline errors (works with your smart-field styles)
const $ = (sel) => document.querySelector(sel);
function setInlineError(which, msg) {
  const id = which === "email" ? "email" : "password";
  const field = document.getElementById(id)?.closest(".smart-field");
  const err = document.getElementById(which === "email" ? "emailError" : "passwordError");
  if (field) field.classList.toggle("error", !!msg);
  if (err) { err.textContent = msg || ""; err.classList.toggle("show", !!msg); }
}
function clearErrors() {
  ["email","password"].forEach((w)=>{
    const field = document.getElementById(w)?.closest(".smart-field");
    if (field) field.classList.remove("error");
  });
  ["emailError","passwordError"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) { el.textContent = ""; el.classList.remove("show"); }
  });
}
function mapAuthError(e) {
  const code = e?.code || "";
  switch (code) {
    case "auth/invalid-email":        return ["email","Invalid email address."];
    case "auth/email-already-in-use": return ["email","An account already exists for this email."];
    case "auth/weak-password":        return ["password","Use a stronger password (8+ chars)."];
    case "auth/user-not-found":
    case "auth/wrong-password":       return ["password","Incorrect email or password."]; 
    case "auth/too-many-requests":    return ["password","Too many attempts. Try again later."];
    default:                          return ["password", e?.message || "Authentication error."];
  }
}
function attachCommonFieldUX() {
  const email = document.getElementById("email");
  const pass  = document.getElementById("password");
  const toggle = document.getElementById("passwordToggle");
  if (!email || !pass) return;

  email.setAttribute("placeholder"," ");
  pass.setAttribute("placeholder"," ");

  email.addEventListener("input", () => setInlineError("email",""));
  pass.addEventListener("input",  () => setInlineError("password",""));
  email.addEventListener("blur",  () => { if (!email.value.trim()) setInlineError("email","Email address required"); });
  pass.addEventListener("blur",   () => { if (!pass.value) setInlineError("password","Password required"); });

  toggle?.addEventListener("click", ()=>{
    const type = pass.type === "password" ? "text" : "password";
    pass.type = type;
    toggle.classList.toggle("toggle-active", type === "text");
  });
}
function showNeuralSuccess() {
  const form = document.querySelector("form.login-form");
  const successBox = document.getElementById("successMessage");
  if (!form || !successBox) return;
  form.style.transform = "scale(0.95)";
  form.style.opacity = "0";
  setTimeout(() => {
    form.style.display = "none";
    document.querySelector(".neural-social")?.remove();
    document.querySelector(".signup-section")?.remove();
    document.querySelector(".auth-separator")?.remove();
    successBox.classList.add("show");
  }, 300);
}

// ---------- Page-specific wiring ----------
const page = document.body.dataset.page; // "login" | "signup" | "app"

// Redirect rules based on auth state
onAuthStateChanged(auth, (user) => {
  if (page === "login" || page === "signup") {
    // If already signed-in and we’re on auth pages, go to app
    if (user && !here("app.html")) go("app.html");
  } else if (page === "app") {
    // If not signed-in, bounce to login
    if (!user && !here("index.html")) go("index.html");

    // Fill account box (if present)
    const emailEl = document.getElementById("userEmail");
    const uidEl = document.getElementById("userUid");
    if (user) {
      if (emailEl) emailEl.textContent = user.email || "(no email)";
      if (uidEl) uidEl.textContent = user.uid || "—";
    }
  }
});

// LOGIN page: sign in submit
if (page === "login") {
  attachCommonFieldUX();
  const form = document.getElementById("loginForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    const email = $("#email")?.value.trim();
    const pass  = $("#password")?.value;
    if (!email) { setInlineError("email","Email address required"); return; }
    if (!pass)  { setInlineError("password","Password required"); return; }

    const submitBtn = form.querySelector(".neural-button");
    submitBtn?.classList.add("loading");
    if (submitBtn) submitBtn.disabled = true;

    try {
      await signInWithEmailAndPassword(auth, email, pass);
      showNeuralSuccess();
      setTimeout(()=> go("app.html"), 1000);
    } catch (err) {
      const [where, msg] = mapAuthError(err);
      setInlineError(where, msg);
    } finally {
      submitBtn?.classList.remove("loading");
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// SIGNUP page: create account submit
if (page === "signup") {
  attachCommonFieldUX();
  const form = document.getElementById("signupForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    const email = $("#email")?.value.trim();
    const pass  = $("#password")?.value;
    if (!email) { setInlineError("email","Email address required"); return; }
    if (!pass || pass.length < 6) { setInlineError("password","Password must be at least 6 characters"); return; }

    const submitBtn = form.querySelector(".neural-button");
    submitBtn?.classList.add("loading");
    if (submitBtn) submitBtn.disabled = true;

    try {
      await createUserWithEmailAndPassword(auth, email, pass);
      showNeuralSuccess();
      setTimeout(()=> go("app.html"), 1000);
    } catch (err) {
      const [where, msg] = mapAuthError(err);
      setInlineError(where, msg);
    } finally {
      submitBtn?.classList.remove("loading");
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// APP page: sign out
if (page === "app") {
  document.getElementById("signOutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
    go("index.html");
  });
}

// ---------------- WebLLM Chat (app page, single-model) ----------------
// ---------------- WebLLM Chat (app page, single-model, auto-resolve) ----------------
import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.48";

// Use the official prebuilt config so WebLLM knows about its built-in models
const appConfig = webllm.prebuiltAppConfig;

/**
 * Pick a supported model ID from appConfig.model_list.
 * 1) Try exact match (the one you want).
 * 2) Try partial match containing "llama-3.2-1b-instruct".
 * 3) Fall back to the first model in the list.
 */
function resolveModelId(preferredExact, preferredHint) {
  const list = (appConfig?.model_list ?? []);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("WebLLM prebuilt appConfig contains no models.");
  }
  const exact = list.find(m => m?.model_id === preferredExact);
  if (exact) return exact.model_id;

  const hintLower = (preferredHint || "").toLowerCase();
  const partial = list.find(m => String(m?.model_id).toLowerCase().includes(hintLower));
  return (partial ?? list[0]).model_id;
}

// --- Chat persistence helpers (per authenticated user) ---
const CHAT_COLLECTION = "chats";
const CHAT_DOC = "main";   // single ongoing thread per user (rename if you want multiple)

async function loadChatHistory(uid) {
  try {
    const ref = doc(db, "users", uid, CHAT_COLLECTION, CHAT_DOC);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return Array.isArray(data?.history) ? data.history : [];
    }
  } catch (e) {
    console.warn("[chat] load error:", e);
  }
  return [];
}

async function saveChatHistory(uid, history) {
  // Store up to N most recent messages to keep the doc small
  const MAX_MSGS = 200;
  const trimmed = history.slice(-MAX_MSGS);
  try {
    const ref = doc(db, "users", uid, CHAT_COLLECTION, CHAT_DOC);
    await setDoc(ref, { history: trimmed }, { merge: true });
  } catch (e) {
    console.warn("[chat] save error:", e);
  }
}


// Ask WebLLM which ID exists in THIS build
const MODEL_ID = "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC";


  async function setupWebLLMChat() {
    const logEl = document.getElementById("chatLog");
    const inputEl = document.getElementById("chatInput");
    const sendBtn = document.getElementById("sendMsgBtn");
    const loadBtn = document.getElementById("loadModelBtn");
    const progEl  = document.getElementById("initProgress");
    if (!logEl || !inputEl || !sendBtn || !loadBtn) return; // not on app.html
  
    let engine = null;
    const chatHistory = [{ role: "system", content: "You are a concise, helpful assistant with a very thick chinese accent and you type like you have a chinese accent" }];
  
    // Load existing messages for this signed-in user (if any) and render them
const user = auth.currentUser;
if (user) {
  const saved = await loadChatHistory(user.uid);
  // Prepend our system prompt (keep it at index 0); append saved turns after it
  // If saved already included a system message, we’ll keep *our* current one and then the saved turns
  for (const m of saved) {
    if (m.role !== "system") chatHistory.push(m);
  }
  // Render into the UI so the user sees the prior convo
  for (const m of chatHistory) {
    if (m.role === "user") {
      const wrap = document.createElement("div");
      wrap.style.margin = "8px 0";
      wrap.innerHTML = `<div class="muted" style="font-size:12px">you</div><div>${m.content.replace(/</g,"&lt;")}</div>`;
      logEl.appendChild(wrap);
    } else if (m.role === "assistant") {
      const wrap = document.createElement("div");
      wrap.style.margin = "8px 0";
      wrap.innerHTML = `<div class="muted" style="font-size:12px">assistant</div><div>${m.content.replace(/</g,"&lt;")}</div>`;
      logEl.appendChild(wrap);
    }
  }
  logEl.scrollTop = logEl.scrollHeight;
}


    // --- single progress bar helper (only here, once) ---
    function makeProgressBar() {
        const host = document.getElementById("initProgress");
        if (!host) return null;
      
        // If already created, re-use (prevents duplicates)
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
      
        const label = host.querySelector("#wlmLabel");
        const fill  = host.querySelector("#wlmFill");
        const track = host.querySelector(".track");
      
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
          error(text) { if (label) label.textContent = text; }
        };
      }
      
  
    const bar = makeProgressBar();
    bar?.show("Idle");
  
    function append(role, text) {
      const wrap = document.createElement("div");
      wrap.style.margin = "8px 0";
      wrap.innerHTML = `<div class="muted" style="font-size:12px">${role}</div><div>${text.replace(/</g,"&lt;")}</div>`;
      logEl.appendChild(wrap);
      logEl.scrollTop = logEl.scrollHeight;
    }
    function setBusy(yes) {
      sendBtn.disabled = yes;
      inputEl.disabled = yes;
      loadBtn.disabled = yes;
      sendBtn.classList.toggle("loading", yes);
    }
  
    // --- SINGLE click handler (keep only this one) ---
    loadBtn.addEventListener("click", async () => {
      if (engine) { bar?.done(`Model already loaded: ${MODEL_ID}`); return; }
      bar?.show("Downloading model… 0%");
  
      try {
        engine = await webllm.CreateMLCEngine(MODEL_ID, {
          appConfig,
          initProgressCallback: (p) => {
            const pct = Math.round((p?.progress ?? 0) * 100);
            const phase = p?.text || "Loading";
            bar?.set(pct, `Loading — ${pct}%`);

          }
        });
        bar?.done(`Model ready: ${MODEL_ID} (100%)`);
        inputEl.focus();
      } catch (e) {
        bar?.error("Model load failed: " + (e?.message || e));
        engine = null;
      }
    });
  
    async function sendPrompt() {
      if (!engine) { progEl.textContent = "Load the model first."; return; }
      const user = (inputEl.value || "").trim();
      if (!user) return;
      inputEl.value = "";
      append("you", user);
      chatHistory.push({ role: "user", content: user });
      if (auth.currentUser) {
        saveChatHistory(auth.currentUser.uid, chatHistory);
      }
  
      setBusy(true);
      let assistantText = "";
      const assistantBox = document.createElement("div");
      assistantBox.style.margin = "8px 0";
      assistantBox.innerHTML = `<div class="muted" style="font-size:12px">assistant</div><div id="__streaming"></div>`;
      logEl.appendChild(assistantBox);
      const streamEl = assistantBox.querySelector("#__streaming");
  
      try {
        const stream = await engine.chat.completions.create({
          messages: chatHistory,
          stream: true,
          temperature: 0.7
        });
        for await (const delta of stream) {
          const chunk = delta?.choices?.[0]?.delta?.content ?? "";
          assistantText += chunk;
          streamEl.textContent = assistantText;
          logEl.scrollTop = logEl.scrollHeight;
        }
      } catch (e) {
        try {
          const out = await engine.chat.completions.create({
            messages: chatHistory,
            stream: false,
            temperature: 0.7
          });
          assistantText = out?.choices?.[0]?.message?.content ?? String(out);
          streamEl.textContent = assistantText;
        } catch (ee) {
          streamEl.textContent = "Error: " + (ee?.message || ee);
        }
      } finally {
        if (assistantText) chatHistory.push({ role: "assistant", content: assistantText });
        if (assistantText && auth.currentUser) {
            saveChatHistory(auth.currentUser.uid, chatHistory);
          }
          
        setBusy(false);
      }
    }
  
    sendBtn.addEventListener("click", sendPrompt);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
    });
  }
  

// Initialize the chat only on the app page (after your auth guard)
if (document.body.dataset.page === "app") {
  // Optional: auto-load the model on page open:
  // setupWebLLMChat().then(()=> document.getElementById("loadModelBtn")?.click());
  setupWebLLMChat();
}