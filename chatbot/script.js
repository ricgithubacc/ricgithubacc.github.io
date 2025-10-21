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

// --- Chat history persistence (Firestore + localStorage fallback) ---
function lsKey(uid){ return `chat:history:${uid}`; }
function saveChatHistoryLocal(uid, history) {
  try { localStorage.setItem(lsKey(uid), JSON.stringify(history)); } catch {}
}
function loadChatHistoryLocal(uid) {
  try { return JSON.parse(localStorage.getItem(lsKey(uid)) || "[]"); } catch { return []; }
}

const CHAT_COLLECTION = "chats";
const CHAT_DOC = "main";

async function loadChatHistory(uid) {
  // 1) Try Firestore
  try {
    const ref = doc(db, "users", uid, CHAT_COLLECTION, CHAT_DOC);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const hist = Array.isArray(data?.history) ? data.history : [];
      saveChatHistoryLocal(uid, hist); // cache
      return hist;
    }
  } catch (e) {
    console.warn("[chat] load (cloud) error:", e);
  }
  // 2) Fallback to local cache
  return loadChatHistoryLocal(uid);
}

async function saveChatHistory(uid, history) {
  const MAX_MSGS = 200;
  const trimmed = history.slice(-MAX_MSGS);

  // Always save locally
  saveChatHistoryLocal(uid, trimmed);

  // Best-effort cloud write
  try {
    const ref = doc(db, "users", uid, CHAT_COLLECTION, CHAT_DOC);
    await setDoc(ref, { history: trimmed }, { merge: true });
  } catch (e) {
    console.warn("[chat] save (cloud) error:", e);
  }
}


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
// ---------------- WebLLM Chat with model selector ----------------
import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.48";
const appConfig = webllm.prebuiltAppConfig;

// Friendly presets. We resolve each to an actual model_id available in this build.
const MODEL_PRESETS = [
  {
    key: "phi3-mini",
    label: "Phi-3 Mini (4K) – balanced",
    exact: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
    hint:  "phi-3-mini-4k"
  },
  {
    key: "llama-1b",
    label: "Llama 3.2 1B – very light",
    exact: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    hint:  "llama-3.2-1b"
  },
  {
    key: "qwen-0.5b",
    label: "Qwen2.5 0.5B – ultra light",
    exact: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    hint:  "qwen2.5-0.5b"
  }
];

/** Return a valid model_id from appConfig.model_list given desired exact/hint. */
function resolveModelId(preferredExact, preferredHint) {
  const list = appConfig?.model_list ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("WebLLM prebuilt appConfig contains no models.");
  }
  const exact = list.find(m => m?.model_id === preferredExact);
  if (exact) return exact.model_id;
  const hint = (preferredHint || "").toLowerCase();
  const partial = list.find(m => String(m?.model_id).toLowerCase().includes(hint));
  return (partial ?? list[0]).model_id;
}

// Build a resolved catalog once (maps preset.key -> {label, model_id})
const RESOLVED = MODEL_PRESETS.map(p => ({
  key: p.key,
  label: p.label,
  model_id: resolveModelId(p.exact, p.hint)
}));

function getSavedModelKey() {
  return localStorage.getItem("wlm:modelKey") || "phi3-mini";
}
function saveModelKey(key) {
  localStorage.setItem("wlm:modelKey", key);
}
function getModelByKey(key) {
  return RESOLVED.find(x => x.key === key) || RESOLVED[0];
}

function populateModelSelect(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  for (const m of RESOLVED) {
    const opt = document.createElement("option");
    opt.value = m.key;
    opt.textContent = m.label;
    selectEl.appendChild(opt);
  }
  selectEl.value = getSavedModelKey();
}

// --- Single progress bar helper (unchanged API; now also updates the label) ---
function makeProgressBar() {
  const host = document.getElementById("initProgress");
  const activeLabel = document.getElementById("activeModelLabel");
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
    setActiveModelName(name) {
      if (activeLabel) activeLabel.textContent = name ? `Model: ${name}` : "";
    }
  };
}

// --- Chat wiring (app page only) ---
async function setupWebLLMChat(user) {

  if (document.body.dataset.page !== "app") return;

  const logEl   = document.getElementById("chatLog");
  const inputEl = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendMsgBtn");
  const loadBtn = document.getElementById("loadModelBtn");
  const modelSel= document.getElementById("modelSelect");
  const prog    = makeProgressBar();

  // Fill selector and remember choice
  populateModelSelect(modelSel);
  modelSel?.addEventListener("change", () => {
    saveModelKey(modelSel.value);
    const m = getModelByKey(modelSel.value);
    prog?.setActiveModelName(m.label);
  });

  // Show the current choice under the bar
  const current = getModelByKey(getSavedModelKey());
  prog?.setActiveModelName(current.label);

  let engine = null;
  const chatHistory = [{ role: "system", content: "You are a concise, friendly assistant." }];
    const uid = user?.uid;
  // Load previous turns (if any) and append after the system message
  try {
    const saved = uid ? await loadChatHistory(uid) : [];
    for (const m of saved) if (m?.role && m.role !== "system") chatHistory.push(m);
  } catch (e) {
    console.warn("[chat] restore error:", e);
  }

  // Load model when user clicks the button
  loadBtn?.addEventListener("click", async () => {
    const selected = getModelByKey(getSavedModelKey());
    prog?.show("Model: 0%");
    prog?.setActiveModelName(selected.label);

    const initProgressCallback = (report) => {
      if (report.progress) {
        const pct = Math.round(report.progress * 100);
        prog?.set(pct, `Model: ${pct}%`);
      } else if (report.text) {
        prog?.set(undefined, report.text);
      }
    };

    // Create/replace engine with the chosen model
    engine = await webllm.CreateWebWorkerEngine(
      new URL("https://esm.run/@mlc-ai/web-llm@0.2.48/dist/worker.js", import.meta.url),
      {
        appConfig,
        initProgressCallback,
        model_id: selected.model_id,
      }
    );

    prog?.set(100, "Model: 100%");
  });

  async function sendMessage() {
    const text = (inputEl?.value || "").trim();
    if (!text || !engine) return;
    inputEl.value = "";
    chatHistory.push({ role: "user", content: text });

    // render user bubble
    const u = document.createElement("div");
    u.style.margin = "8px 0";
    u.innerHTML = `<div class="muted" style="font-size:12px">you</div><div>${text.replace(/</g,"&lt;")}</div>`;
    logEl.appendChild(u);

    // stream assistant
    const a = document.createElement("div");
    a.style.margin = "8px 0";
    a.innerHTML = `<div class="muted" style="font-size:12px">assistant</div><div></div>`;
    const aBody = a.querySelector("div:last-child");
    logEl.appendChild(a);
    logEl.scrollTop = logEl.scrollHeight;

    let assistantText = "";
    const chunks = await engine.chat.completions.create({
      stream: true,
      messages: chatHistory
    });

    for await (const chunk of chunks) {
      const delta = chunk?.choices?.[0]?.delta?.content || "";
      assistantText += delta;
      aBody.textContent = assistantText;
      logEl.scrollTop = logEl.scrollHeight;
    }
    chatHistory.push({ role: "assistant", content: assistantText });
        if (assistantText && user?.uid) {
      saveChatHistory(user.uid, chatHistory);
    }

  }

  sendBtn?.addEventListener("click", sendMessage);
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// Boot the chat on app page
// Boot the chat on app page *after* auth resolves, so we know the UID
if (document.body.dataset.page === "app") {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      go("index.html");
      return;
    }
    setupWebLLMChat(user); // pass user for history load/save
  });
}

