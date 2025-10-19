
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

// 1) REPLACE with your Firebase Console values (Project settings → Web app).
//    Keep projectId matching your project exactly.
const firebaseConfig = {
    apiKey: "AIzaSyC2c5wDZDSjJT_08vUyb6P6i0Ry2bGHTZk",
    authDomain: "webchatbot-df69c.firebaseapp.com",
    projectId: "ebchatbot-df69c",
    appId: "1:400213955287:web:f8e3b8c1fc220a41ee5692",
  };

// 2) Init + persist session across reloads
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);

// ---------- Grab your existing UI ----------
const form            = document.getElementById("loginForm");
const emailInput      = document.getElementById("email");
const passwordInput   = document.getElementById("password");
const passwordToggle  = document.getElementById("passwordToggle");
const createLink      = document.querySelector(".neural-signup");   // “Create one”
const successBox      = document.getElementById("successMessage");
const emailErrorEl    = document.getElementById("emailError");
const passwordErrorEl = document.getElementById("passwordError");

// (Optional) If you added these elsewhere in your page/app:
const signOutBtn      = document.getElementById("signOutBtn");
const resetBtn        = document.getElementById("resetBtn");

// ---------- Small helpers ----------
function setInlineError(which, msg) {
  const fieldId = which === "email" ? "email" : "password";
  const smartField = document.getElementById(fieldId)?.closest(".smart-field");
  const el = which === "email" ? emailErrorEl : passwordErrorEl;
  if (smartField) smartField.classList.add("error");
  if (el) {
    el.textContent = msg || "";
    el.classList.toggle("show", !!msg);
  }
}
function clearErrors() {
  ["email","password"].forEach((w) => {
    const field = document.getElementById(w)?.closest(".smart-field");
    if (field) field.classList.remove("error");
  });
  if (emailErrorEl)    { emailErrorEl.textContent = "";    emailErrorEl.classList.remove("show"); }
  if (passwordErrorEl) { passwordErrorEl.textContent = ""; passwordErrorEl.classList.remove("show"); }
}
function mapAuthError(e) {
  const code = e?.code || "";
  switch (code) {
    case "auth/invalid-email":        return ["email",    "Invalid email address."];
    case "auth/email-already-in-use": return ["email",    "An account already exists for this email."];
    case "auth/weak-password":        return ["password", "Use a stronger password (8+ chars)."];
    case "auth/user-not-found":
    case "auth/wrong-password":       return ["password", "Incorrect email or password."];
    case "auth/too-many-requests":    return ["password", "Too many attempts. Try again later."];
    default:                          return ["password", e?.message || "Authentication error."];
  }
}
function validateEmail() {
  const v = emailInput.value.trim();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (!v) { setInlineError("email","Email address required"); return false; }
  if (!ok){ setInlineError("email","Invalid email format detected"); return false; }
  setInlineError("email","");
  return true;
}
function validatePassword() {
  const p = passwordInput.value;
  if (!p)           { setInlineError("password","Password required"); return false; }
  if (p.length < 6) { setInlineError("password","Password must be at least 6 characters"); return false; }
  setInlineError("password","");
  return true;
}

// Fancy success transition you already used
function showNeuralSuccess() {
  // Hide form with neural transition
  form.style.transform = "scale(0.95)";
  form.style.opacity = "0";

  setTimeout(() => {
    form.style.display = "none";
    const social = document.querySelector(".neural-social");
    const signupSection = document.querySelector(".signup-section");
    const sep = document.querySelector(".auth-separator");
    if (social) social.style.display = "none";
    if (signupSection) signupSection.style.display = "none";
    if (sep) sep.style.display = "none";
    // Show your “Connected” success
    successBox?.classList.add("show");
  }, 300);

  // After success, reveal your app (or redirect) — customize as you like
  setTimeout(() => {
    document.body.classList.add("authed");
    // window.location.href = "/app.html";
  }, 1200);
}

// ---------- Wire up your existing controls ----------

// label animations keep your placeholders empty
emailInput.setAttribute("placeholder"," ");
passwordInput.setAttribute("placeholder"," ");

// Live validation UX
emailInput.addEventListener("blur",  validateEmail);
passwordInput.addEventListener("blur", validatePassword);
emailInput.addEventListener("input", () => setInlineError("email",""));
passwordInput.addEventListener("input", () => setInlineError("password",""));

// Show/hide password
passwordToggle?.addEventListener("click", () => {
  const type = passwordInput.type === "password" ? "text" : "password";
  passwordInput.type = type;
  passwordToggle.classList.toggle("toggle-active", type === "text");
});

// Submit = SIGN IN (uses current email/password fields)
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();
  if (!validateEmail() || !validatePassword()) return;

  // Button loading state
  const submitBtn = form.querySelector(".neural-button");
  submitBtn?.classList.add("loading");
  if (submitBtn) submitBtn.disabled = true;

  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    showNeuralSuccess();
  } catch (err) {
    const [where, msg] = mapAuthError(err);
    setInlineError(where, msg);
  } finally {
    submitBtn?.classList.remove("loading");
    if (submitBtn) submitBtn.disabled = false;
  }
});

// “Create one” link = REGISTER with current email/password
createLink?.addEventListener("click", async (e) => {
  e.preventDefault();
  clearErrors();
  if (!validateEmail() || !validatePassword()) return;

  try {
    await createUserWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    showNeuralSuccess();
  } catch (err) {
    const [where, msg] = mapAuthError(err);
    setInlineError(where, msg);
  }
});

// Optional: “Forgot password?” if you add a link with id="forgotLink"
const forgotLink = document.getElementById("forgotLink");
forgotLink?.addEventListener("click", async (e) => {
  e.preventDefault();
  clearErrors();
  const email = emailInput.value.trim();
  if (!email) { setInlineError("email","Enter your email first."); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    setInlineError("email","Password reset email sent. Check your inbox.");
  } catch (err) {
    const [where, msg] = mapAuthError(err);
    setInlineError(where, msg);
  }
});

// Optional: a Sign Out button elsewhere in your app
signOutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  // Reset UI back to login
  if (successBox) successBox.classList.remove("show");
  form.style.display = "";
  form.style.opacity = "1";
  form.style.transform = "none";
  document.body.classList.remove("authed");
});

// Keep UI in sync with auth state (e.g., page refresh)
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Already signed-in (refresh) → show app
    document.body.classList.add("authed");
  } else {
    document.body.classList.remove("authed");
  }
});
