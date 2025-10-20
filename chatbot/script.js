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

// Ask WebLLM which ID exists in THIS build
const MODEL_ID = "Phi-3-mini-4k-instruct-q4f16_1-MLC";


async function setupWebLLMChat() {
  const logEl = document.getElementById("chatLog");
  const inputEl = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendMsgBtn");
  const loadBtn = document.getElementById("loadModelBtn");
  const progEl = document.getElementById("initProgress");

// at the top of setupWebLLMChat(), after you grab DOM elems:
const bar = makeProgressBar();
bar?.show("Idle");  // shows the empty bar immediately

loadBtn.addEventListener("click", async () => {
    if (engine) {
      bar?.done("Model already loaded");
      return;
    }
    bar?.show("Downloading model… 0%");
  
    try {
      engine = await webllm.CreateMLCEngine(MODEL_ID, {
        appConfig,
        initProgressCallback: (p) => {
          const pct = Math.round((p.progress || 0) * 100);
          bar?.set(pct, `${p.text} — ${pct}%`);
        }
      });
      bar?.done(`Model ready: ${MODEL_ID}`);
      inputEl.focus();
    } catch (e) {
      const host = document.getElementById("initProgress");
      if (host) host.textContent = "Model load failed: " + (e?.message || e);
      engine = null;
    }
  });


  if (!logEl || !inputEl || !sendBtn || !loadBtn) return; // not on app.html

  let engine = null;
  const chatHistory = [{ role: "system", content: "You are a concise, helpful assistant." }];

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

// Build (once) and control a progress bar inside #initProgress
// Build (once) and control a progress bar inside #initProgress
function makeProgressBar() {
    const host = document.getElementById("initProgress");
    if (!host) return null;
  
    let root = host.querySelector(".webllm-progress");
    if (!root) {
      host.textContent = ""; // clear any old text
      root = document.createElement("div");
      root.className = "webllm-progress";
      root.innerHTML = `
        <div class="label" id="wlmLabel">Ready</div>
        <div class="track"><div class="fill" id="wlmFill"></div></div>
      `;
      host.appendChild(root);
    }
    const label = root.querySelector("#wlmLabel");
    const fill  = root.querySelector("#wlmFill");
  
    return {
      set(pct, text) {
        const clamped = Math.max(0, Math.min(100, pct|0));
        if (fill)  fill.style.width = clamped + "%";
        if (label) label.textContent = text ?? `Loading… ${clamped}%`;
      },
      done(finalText = "Model ready") {
        if (fill)  fill.style.width = "100%";
        if (label) label.textContent = finalText;
        // (no fade; keep visible so you can see it worked)
      },
      show(text = "Starting… 0%") {
        if (label) label.textContent = text;
        if (fill)  fill.style.width = "0%";
        root.style.opacity = "1";
      }
    };
  }
  
  

  loadBtn.addEventListener("click", async () => {
    if (engine) return;
  
    const bar = makeProgressBar();
    bar?.show("Downloading model… 0%");
  
    try {
      engine = await webllm.CreateMLCEngine(MODEL_ID, {
        appConfig,
        initProgressCallback: (p) => {
          // p.progress is 0..1, p.text is a short phase label
          const pct = Math.round((p.progress || 0) * 100);
          bar?.set(pct, `${p.text} — ${pct}%`);
        }
      });
      bar?.done(`Model ready: ${MODEL_ID}`);
      inputEl.focus();
    } catch (e) {
      const host = document.getElementById("initProgress");
      if (host) host.textContent = "Model load failed: " + (e?.message || e);
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

    // Stream reply
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
      // Fallback for older versions (non-streaming)
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
      setBusy(false);
    }
  }

  sendBtn.addEventListener("click", sendPrompt);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  });
}

// Initialize the chat only on the app page (after your auth guard)
if (document.body.dataset.page === "app") {
  // Optional: auto-load the model on page open:
  // setupWebLLMChat().then(()=> document.getElementById("loadModelBtn")?.click());
  setupWebLLMChat();
}
