import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { InlineError } from "../components/States";
import { ReviewNotice } from "../components/ReviewNotice";

function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login")) return next;
  return "/dashboard";
}

export default function Login() {
  const { token, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = safeNext(params.get("next"));
  if (token) return <Navigate to={next} replace />;

  const isRegister = mode === "register";
  const passwordTooShort = isRegister && password.length > 0 && password.length < 8;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isRegister && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      if (isRegister) await register(email.trim(), password, fullName.trim() || null);
      else await login(email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <span aria-hidden="true" className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-accent-600 font-bold text-white">
            CT
          </span>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Trial Eligibility Support</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isRegister ? "Create an account to get started." : "Sign in to continue."}
          </p>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4 p-6" aria-busy={busy}>
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {isRegister ? (
            <div>
              <label htmlFor="full_name" className="label">
                Full name <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input id="full_name" type="text" autoComplete="name" maxLength={200} className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          ) : null}
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? 8 : undefined}
              maxLength={128}
              aria-describedby={isRegister ? "password-hint" : undefined}
              aria-invalid={passwordTooShort || undefined}
              className={`input ${passwordTooShort ? "input-invalid" : ""}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {isRegister ? (
              <p id="password-hint" className={`mt-1 text-xs ${passwordTooShort ? "font-semibold text-amber-900" : "text-slate-600"}`}>
                At least 8 characters{passwordTooShort ? ` (${password.length}/8)` : ""}.
              </p>
            ) : null}
          </div>
          <InlineError message={error} />
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? (isRegister ? "Creating account…" : "Signing in…") : isRegister ? "Create account" : "Sign in"}
          </button>
          <p className="text-center text-sm text-slate-600">
            {isRegister ? "Already have an account?" : "No account yet?"}{" "}
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode(isRegister ? "login" : "register");
                setError(null);
              }}
            >
              {isRegister ? "Sign in" : "Register"}
            </button>
          </p>
        </form>
        <ReviewNotice compact />
      </div>
    </div>
  );
}
