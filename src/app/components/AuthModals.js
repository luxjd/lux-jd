"use client";

import { useState } from "react";

export default function AuthModals({ children }) {
  const [activeModal, setActiveModal] = useState(null); // 'login' | 'signup' | null
  const [showPassword, setShowPassword] = useState(false);

  const openLogin = () => {
    setActiveModal("login");
    setShowPassword(false);
  };
  const openSignup = () => {
    setActiveModal("signup");
    setShowPassword(false);
  };
  const close = () => {
    setActiveModal(null);
    setShowPassword(false);
  };

  const switchToSignup = (e) => {
    e.preventDefault();
    setShowPassword(false);
    setActiveModal("signup");
  };
  const switchToLogin = (e) => {
    e.preventDefault();
    setShowPassword(false);
    setActiveModal("login");
  };

  return (
    <>
      {children({ openLogin, openSignup })}

      {/* Backdrop + Modal */}
      {activeModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={close}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Modal */}
          <div
            className="relative z-10 w-full max-w-md rounded-3xl border border-outline-variant/20 bg-surface-container p-8 shadow-[0_0_60px_rgba(173,198,255,0.1)] animate-[modalIn_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={close}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            {activeModal === "login" ? (
              /* ─── Login Form ─── */
              <div>
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 mb-4">
                    <span className="material-symbols-outlined text-primary text-3xl">
                      lock_open
                    </span>
                  </div>
                  <h2 className="font-headline text-2xl font-bold">
                    Welcome Back
                  </h2>
                  <p className="text-on-surface-variant text-sm mt-1">
                    Sign in to access your portfolio
                  </p>
                </div>

                <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2 font-label">
                      Email
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">
                        mail
                      </span>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 focus:shadow-[0_0_10px_rgba(173,198,255,0.15)] transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2 font-label">
                      Password
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">
                        lock
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        className="w-full pl-11 pr-11 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 focus:shadow-[0_0_10px_rgba(173,198,255,0.15)] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                      >
                        <span className="material-symbols-outlined text-xl">
                          {showPassword ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <span className="text-on-surface-variant">Remember me</span>
                    </label>
                    <a
                      href="#"
                      className="text-primary hover:text-primary-fixed transition-colors"
                    >
                      Forgot password?
                    </a>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-primary text-on-primary font-bold rounded-xl text-lg hover:shadow-[0_0_25px_rgba(173,198,255,0.5)] transition-all duration-300 active:scale-[0.98]"
                  >
                    Sign In
                  </button>
                </form>

                <div className="mt-6 relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-outline-variant/20"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-surface-container px-3 text-on-surface-variant tracking-widest">
                      or
                    </span>
                  </div>
                </div>

                <button className="mt-6 w-full py-3 border border-outline-variant/20 rounded-xl text-on-surface font-medium hover:bg-surface-container-high transition-all flex items-center justify-center gap-3">
                  <span className="material-symbols-outlined text-xl">
                    g_translate
                  </span>
                  Continue with Google
                </button>

                <p className="text-center text-sm text-on-surface-variant mt-6">
                  Don&apos;t have an account?{" "}
                  <a
                    href="#"
                    onClick={switchToSignup}
                    className="text-secondary font-bold hover:text-secondary-fixed transition-colors"
                  >
                    Sign Up
                  </a>
                </p>
              </div>
            ) : (
              /* ─── Signup Form ─── */
              <div>
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary/10 border border-secondary/20 mb-4">
                    <span className="material-symbols-outlined text-secondary text-3xl">
                      rocket_launch
                    </span>
                  </div>
                  <h2 className="font-headline text-2xl font-bold">
                    Join the Network
                  </h2>
                  <p className="text-on-surface-variant text-sm mt-1">
                    Create your luxury arbitrage account
                  </p>
                </div>

                <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2 font-label">
                        First Name
                      </label>
                      <input
                        type="text"
                        placeholder="John"
                        className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary/50 focus:shadow-[0_0_10px_rgba(234,193,105,0.15)] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2 font-label">
                        Last Name
                      </label>
                      <input
                        type="text"
                        placeholder="Doe"
                        className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary/50 focus:shadow-[0_0_10px_rgba(234,193,105,0.15)] transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2 font-label">
                      Email
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">
                        mail
                      </span>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary/50 focus:shadow-[0_0_10px_rgba(234,193,105,0.15)] transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2 font-label">
                      Password
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">
                        lock
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Min. 8 characters"
                        className="w-full pl-11 pr-11 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary/50 focus:shadow-[0_0_10px_rgba(234,193,105,0.15)] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                      >
                        <span className="material-symbols-outlined text-xl">
                          {showPassword ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      className="w-4 h-4 mt-0.5 rounded accent-secondary"
                    />
                    <span className="text-on-surface-variant">
                      I agree to the{" "}
                      <a href="#" className="text-primary hover:underline">
                        Terms of Service
                      </a>{" "}
                      and{" "}
                      <a href="#" className="text-primary hover:underline">
                        Privacy Policy
                      </a>
                    </span>
                  </label>

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-secondary text-on-secondary font-bold rounded-xl text-lg hover:shadow-[0_0_25px_rgba(234,193,105,0.5)] transition-all duration-300 active:scale-[0.98]"
                  >
                    Create Account
                  </button>
                </form>

                <div className="mt-6 relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-outline-variant/20"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-surface-container px-3 text-on-surface-variant tracking-widest">
                      or
                    </span>
                  </div>
                </div>

                <button className="mt-6 w-full py-3 border border-outline-variant/20 rounded-xl text-on-surface font-medium hover:bg-surface-container-high transition-all flex items-center justify-center gap-3">
                  <span className="material-symbols-outlined text-xl">
                    g_translate
                  </span>
                  Sign up with Google
                </button>

                <p className="text-center text-sm text-on-surface-variant mt-6">
                  Already have an account?{" "}
                  <a
                    href="#"
                    onClick={switchToLogin}
                    className="text-primary font-bold hover:text-primary-fixed transition-colors"
                  >
                    Sign In
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
