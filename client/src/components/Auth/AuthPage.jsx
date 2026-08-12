import React, { useState } from "react";
import { useApp } from "../../context/AppContext.jsx";

export const AuthPage = () => {
  const {
    authMode,
    setAuthMode,
    authNotice,
    setAuthNotice,
    authDeliveryConfigured,
    setAuthDeliveryConfigured,
    resetTokenFromUrl,
    clearResetTokenFromAddress,
    setToken,
    setUser,
    showToast,
    api,
  } = useApp();

  const [loading, setLoading] = useState(false);

  const handleModeSwitch = (mode) => {
    if (authMode === "reset" && mode !== "reset") {
      clearResetTokenFromAddress();
    }
    setAuthMode(mode);
    setAuthNotice("");
    setAuthDeliveryConfigured(null);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const values = Object.fromEntries(formData);
    const registering = authMode === "register";

    setLoading(true);
    try {
      const data = await api(`/auth/${registering ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      localStorage.setItem("studyreset_token", data.token);
      setToken(data.token);
      setUser(data.user);
      showToast(registering ? "Welcome to StudyReset." : "Welcome back.");
    } catch (error) {
      showToast(error.message, "error");
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const { email } = Object.fromEntries(formData);
    setLoading(true);
    try {
      const data = await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setAuthNotice("If an account matches that email, reset instructions have been requested.");
      setAuthDeliveryConfigured(data.deliveryConfigured !== false);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const values = Object.fromEntries(formData);

    if (!resetTokenFromUrl) {
      showToast("This reset link is missing or invalid. Request a new one.", "error");
      return;
    }
    if (values.password !== values.confirmPassword) {
      showToast("The two passwords do not match.", "error");
      return;
    }

    setLoading(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetTokenFromUrl, ...values }),
      });
      clearResetTokenFromAddress();
      setAuthNotice("Your password has been reset. Log in with your new password.");
      setAuthMode("login");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const register = authMode === "register";
  const forgot = authMode === "forgot";
  const reset = authMode === "reset";

  let authContent;

  if (forgot) {
    authContent = (
      <>
        <p className="eyebrow">Account recovery</p>
        <h2>Reset your password</h2>
        <p className="auth-intro">Enter your account email. We’ll respond with the same message whether or not an account exists.</p>
        {authNotice && <div className="auth-notice" role="status">{authNotice}</div>}
        {authDeliveryConfigured === false && (
          <p className="delivery-note">Email delivery is not configured yet. Your request was accepted, but reset instructions cannot be delivered until an administrator connects an email provider.</p>
        )}
        <form id="forgot-form" className="form-stack" onSubmit={handleForgotSubmit}>
          <div className="field">
            <label htmlFor="forgot-email">Email address</label>
            <input id="forgot-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          </div>
          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
            {loading ? "Requesting…" : "Request reset instructions"}
          </button>
        </form>
        <button className="auth-back" data-action="auth-mode" data-mode="login" onClick={() => handleModeSwitch("login")}>
          ← Back to log in
        </button>
      </>
    );
  } else if (reset) {
    authContent = (
      <>
        <p className="eyebrow">Choose a fresh password</p>
        <h2>Set a new password</h2>
        <p className="auth-intro">Use at least six characters. The reset link is used securely and is never shown here.</p>
        <form id="reset-form" className="form-stack" onSubmit={handleResetSubmit}>
          <div className="field">
            <label htmlFor="reset-password">New password</label>
            <input id="reset-password" name="password" type="password" autoComplete="new-password" minLength={6} maxLength={128} required />
          </div>
          <div className="field">
            <label htmlFor="reset-confirm-password">Confirm new password</label>
            <input id="reset-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={6} maxLength={128} required />
          </div>
          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save new password"}
          </button>
        </form>
        <button className="auth-back" data-action="auth-mode" data-mode="login" onClick={() => handleModeSwitch("login")}>
          ← Back to log in
        </button>
      </>
    );
  } else {
    authContent = (
      <>
        <p className="eyebrow">Welcome to StudyReset</p>
        <h2>{register ? "Start your reset" : "Welcome back"}</h2>
        <p className="auth-intro">{register ? "Create a free workspace and make today count." : "Sign in and pick up where you left off."}</p>
        {authNotice && <div className="auth-notice" role="status">{authNotice}</div>}
        <div className="auth-tabs" role="tablist" aria-label="Account options">
          <button
            className={`auth-tab ${!register ? "active" : ""}`}
            data-action="auth-mode"
            data-mode="login"
            role="tab"
            aria-selected={!register}
            onClick={() => handleModeSwitch("login")}
          >
            Log in
          </button>
          <button
            className={`auth-tab ${register ? "active" : ""}`}
            data-action="auth-mode"
            data-mode="register"
            role="tab"
            aria-selected={register}
            onClick={() => handleModeSwitch("register")}
          >
            Sign up
          </button>
        </div>
        <form id="auth-form" className="form-stack" onSubmit={handleAuthSubmit}>
          {register && (
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" name="name" autoComplete="name" placeholder="Alex Morgan" required maxLength={80} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              placeholder="At least 6 characters"
              required
              minLength={6}
            />
          </div>
          {!register && (
            <button
              className="forgot-link"
              type="button"
              data-action="auth-mode"
              data-mode="forgot"
              onClick={() => handleModeSwitch("forgot")}
            >
              Forgot password?
            </button>
          )}
          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
            {loading ? "Please wait…" : register ? "Create my workspace" : "Log in to StudyReset"}
          </button>
        </form>
        <p className="demo-note">Your study data is private to your account. No social feed, no distractions.</p>
      </>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <div className="brand"><span className="brand-mark">↗</span> StudyReset</div>
        <div className="hero-copy">
          <p className="eyebrow">Reset the way you study</p>
          <h1>Turn scattered plans into <em>steady progress.</em></h1>
          <p>A calm workspace for planning what matters, protecting your focus, and ending each day with visible progress.</p>
        </div>
        <div className="mini-dashboard" aria-hidden="true">
          <div className="mini-card"><span>Today’s focus</span><strong>Data Structures · 45 min</strong></div>
          <div className="mini-card accent"><span>Daily reset</span><strong>Plan with your real energy ↗</strong></div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-box">{authContent}</div>
      </section>
    </main>
  );
};
