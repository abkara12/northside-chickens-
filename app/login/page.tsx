"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

/* =====================================================================
   Shared design tokens — see app/page.tsx, app/order/page.tsx,
   app/order/success/[id]/page.tsx
   ===================================================================== */
const FONT_DISPLAY = "font-['Fraunces',_serif]";
const FONT_MONO = "font-['IBM_Plex_Mono',_monospace]";

const STAFF_INVITE_CODE = "NORTHSIDEPOULTRY2026";

function FontLoader() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Work+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"
        rel="stylesheet"
      />
    </>
  );
}

function FieldInput({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-[#221E19]/80">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FFFDF8] px-4 text-sm text-[#221E19] outline-none transition placeholder:text-[#221E19]/30 focus:border-[#221E19]"
      />
    </div>
  );
}

export default function StaffRegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function getFriendlyError(message: string) {
    if (message.includes("auth/email-already-in-use")) {
      return "That email is already registered. Please sign in instead.";
    }
    if (message.includes("auth/invalid-email")) {
      return "Please enter a valid email address.";
    }
    if (message.includes("auth/weak-password")) {
      return "Password should be at least 6 characters.";
    }
    return "Unable to create the staff account right now. Please try again.";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!fullName.trim() || !email.trim() || !password.trim() || !inviteCode.trim()) {
      setError("Please complete all fields.");
      return;
    }

    if (inviteCode.trim() !== STAFF_INVITE_CODE) {
      setError("The invite code entered is incorrect.");
      return;
    }

    try {
      setSubmitting(true);

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );

      const uid = userCredential.user.uid;

      await setDoc(doc(db, "users", uid), {
        name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role: "staff",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      window.location.assign("/admin");
    } catch (err: any) {
      console.error("Staff registration error:", err);
      setError(getFriendlyError(err?.message || ""));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#FAF6EE] font-['Work_Sans',sans-serif] text-[#221E19]">
      <FontLoader />

      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.035] bg-[radial-gradient(#221E19_1px,transparent_1px)] bg-[size:18px_18px]" />

      <header className="mx-auto flex max-w-7xl items-center justify-between border-b-2 border-[#221E19] px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-[#221E19] bg-[#FFFDF8]">
            <Image src="/logo4.png" alt="Northside Chickens" width={90} height={90} className="object-contain rounded-full" priority />
          </div>
          <div className="hidden sm:block">
            <div className={`${FONT_DISPLAY} text-lg font-semibold leading-none`}>Northside Chickens</div>
            <div className={`${FONT_MONO} mt-1 text-[10px] uppercase tracking-[0.24em] text-[#221E19]/50`}>
              Staff registration
            </div>
          </div>
        </Link>

        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-transparent px-4 text-sm font-semibold text-[#221E19] transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
        >
          Staff Sign In
        </Link>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-16 pt-8 sm:px-10 lg:pb-24">
        <div className="grid gap-8 xl:grid-cols-12 xl:gap-10">
          <div className="text-center xl:col-span-6 xl:text-left">
            <div className={`${FONT_MONO} inline-flex items-center gap-2 rounded-full border-[2.5px] border-[#A93E2E] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A93E2E]`}>
              Staff Registration
            </div>

            <h1 className={`${FONT_DISPLAY} mt-5 text-[2.35rem] font-semibold leading-[1.06] tracking-tight sm:text-[3rem] lg:text-[3.4rem]`}>
              Create your staff
              <span className="mt-1 block">account with</span>
              <span className="mt-1 block text-[#A93E2E]">secure access.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-[0.98rem] leading-7 text-[#221E19]/68 sm:text-[1.03rem] sm:leading-8 xl:mx-0">
              Use the staff invite code to create your login and get immediate access
              to the order and stock dashboard.
            </p>

            <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-3 xl:mx-0">
              {[
                { title: "Secure", text: "Only authorised staff can register" },
                { title: "Instant", text: "Access the dashboard immediately" },
                { title: "Organised", text: "Manage orders from one place" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[10px] border-2 border-[#221E19] bg-[#FFFDF8] px-5 py-4 text-center shadow-[3px_3px_0_0_#221E19] sm:text-left"
                >
                  <div className={`${FONT_MONO} text-[10px] uppercase tracking-[0.16em] text-[#221E19]/45`}>
                    {item.title}
                  </div>
                  <div className="mt-1 text-sm font-semibold leading-snug">{item.text}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="xl:col-span-6">
            <div className="mx-auto max-w-xl rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-6 shadow-[6px_6px_0_0_#221E19] sm:p-8">
              <div className="text-center xl:text-left">
                <p className={`${FONT_MONO} text-[11px] uppercase tracking-[0.22em] text-[#A93E2E]`}>
                  Create staff account
                </p>
                <h2 className={`${FONT_DISPLAY} mt-3 text-[1.9rem] font-semibold tracking-tight sm:text-[2.2rem]`}>
                  Register to continue
                </h2>
                <p className="mt-3 text-[0.98rem] leading-7 text-[#221E19]/65">
                  Enter your details and the invite code to create your staff login.
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-6">
                <FieldInput
                  id="fullName"
                  label="Full name"
                  value={fullName}
                  onChange={setFullName}
                  placeholder="Enter your full name"
                />
                <FieldInput
                  id="email"
                  label="Email address"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="Enter your email address"
                />
                <FieldInput
                  id="password"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Create a password"
                />
                <FieldInput
                  id="inviteCode"
                  label="Staff invite code"
                  value={inviteCode}
                  onChange={setInviteCode}
                  placeholder="Enter invite code"
                />

                {error ? (
                  <div className="rounded-[10px] border-2 border-[#A93E2E] bg-[#A93E2E]/10 p-4 text-center xl:text-left">
                    <p className="text-sm font-semibold text-[#A93E2E]">Unable to create account</p>
                    <p className="mt-1 text-sm leading-6 text-[#221E19]/70">{error}</p>
                  </div>
                ) : null}

                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                  <Link
                    href="/login"
                    className="inline-flex h-[42px] min-w-[156px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-transparent px-5 text-[13px] font-semibold text-[#221E19] transition hover:bg-[#221E19] hover:text-[#FAF6EE] sm:text-[14px]"
                  >
                    Staff Sign In
                  </Link>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-[46px] min-w-[210px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#C4872C] px-6 text-[14px] font-semibold text-[#221E19] shadow-[4px_4px_0_0_#221E19] transition active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 sm:text-[15px]"
                  >
                    {submitting ? "Creating Account..." : "Create Staff Account"}
                  </button>
                </div>
              </form>

              <div className="mt-8 rounded-[10px] border-2 border-dashed border-[#E4D9C4] p-5 text-center xl:text-left">
                <p className="text-sm font-medium text-[#221E19]/80">
                  Only authorised staff should have the invite code
                </p>
                <p className="mt-2 text-sm leading-6 text-[#221E19]/60">
                  Once your account is created, you can sign in normally and access
                  the dashboard immediately.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}