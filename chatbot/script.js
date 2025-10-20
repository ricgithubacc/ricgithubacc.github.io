
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
    projectId: "webchatbot-df69c",
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

// ---------------- WebLLM Chat (app page) ----------------
import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.48";

async function setupWebLLMChat() {
  const logEl = document.getElementById("chatLog");
  const inputEl = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendMsgBtn");
  const modelSel = document.getElementById("modelSelect");
  const loadBtn = document.getElementById("loadModelBtn");
  const progEl = document.getElementById("initProgress");

  if (!logEl || !inputEl || !sendBtn || !modelSel || !loadBtn) return; // not on app.html

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

  loadBtn.addEventListener("click", async () => {
    if (engine) return;
    const modelId = modelSel.value || "Llama-3.2-1B-Instruct-q4f32_1-MLC";
    progEl.textContent = "Downloading model… (first time can take a bit)";
    try {
      engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (p) => {
          const pct = (p.progress * 100).toFixed(0);
          progEl.textContent = `${p.text} — ${pct}%`;
        }
      });
      progEl.textContent = `Model ready: ${modelId}`;
      inputEl.focus();
    } catch (e) {
      progEl.textContent = "Model load failed: " + (e?.message || e);
      engine = null;
    }
  });

  async function sendPrompt() {
    if (!engine) { progEl.textContent = "Load a model first."; return; }
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
      // Newer WebLLM chat API:
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
      // Fallback for older versions (single-shot):
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
  // optional: auto-load the smallest model for convenience:
  // document.getElementById("loadModelBtn")?.click();
  setupWebLLMChat();
}
