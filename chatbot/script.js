// --- Base detection for local, GitHub Pages (project or user site), and other hosting ---
const IS_LOCAL =
  location.protocol === "file:" ||
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1";

// If on *.github.io project pages, the first path segment is the repo name (your base).
function detectBase() {
  if (IS_LOCAL) return ""; // local dev or file://
  if (location.hostname.endsWith("github.io")) {
    // e.g. https://user.github.io/myrepo/... -> base = /myrepo/
    const parts = location.pathname.split("/").filter(Boolean);
    const repo = parts.length ? `/${parts[0]}/` : "/";
    return repo;
  }
  // fallback for other hosting (keeps your old assumption working)
  return "/chatbot/";
}

const BASE = detectBase();

function go(path) {
  if (IS_LOCAL) {
    window.location.href = path; // relative navigation for local/file
  } else {
    window.location.href = (BASE + path).replace(/\/{2,}/g, "/");
  }
}

function here(file) {
  if (IS_LOCAL) {
    return location.pathname.endsWith("/" + file) ||
           (location.pathname === "/" && file === "index.html");
  }
  const p = location.pathname;
  if (file === "index.html") {
    // match the root of BASE or explicit index path
    return p === BASE || p.endsWith(`${BASE}index.html`);
  }
  return p.endsWith(`${BASE}${file}`);
}


// Detect which page we're on: "login" | "signup" | "app"
const page = (document.body && document.body.dataset.page) ||
             (here("app.html") ? "app" : (here("signup.html") ? "signup" : "login"));

// ========== Firebase (client SDKs) ==========
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

// ---- 1) FILL THESE FROM Firebase Console → Project settings → Web app
const firebaseConfig = {
    apiKey: "AIzaSyC2c5wDZDSjJT_08vUyb6P6i0Ry2bGHTZk",
    authDomain: "webchatbot-df69c.firebaseapp.com",
    projectId: "webchatbot-df69c",
    storageBucket: "webchatbot-df69c.firebasestorage.app",
    messagingSenderId: "400213955287",
    appId: "1:400213955287:web:f8e3b8c1fc220a41ee5692",
    measurementId: "G-EFPFJG4EWH"
  };

// ---- 2) Init + keep session across reloads
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);

// ---- Shared tiny helpers for your smart-field UI
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
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

// ---- Global auth guard / redirect behavior
onAuthStateChanged(auth, (user) => {
  if (page === "login" || page === "signup") {
    if (user && !here("app.html")) go("app.html");
  } else if (page === "app") {
    if (!user && !here("index.html")) go("index.html");
  }
});

// ===================== LOGIN PAGE =====================
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

  // Optional: forgot password link with id="forgotLink"
  const forgotLink = document.getElementById("forgotLink");
  forgotLink?.addEventListener("click", async (e) => {
    e.preventDefault();
    clearErrors();
    const email = $("#email")?.value.trim();
    if (!email) { setInlineError("email","Enter your email first."); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      setInlineError("email","Password reset email sent. Check your inbox.");
    } catch (err) {
      const [where, msg] = mapAuthError(err);
      setInlineError(where, msg);
    }
  });
}

// ===================== SIGNUP PAGE =====================
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

// ===================== APP PAGE =====================
if (page === "app") {
  // Fill in user info when available
  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    const emailEl = document.getElementById("userEmail");
    const uidEl   = document.getElementById("userUid");
    if (emailEl) emailEl.textContent = user.email || "(no email)";
    if (uidEl)   uidEl.textContent   = user.uid || "—";
  });

  // Sign out
  document.getElementById("signOutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
    go("index.html");
  });

  // ===== Chatbot (WebLLM) =====
  // Requires <script src="https://unpkg.com/@mlc-ai/web-llm/dist/index.js"></script> in app.html before this script.
  const messagesEl = document.getElementById("messages");
  const promptEl   = document.getElementById("prompt");
  const sendBtn    = document.getElementById("sendBtn");
  const modelNote  = document.getElementById("modelNote");

  let enginePromise = null;

  async function initEngine() {
    if (enginePromise) return enginePromise;
    if (modelNote) modelNote.style.display = "block";
    const { CreateMLCEngine, prebuiltAppConfig } = webllm; // global from script tag
    const cfg = prebuiltAppConfig({
      model_list: [
        { model: "Phi-3-mini-4k-instruct-q4f16_1" }, // small & cached after 1st load
      ]
    });
    enginePromise = CreateMLCEngine(cfg).finally(() => {
      if (modelNote) modelNote.style.display = "none";
    });
    return enginePromise;
  }
  

  function addBubble(role, text = "") {
    const div = document.createElement("div");
    div.className = role === "user" ? "bubble user" : "bubble bot";
    div.style.padding = "10px";
    div.style.borderRadius = "12px";
    div.style.maxWidth = "78%";
    div.style.background = role === "user" ? "rgba(106,167,255,.15)" : "rgba(255,255,255,.06)";
    div.style.border = "1px solid rgba(255,255,255,.12)";
    div.style.alignSelf = role === "user" ? "flex-end" : "flex-start";
    div.textContent = text;
    messagesEl?.appendChild(div);
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function getHistory() {
    const nodes = messagesEl ? [...messagesEl.children] : [];
    const hist = [{ role: "system", content: "You are a helpful assistant." }];
    nodes.forEach(n => {
      const isUser = (n.className || "").includes("user");
      hist.push({ role: isUser ? "user" : "assistant", content: n.textContent || "" });
    });
    return hist;
  }

  async function sendPrompt() {
    if (!messagesEl || !promptEl || !sendBtn) return;
    const text = (promptEl.value || "").trim();
    if (!text) return;
  
    sendBtn.disabled = true;
    promptEl.value = "";
  
    addBubble("user", text);
    const bot = addBubble("bot", "");
  
    try {
      const engine = await initEngine();
      const history = getHistory();
  
      let acc = "";
      const stream = await engine.chat.completions.create({
        messages: history,
        stream: true,
        temperature: 0.7,
        max_tokens: 300
      });
  
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          acc += delta;
          bot.textContent = acc;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      }
    } catch (e) {
      console.error(e);
      bot.textContent = "⚠️ Error generating response.";
    } finally {
      sendBtn.disabled = false;
      promptEl.focus();
    }
  }
  

  async function sendPrompt() {
    if (!messagesEl || !promptEl || !sendBtn) return;
    const text = (promptEl.value || "").trim();
    if (!text) return;

    sendBtn.disabled = true;
    promptEl.value = "";

    addBubble("user", text);
    const bot = addBubble("bot", "");

    try {
      const engine = await initEngine();
      const history = getHistory();

      let acc = "";
      const stream = await engine.chat.completions.create({
        messages: history,
        stream: true,
        temperature: 0.7,
        max_tokens: 300
      });

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          acc += delta;
          bot.textContent = acc;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      }
    } catch (e) {
      bot.textContent = "⚠️ Error generating response.";
      console.error(e);
    } finally {
      sendBtn.disabled = false;
      promptEl.focus();
    }
  }

  sendBtn?.addEventListener("click", sendPrompt);
  promptEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  });
}

// ===================== Cache-busting tip =====================
// If some devices still load the old script, version your HTML includes:
// <script src="script.js?v=2" type="module"></script>
// <link rel="stylesheet" href="style.css?v=2" />
