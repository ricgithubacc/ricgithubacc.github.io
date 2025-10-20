// ---------- Firebase (CDN modular) ----------
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// --- Fill this OR define window.firebaseConfig in a <script> before this file ---
const firebaseConfig = window.firebaseConfig ?? {
  apiKey: "YOUR_WEB_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  appId: "YOUR_APP_ID",
};
// Initialize once
if (!getApps().length) initializeApp(firebaseConfig);
const auth = getAuth();

// ---------- DOM helpers ----------
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const page = document.body?.dataset?.page || "";

// ---------- Floating labels + password eye (Login/Signup) ----------
// ---------- Floating labels + password eye (Login/Signup) ----------
document.addEventListener("DOMContentLoaded", () => {
  // Keep labels floated when there’s text (incl. blur & autofill)
  document.querySelectorAll(".smart-field").forEach((wrap) => {
    // Find the first input inside the field (handles .password-wrap)
    const input = wrap.querySelector("input");
    if (!input) return;

    const sync = () => {
      if (input.value && input.value.trim() !== "") wrap.classList.add("filled");
      else wrap.classList.remove("filled");
    };

    // Events that reflect content / browser updates
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
    input.addEventListener("blur", sync);

    // Initialize (catch autofill)
    setTimeout(sync, 0);
    // A couple of extra checks right after load to catch late autofill
    setTimeout(sync, 200);
    setTimeout(sync, 800);
  });

  document.addEventListener('DOMContentLoaded', () => {
  const isAuthPage =
    document.getElementById('loginForm') ||
    document.getElementById('signupForm');
  if (isAuthPage) {
    document.body.classList.add('auth-centered');
  }
});


  // Password eye toggle (works on both pages)
  const eye = document.getElementById("passwordToggle");
  const pwd = document.getElementById("password");
  if (eye && pwd) {
    eye.addEventListener("click", (e) => {
      e.preventDefault();          // never submit the form
      e.stopPropagation();         // avoid bubbling weirdness
      const showing = (pwd.type === "text");
      pwd.type = showing ? "password" : "text";
      eye.setAttribute("aria-pressed", String(!showing));
      // Keep focus and caret position for nice UX
      pwd.focus({ preventScroll: true });
      const v = pwd.value; pwd.value = ""; pwd.value = v; // iOS caret fix
    });
  }
});


// ---------- Auth guards + page wiring ----------
onAuthStateChanged(auth, (user) => {
  if (page === "app") {
    if (!user) {
      location.replace("index.html");
      return;
    }
    // Fill account bits
    const emailEl = $("#userEmail"); if (emailEl) emailEl.textContent = user.email || "(no email)";
    const uidEl = $("#userUid");     if (uidEl)   uidEl.textContent   = user.uid || "";
  } else if (page === "login" || page === "signup") {
    if (user) location.replace("app.html");
  }
});

// ----- Sign In (index.html) -----
document.addEventListener("DOMContentLoaded", () => {
  // Ensure blank placeholders so :placeholder-shown works
  document.querySelectorAll('.smart-field input').forEach(inp => {
    if (!inp.hasAttribute('placeholder')) inp.setAttribute('placeholder', ' ');
    if (inp.placeholder === '') inp.placeholder = ' ';
  });

  // Float labels when there’s text (and on autofill)
  document.querySelectorAll('.smart-field').forEach(wrap => {
    const input = wrap.querySelector('input');
    if (!input) return;
    const sync = () => {
      wrap.classList.toggle('filled', !!input.value && input.value.trim() !== '');
    };
    ['input','change','blur'].forEach(evt => input.addEventListener(evt, sync));
    setTimeout(sync, 0);     // immediate
    setTimeout(sync, 250);   // late autofill
    setTimeout(sync, 1000);  // very late autofill
  });

  // Password eye
  const eye = document.getElementById('passwordToggle');
  const pwd = document.getElementById('password');
  if (eye && pwd) {
    eye.type = 'button'; // ensure it never submits
    eye.addEventListener('click', (e) => {
      e.preventDefault();
      const show = pwd.type !== 'text';
      pwd.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      // keep focus + caret visible
      pwd.focus({ preventScroll: true });
      const v = pwd.value; pwd.value = ''; pwd.value = v;
    });
  }
});


// ----- Sign Up (signup.html) -----
document.addEventListener("DOMContentLoaded", () => {
  const signupForm = $("#signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#email")?.value.trim();
      const password = $("#password")?.value;
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        const ok = $("#successMessage");
        if (ok) { ok.style.display = "block"; ok.textContent = "Account created! Redirecting…"; }
        location.replace("app.html");
      } catch (err) {
        console.error(err);
        ($("#email-error")||{}).textContent = "Could not create account. Try a different email.";
      }
    });
  }
});

// ----- Sign Out (app.html) -----
document.addEventListener("DOMContentLoaded", () => {
  $("#signOutBtn")?.addEventListener("click", async (e) => {
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
      appendMsg("assistant", reply);
    } catch (err) {
      console.error(err);
      appendMsg("assistant", "There was an error generating a reply.");
    }
  });
});
