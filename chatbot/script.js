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

// --- Lightweight model catalog & helpers ---
const MODEL_CATALOG = [
  { key: "phi3",   label: "Phi-3 mini 4k (light)",          exact: "Phi-3-mini-4k-instruct-q4f16_1-MLC", hint: "phi-3-mini-4k-instruct" },
  { key: "llama1b",label: "Llama-3.2-1B-Instruct (light)",   exact: "Llama-3.2-1B-Instruct-q4f16_1-MLC",  hint: "llama-3.2-1b-instruct" },
  { key: "qwen05b",label: "Qwen-2.5-0.5B-Instruct (ultra-light)", exact: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", hint: "qwen2.5-0.5b-instruct" }
];

function getSavedModelKey() {
  try { return localStorage.getItem("webllm:modelKey") || "phi3"; } catch { return "phi3"; }
}
function setSavedModelKey(k) {
  try { localStorage.setItem("webllm:modelKey", k); } catch {}
}

function pickModelIdFromKey(key) {
  const entry = MODEL_CATALOG.find(m => m.key === key) || MODEL_CATALOG[0];
  return resolveModelId(entry.exact, entry.hint);
}

function setupModelSelector() {
  const sel = document.getElementById("modelSelect");
  if (!sel) return;
  const saved = getSavedModelKey();
  if ([...sel.options].some(o => o.value === saved)) sel.value = saved;
  sel.addEventListener("change", () => setSavedModelKey(sel.value));
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


// Multi-model WebLLM setup: loads whichever model is selected in #modelSelect
async function setupWebLLMMultiModel() {
  const logEl    = document.getElementById("chatLog");
  const inputEl  = document.getElementById("chatInput");
  const sendBtn  = document.getElementById("sendMsgBtn");
  const loadBtn  = document.getElementById("loadModelBtn");
  const progHost = document.getElementById("initProgress");
  const active   = document.getElementById("activeModelLabel");
  if (!logEl || !inputEl || !sendBtn || !loadBtn || !progHost) return;

  setupModelSelector();

  // single shared progress bar (uses your existing makeProgressBar())
  const bar = (typeof makeProgressBar === "function") ? makeProgressBar() : null;

  // one engine; reuse across model loads (terminate on switch)
  let engine = null;
  let chatHistory = [{ role: "system", content: "You are a concise, helpful assistant." }];

  // restore per-user chat history if available
  const user = auth.currentUser;
  if (user) {
    const saved = await loadChatHistory(user.uid);
    for (const m of saved) if (m.role !== "system") chatHistory.push(m);
    // render
    for (const m of chatHistory) {
      if (m.role === "system") continue;
      const wrap = document.createElement("div");
      wrap.style.margin = "8px 0";
      if (m.role === "user")      wrap.innerHTML = `<div class="muted" style="font-size:12px">you</div><div>${m.content.replace(/</g,"&lt;")}</div>`;
      if (m.role === "assistant") wrap.innerHTML = `<div class="muted" style="font-size:12px">assistant</div><div>${m.content.replace(/</g,"&lt;")}</div>`;
      logEl.appendChild(wrap);
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  async function loadChosenModel() {
    const key = (document.getElementById("modelSelect")?.value) || getSavedModelKey();
    setSavedModelKey(key);
    const model_id = pickModelIdFromKey(key);

    loadBtn.classList.add("loading");
    loadBtn.disabled = true;
    bar?.show("Model: 0%");
    if (active) active.textContent = "Loading… " + model_id;

    if (engine && engine.getModelId && engine.getModelId() !== model_id) {
      try { await engine.terminate(); } catch {}
      engine = null;
    }
    if (!engine) engine = new webllm.MLCEngine();

    await engine.reload(model_id, {
      onProgress: (p) => {
        const pct = Math.round((p || 0) * 100);
        bar?.set(pct, `Model: ${pct}%`);
      }
    });

    bar?.done("Model: ready");
    if (active) active.textContent = `Active: ${model_id}`;
    loadBtn.classList.remove("loading");
    loadBtn.disabled = false;

    // send handler (idempotent)
    sendBtn.onclick = async () => {
      const msg = (inputEl.value || "").trim();
      if (!msg) return;
      inputEl.value = "";

      const u = document.createElement("div");
      u.style.margin = "8px 0";
      u.innerHTML = `<div class="muted" style="font-size:12px">you</div><div>${msg.replace(/</g,"&lt;")}</div>`;
      logEl.appendChild(u);
      logEl.scrollTop = logEl.scrollHeight;

      chatHistory.push({ role: "user", content: msg });

      const a = document.createElement("div");
      a.style.margin = "8px 0";
      a.innerHTML = `<div class="muted" style="font-size:12px">assistant</div><div></div>`;
      const aBody = a.querySelector("div:last-child");
      logEl.appendChild(a);

      let out = "";
      for await (const chunk of engine.chat.completions.create({
        messages: chatHistory,
        stream: true,
        temperature: 0.7,
        max_tokens: 256
      })) {
        const delta = chunk?.choices?.[0]?.delta?.content || "";
        out += delta;
        aBody.textContent = out;
        logEl.scrollTop = logEl.scrollHeight;
      }

      chatHistory.push({ role: "assistant", content: out });
      if (auth.currentUser) {
        saveChatHistory(auth.currentUser.uid, chatHistory);
      }
    };
  }

  // Hook the Load AI button
  loadBtn.addEventListener("click", () => {
    loadChosenModel().catch(err => {
      console.error("[webllm] load failed:", err);
      bar?.done("Error");
      loadBtn.classList.remove("loading");
      loadBtn.disabled = false;
      if (active) active.textContent = "Error loading model";
    });
  });

  // show which model is selected before load
  const savedKey = getSavedModelKey();
  if (active) {
    const label = MODEL_CATALOG.find(m => m.key === savedKey)?.label || "Phi-3 mini 4k";
    active.textContent = `Selected: ${label}`;
  }
}

// Initialize the chat only on the app page (after your auth guard)
if (document.body.dataset.page === "app") {
  // Optional: auto-load the model on page open:
  // setupWebLLMChat().then(()=> document.getElementById("loadModelBtn")?.click());
// Optional: auto-load the model on page open:
// setupWebLLMMultiModel().then(()=> document.getElementById("loadModelBtn")?.click());
  setupWebLLMMultiModel();
}