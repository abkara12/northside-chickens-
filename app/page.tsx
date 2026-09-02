"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./lib/firebase";

/* =====================================================================
   DESIGN TOKENS — "Butcher's Ticket"
   bg (paper):     #FAF6EE
   card (paper+):  #FFFDF8
   ink (text):     #221E19
   ink-soft:       #6B6459
   line (paper):   #E4D9C4
   gold (accent):  #A6752E
   teal (stamp):   #1F4B4A
   sage (fresh):   #57624C
   ===================================================================== */

const FONT_DISPLAY = "font-['Fraunces',_serif]";
const FONT_MONO = "font-['IBM_Plex_Mono',_monospace]";

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

/* ---------------- PWA Install Prompt ---------------- */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIosDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as any).standalone === true;
  const mql = window.matchMedia?.("(display-mode: standalone)");
  const displayModeStandalone = mql ? mql.matches : false;
  return iosStandalone || displayModeStandalone;
}

function InstallAppPrompt() {
  const [open, setOpen] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  const DISMISS_KEY = "pwa_install_dismissed_at";
  const DISMISS_COOLDOWN_HOURS = 6;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ios = isIosDevice();
    setIsIOS(ios);

    const standaloneNow = isStandaloneMode();
    setStandalone(standaloneNow);

    if (standaloneNow) {
      setOpen(false);
      return;
    }

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || "0");
    const hoursSince = dismissedAt ? (Date.now() - dismissedAt) / (1000 * 60 * 60) : 999;

    if (ios) {
      if (hoursSince >= DISMISS_COOLDOWN_HOURS) setOpen(true);
      return;
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (hoursSince >= DISMISS_COOLDOWN_HOURS) setOpen(true);
    };

    const onInstalled = () => {
      setOpen(false);
      setDeferred(null);
      localStorage.removeItem(DISMISS_KEY);
      setStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setOpen(false);
        localStorage.removeItem(DISMISS_KEY);
      } else {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setOpen(false);
      }
    } catch {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      setOpen(false);
    }
  }

  function handleClose() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setOpen(false);
  }

  if (standalone || !open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-[#221E19]/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md overflow-hidden rounded-[8px] border-2 border-[#221E19] bg-[#FFFDF8] shadow-[8px_8px_0_0_#221E19]">
        <div className="border-b-2 border-dashed border-[#E4D9C4] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className={`${FONT_MONO} text-[10px] uppercase tracking-[0.28em] text-[#1F4B4A]`}>
                — Install —
              </div>
              <h3 className={`${FONT_DISPLAY} mt-2 text-xl font-semibold tracking-tight text-[#221E19]`}>
                Add Northside Chickens to your Home Screen
              </h3>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[#221E19] text-[#221E19] transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          {isIOS ? (
            <div className="rounded-[6px] border border-[#E4D9C4] bg-[#FAF6EE] p-4 text-sm text-[#221E19]/80">
              <div className="font-semibold text-[#221E19]">On iPhone / iPad (Safari):</div>
              <ol className="mt-2 list-inside list-decimal space-y-1">
                <li>Tap the <span className="font-semibold">Share</span> button</li>
                <li>Select <span className="font-semibold">Add to Home Screen</span></li>
                <li>Tap <span className="font-semibold">Add</span></li>
              </ol>
            </div>
          ) : (
            <div className="rounded-[6px] border border-[#E4D9C4] bg-[#FAF6EE] p-4 text-sm text-[#221E19]/80">
              {deferred ? (
                <div>Tap <span className="font-semibold">Install</span> for quick access to your orders and stock updates.</div>
              ) : (
                <div>Instantly access your orders, payment status, and stock updates.</div>
              )}
            </div>
          )}

          <div className="mt-5 flex gap-3">
            {!isIOS ? (
              <button
                type="button"
                onClick={handleInstall}
                disabled={!deferred}
                className="h-11 flex-1 rounded-[6px] border-2 border-[#221E19] bg-gradient-to-b from-[#C29A52] to-[#8F6023] font-semibold text-[#221E19] shadow-[3px_3px_0_0_#221E19] transition hover:brightness-105 disabled:opacity-50"
              >
                Install
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleClose}
              className="h-11 flex-1 rounded-[6px] border-2 border-[#221E19] bg-transparent font-semibold text-[#221E19] transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Icons ---------------- */
function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`} fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function FeatherIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path d="M20 4c-6 0-14 4-16 12 3 1 6 1 8 0M20 4c0 6-4 14-12 16-1-3-1-6 0-8M20 4L8 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path d="M12 3v18M7 21h10M4 7h6M14 7h6M4 7l-2 5a3 3 0 006 0l-2-5M20 7l-2 5a3 3 0 006 0l-2-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CrateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path d="M3 8l9-5 9 5-9 5-9-5zM3 8v8l9 5 9-5V8M3 8l9 5M21 8l-9 5M12 13v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- Signature element: ink stamp badge ---------------- */
function StampBadge({
  text,
  rotate = -6,
  tone = "rust",
  size = "md",
}: {
  text: string;
  rotate?: number;
  tone?: "rust" | "sage";
  size?: "sm" | "md";
}) {
  const bg = tone === "rust" ? "#1F4B4A" : "#57624C";
  const pad = size === "sm" ? "px-3 py-2 text-[10px]" : "px-5 py-3.5 text-[12px]";
  return (
    <div
      className={`${FONT_MONO} inline-flex items-center gap-2 rounded-full border-2 border-[#221E19] ${pad} font-semibold uppercase tracking-[0.18em] text-[#FAF6EE] shadow-[3px_3px_0_0_#221E19]`}
      style={{ background: bg, transform: `rotate(${rotate}deg)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#D9B573]" />
      {text}
    </div>
  );
}

/* ---------------- Ticket / tag card wrapper ---------------- */
function TicketCard({
  children,
  className = "",
  rotate = 0,
  accent = "ink",
}: {
  children: ReactNode;
  className?: string;
  rotate?: number;
  accent?: "ink" | "teal" | "gold";
}) {
  const accents = {
    ink: { border: "border-[#221E19]", shadow: "shadow-[5px_5px_0_0_#221E19]", hole: "border-[#221E19]" },
    teal: { border: "border-[#1F4B4A]", shadow: "shadow-[5px_5px_0_0_#1F4B4A,0_20px_45px_-20px_rgba(31,75,74,0.55)]", hole: "border-[#1F4B4A]" },
    gold: { border: "border-[#8F6023]", shadow: "shadow-[5px_5px_0_0_#8F6023,0_20px_45px_-20px_rgba(166,117,46,0.55)]", hole: "border-[#8F6023]" },
  }[accent];
  return (
    <div
      className={`relative rounded-[10px] border-2 ${accents.border} bg-[#FFFDF8] ${accents.shadow} ${className}`}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      {/* punch hole */}
      <span className={`absolute -left-[2px] top-5 h-3 w-3 -translate-x-1/2 rounded-full border-2 ${accents.hole} bg-[#FAF6EE]`} />
      {children}
    </div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className={`${FONT_MONO} text-center text-[11px] uppercase tracking-[0.32em] text-[#1F4B4A] sm:text-left`}>
      {children}
    </p>
  );
}

function ProductCard({
  title,
  text,
  icon,
  rotate,
  tone = "gold",
}: {
  title: string;
  text: string;
  icon: ReactNode;
  rotate: number;
  tone?: "gold" | "teal" | "sage";
}) {
  const gradients = {
    gold: "from-[#C29A52] to-[#8F6023]",
    teal: "from-[#2F6B69] to-[#123837]",
    sage: "from-[#8C9A7C] to-[#4B5540]",
  }[tone];
  const iconInk = tone === "gold" ? "text-[#221E19]" : "text-[#FAF6EE]";
  return (
    <TicketCard rotate={rotate} className="p-7 pl-9 text-center transition-transform duration-300 hover:!rotate-0 hover:-translate-y-1 sm:text-left">
      <div className={`mx-auto grid h-12 w-12 place-items-center rounded-full border-2 border-[#221E19] bg-gradient-to-b ${gradients} ${iconInk} shadow-[2px_2px_0_0_#221E19] sm:mx-0`}>
        {icon}
      </div>
      <h3 className={`${FONT_DISPLAY} mt-5 text-[1.4rem] font-semibold tracking-tight text-[#221E19]`}>{title}</h3>
      <p className="mt-3 text-[0.96rem] leading-7 text-[#221E19]/65">{text}</p>
    </TicketCard>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="w-full rounded-[10px] border-2 border-[#221E19] bg-[#FFFDF8] p-6 text-left shadow-[4px_4px_0_0_#221E19] transition hover:shadow-[6px_6px_0_0_#221E19]"
      aria-expanded={open}
    >
      <div className="flex items-center justify-between gap-6">
        <h4 className={`${FONT_DISPLAY} text-lg font-semibold text-[#221E19]`}>{question}</h4>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[#221E19] text-[#221E19]">
          <ChevronIcon open={open} />
        </span>
      </div>
      <div className={`grid transition-all duration-300 ${open ? "mt-4 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <p className="leading-relaxed text-[#221E19]/70">{answer}</p>
        </div>
      </div>
    </button>
  );
}

function MenuRow({
  href,
  label,
  sub,
  onClick,
  variant = "default",
}: {
  href: string;
  label: string;
  sub?: string;
  onClick: () => void;
  variant?: "default" | "primary";
}) {
  const primary = "border-[#221E19] bg-gradient-to-b from-[#C29A52] to-[#8F6023] text-[#221E19]";
  const normal = "border-[#221E19] bg-[#FFFDF8] text-[#221E19]";
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[8px] border-2 px-4 py-4 text-sm font-semibold shadow-[3px_3px_0_0_#221E19] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${
        variant === "primary" ? primary : normal
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className={`${FONT_DISPLAY} text-base leading-tight`}>{label}</div>
          {sub ? <div className="mt-1 text-xs font-medium text-[#221E19]/55">{sub}</div> : null}
        </div>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[#221E19]">
          <ArrowIcon />
        </div>
      </div>
    </Link>
  );
}

function TicketLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-[#E4D9C4] py-2.5 last:border-0">
      <span className="text-[13px] text-[#221E19]/55">{label}</span>
      <span className={`${FONT_MONO} text-[13px] font-semibold text-[#221E19]`}>{value}</span>
    </div>
  );
}

type SavedOrderState = { id: string; reference: string };

function PrimaryButton({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-[46px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-gradient-to-b from-[#C29A52] to-[#8F6023] px-7 text-[14px] font-semibold text-[#221E19] shadow-[4px_4px_0_0_#221E19,0_14px_28px_-10px_rgba(166,117,46,0.6)] transition hover:brightness-105 active:translate-x-1 active:translate-y-1 active:shadow-none sm:text-[15px] ${className}`}
    >
      {children}
    </Link>
  );
}

function SecondaryButton({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-[42px] items-center justify-center rounded-[8px] border-2 border-[#1F4B4A] bg-transparent px-6 text-[13px] font-semibold text-[#1F4B4A] transition hover:bg-[#1F4B4A] hover:text-[#FAF6EE] sm:text-[14px] ${className}`}
    >
      {children}
    </Link>
  );
}

export default function Home() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuState, setMenuState] = useState<"open" | "closed">("closed");
  const [user, setUser] = useState<User | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [savedOrder, setSavedOrder] = useState<SavedOrderState | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsStaff(false);
      if (!u) return;
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const role = snap.exists() ? (snap.data() as any).role : null;
        setIsStaff(role === "admin" || role === "staff");
      } catch {
        setIsStaff(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    async function loadSavedOrder() {
      if (typeof window === "undefined") return;
      const id = localStorage.getItem("poultry_last_order_id");
      const reference = localStorage.getItem("poultry_last_order_reference");
      if (!id || !reference) {
        setSavedOrder(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "orders", id));
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data?.cancelled) {
            localStorage.removeItem("poultry_last_order_id");
            localStorage.removeItem("poultry_last_order_reference");
            setSavedOrder(null);
          } else {
            setSavedOrder({ id, reference });
          }
        } else {
          localStorage.removeItem("poultry_last_order_id");
          localStorage.removeItem("poultry_last_order_reference");
          setSavedOrder(null);
        }
      } catch (error) {
        console.error("Failed to check saved order:", error);
        setSavedOrder(null);
      }
    }
    loadSavedOrder();
  }, []);

  function closeMenu() {
    setMenuState("closed");
    setTimeout(() => setMobileOpen(false), 500);
  }

  return (
    <main id="top" className="min-h-screen overflow-x-hidden bg-[#FAF6EE] font-['Work_Sans',sans-serif] text-[#221E19]">
      <FontLoader />
      <InstallAppPrompt />

      {/* subtle paper grain + top hairline */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.035] bg-[radial-gradient(#221E19_1px,transparent_1px)] bg-[size:18px_18px]" />

      {/* NAVBAR */}
      <header className="relative z-40 mx-auto flex max-w-7xl items-center justify-between border-b-2 border-[#221E19] px-6 py-3 sm:px-10 sm:py-4">
        {/* split background: white panel behind the logo, cream behind the nav links */}
        <div className="pointer-events-none absolute inset-0 -z-10 flex overflow-hidden">
          <div
            className="h-full w-[62%] bg-[#FFFDF8] sm:w-[48%]"
            style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 34px) 100%, 0 100%)" }}
          />
          <div className="h-full flex-1 bg-[#FAF6EE]" />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 left-[calc(62%-34px)] -z-10 w-[3px] bg-gradient-to-b from-[#A6752E] via-[#1F4B4A] to-[#57624C] sm:left-[calc(48%-34px)]"
        />

        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28">
            <Image src="/logo4.png" alt="Northside Chickens" fill sizes="140px" className="object-contain" priority />
          </div>
          <div className="hidden sm:block">
            <div className={`${FONT_DISPLAY} text-lg font-semibold leading-none`}>Northside Chickens</div>
            <div className={`${FONT_MONO} mt-1 text-[10px] uppercase tracking-[0.24em] text-[#221E19]/50`}>Fresh Chicken · Done Right</div>
          </div>
        </div>

        <div className="hidden items-center gap-1 lg:flex">
          <a href="#about" className="rounded-[6px] px-4 py-2 text-sm font-medium transition hover:text-[#1F4B4A]">About</a>
          <a href="#products" className="rounded-[6px] px-4 py-2 text-sm font-medium transition hover:text-[#1F4B4A]">Products</a>
          <a href="#platform" className="rounded-[6px] px-4 py-2 text-sm font-medium transition hover:text-[#1F4B4A]">How It Works</a>
          <a href="#faq" className="rounded-[6px] px-4 py-2 text-sm font-medium transition hover:text-[#1F4B4A]">FAQ</a>

          <div className="ml-3 flex items-center gap-2">
            {isStaff ? (
              <>
                <SecondaryButton href="/admin">Staff Dashboard</SecondaryButton>
                {savedOrder ? (
                  <SecondaryButton href={`/order/success/${savedOrder.id}`}>View My Order</SecondaryButton>
                ) : (
                  <PrimaryButton href="/order" className="!h-[42px]">Place Order</PrimaryButton>
                )}
              </>
            ) : savedOrder ? (
              <PrimaryButton href={`/order/success/${savedOrder.id}`} className="!h-[42px]">View My Order</PrimaryButton>
            ) : (
              <>
                <SecondaryButton href="/login">Staff Sign In</SecondaryButton>
                <PrimaryButton href="/order" className="!h-[42px]">Place Order</PrimaryButton>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setMobileOpen(true);
            setMenuState("open");
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#221E19] lg:hidden"
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>
      </header>
      <div className="h-[3px] w-full bg-gradient-to-r from-[#A6752E] via-[#1F4B4A] to-[#57624C]" />

      {/* MOBILE MENU */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100]">
          <div
            onClick={closeMenu}
            className={`absolute inset-0 bg-[#221E19]/50 backdrop-blur-sm transition-opacity duration-500 ${menuState === "open" ? "opacity-100" : "opacity-0"}`}
          />
          <div
            className={`absolute right-0 top-0 h-full w-[90%] max-w-sm border-l-2 border-[#221E19] bg-[#FAF6EE] shadow-2xl transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${
              menuState === "open" ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex h-full flex-col p-6">
              <div className="flex items-center justify-between border-b-2 border-[#221E19] pb-5">
                <div className="flex items-center gap-3">
                  <div className="relative h-20 w-20 shrink-0 rounded-full bg-[#FFFDF8] p-1.5 shadow-[2px_2px_0_0_#221E19]">
                    <Image src="/logo4.png" alt="Northside Chickens" fill sizes="140px" className="object-contain" priority />
                  </div>
                  <div>
                    <div className={`${FONT_DISPLAY} text-sm font-semibold leading-tight`}>Northside Chickens</div>
                    <div className="text-xs text-[#221E19]/55">Menu</div>
                  </div>
                </div>
                <button type="button" onClick={closeMenu} className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#221E19]" aria-label="Close menu">
                  <CloseIcon />
                </button>
              </div>

              <div className="mt-6 grid gap-3">
                <MenuRow href="/" label="Home" sub="Return to homepage" onClick={closeMenu} />
                <MenuRow href="#about" label="About" sub="Who we are and what we do" onClick={closeMenu} />
                <MenuRow href="#products" label="Products" sub="Cuts and portions available" onClick={closeMenu} />
                <MenuRow href="#platform" label="How It Works" sub="How ordering works" onClick={closeMenu} />
                <MenuRow href="#faq" label="FAQ" sub="Common questions" onClick={closeMenu} />
                <div className="my-1 h-px bg-[#E4D9C4]" />

                {isStaff ? (
                  <>
                    <MenuRow href="/admin" label="Staff Dashboard" sub="Manage orders and stock" onClick={closeMenu} variant="primary" />
                    {savedOrder ? (
                      <MenuRow href={`/order/success/${savedOrder.id}`} label="View My Order" sub={`Reference: ${savedOrder.reference}`} onClick={closeMenu} />
                    ) : (
                      <MenuRow href="/order" label="Place Order" sub="Create your own customer order" onClick={closeMenu} />
                    )}
                  </>
                ) : savedOrder ? (
                  <MenuRow href={`/order/success/${savedOrder.id}`} label="View My Order" sub={`Reference: ${savedOrder.reference}`} onClick={closeMenu} variant="primary" />
                ) : (
                  <>
                    <MenuRow href="/order" label="Place Order" sub="Start your order" onClick={closeMenu} variant="primary" />
                    <MenuRow href="/login" label="Staff Sign In" sub="Access staff operations" onClick={closeMenu} />
                  </>
                )}
              </div>

              <div className="mt-auto pt-6">
                <div className="rounded-[8px] border-2 border-dashed border-[#E4D9C4] px-5 py-4">
                  <div className={`${FONT_MONO} text-[10px] uppercase tracking-[0.24em] text-[#1F4B4A]`}>Quick tip</div>
                  <div className="mt-1 text-sm text-[#221E19]/70">Add the app to your home screen for faster ordering next time.</div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-[#221E19]/45">
                  <span>© {new Date().getFullYear()} Northside Chickens</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HERO */}
      <section className="relative mx-auto max-w-7xl px-6 pb-16 pt-14 sm:px-10 lg:pt-20">
        {/* decorative color blobs */}
        <div className="pointer-events-none absolute -left-24 -top-10 -z-10 h-72 w-72 rounded-full bg-[#1F4B4A] opacity-[0.16] blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-24 -z-10 h-80 w-80 rounded-full bg-[#A6752E] opacity-[0.18] blur-3xl" />
        <div className="pointer-events-none absolute left-1/3 bottom-0 -z-10 h-64 w-64 rounded-full bg-[#57624C] opacity-[0.12] blur-3xl" />
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          <div className="text-center lg:col-span-7 lg:text-left">
            <StampBadge text="Fresh Chicken · Done Right" rotate={-4} />

            <h1 className={`${FONT_DISPLAY} mt-6 text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[3.4rem] lg:text-[4.2rem]`}>
              Northside
              <br />

              <span className="bg-gradient-to-r from-[#1F4B4A] via-[#2F6B69] to-[#A6752E] bg-clip-text text-transparent">Chickens</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-[1.02rem] leading-8 text-[#221E19]/70 lg:mx-0">
     Northside Chickens supplies fresh, quality chicken — whole birds and a full range of cut portions — sourced daily and ready to collect or have delivered.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              {isStaff ? (
                <>
                  <PrimaryButton href="/admin">Staff Dashboard</PrimaryButton>
                  {savedOrder ? (
                    <SecondaryButton href={`/order/success/${savedOrder.id}`}>View My Order</SecondaryButton>
                  ) : (
                    <SecondaryButton href="/order">Place Order</SecondaryButton>
                  )}
                </>
              ) : savedOrder ? (
                <PrimaryButton href={`/order/success/${savedOrder.id}`}>View My Order</PrimaryButton>
              ) : (
                <>
                  <PrimaryButton href="/order">Place Your Order</PrimaryButton>
                  <SecondaryButton href="/login">Staff Sign In</SecondaryButton>
                </>
              )}
            </div>

            {savedOrder ? (
              <div className="mx-auto mt-6 max-w-md rounded-[8px] border-2 border-dashed border-[#57624C] px-5 py-4 text-center lg:mx-0 lg:text-left">
                <div className={`${FONT_MONO} text-[10px] uppercase tracking-[0.24em] text-[#57624C]`}>Order saved on this device</div>
                <div className="mt-2 text-sm font-semibold">Reference: {savedOrder.reference}</div>
              </div>
            ) : null}

            <div className="mx-auto mt-10 hidden max-w-2xl grid-cols-3 gap-3 md:grid lg:mx-0">
              {[
                { k: "Sourced fresh", v: "Not frozen stock", accent: "#A6752E" },
                { k: "Cut to order", v: "Whole or portioned", accent: "#1F4B4A" },
                { k: "Ready on time", v: "Collection & delivery", accent: "#57624C" },
              ].map((item) => (
                <div key={item.k} className="rounded-[8px] border border-[#E4D9C4] border-l-4 px-4 py-3 text-center lg:text-left" style={{ borderLeftColor: item.accent }}>
                  <div className="text-[11px] text-[#221E19]/45">{item.k}</div>
                  <div className={`${FONT_MONO} mt-1 text-[12px] font-semibold`} style={{ color: item.accent }}>{item.v}</div>
                </div>
              ))}
            </div>
          </div>

{/* SIGNATURE: order ticket showcase */}
          <div className="lg:col-span-5">
            <div className="relative mx-auto max-w-sm rotate-[1.5deg]">
              <div className="absolute -right-4 -top-4 z-10 rotate-12">
                <StampBadge text="Example Order" tone="sage" rotate={8} size="sm" />
              </div>
              <TicketCard rotate={0} accent="teal" className="p-0">
                <div className="border-b-2 border-dashed border-[#E4D9C4] px-6 py-5">
                  <div className={`${FONT_MONO} text-[10px] uppercase tracking-[0.28em] text-[#221E19]/45`}>What Ordering Looks Like</div>
                  <div className={`${FONT_DISPLAY} mt-1 text-xl font-semibold`}>Order Ticket</div>
                </div>
                <div className="px-6 py-5">
                  <TicketLine label="Whole Chicken × 2" value="R240.00" />
                  <TicketLine label="Chicken Breasts (1kg)" value="R95.00" />
                  <TicketLine label="Drumsticks & Wings" value="R70.00" />
                  <TicketLine label="Mixed Portions Pack" value="R110.00" />
                </div>
                <div className="border-t-2 border-[#221E19] px-6 py-5">
                  <div className="flex items-center justify-between">
                    <span className={`${FONT_DISPLAY} text-lg font-semibold`}>Total</span>
                    <span className={`${FONT_MONO} text-lg font-bold text-[#1F4B4A]`}>R515.00</span>
                  </div>
                  <div className={`${FONT_MONO} mt-3 text-[10px] uppercase tracking-[0.2em] text-[#221E19]/40`}>
                    Ready for collection · Sat
                  </div>
                </div>
              </TicketCard>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="border-y-2 border-[#221E19] bg-[#FFFDF8] py-16 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 sm:px-10 lg:grid-cols-2 lg:items-center">
          <div className="text-center lg:text-left">
            <SectionEyebrow>About Northside Chickens</SectionEyebrow>
            <h2 className={`${FONT_DISPLAY} mt-4 text-[2rem] font-semibold leading-tight tracking-tight sm:text-[2.4rem]`}>
              Local.
              <br />
              Fresh.
              <br />
              Trusted.
            </h2>
            <p className="mt-5 text-[1rem] leading-8 text-[#221E19]/70">
              Northside Chickens is led by {""}
              <span className="font-semibold text-[#1F4B4A]">Moulana Shaheed Bhabha</span>, bringing
              years of experience sourcing and preparing quality chicken for
              the local community.
            </p>
            <p className="mt-4 text-[0.98rem] leading-7 text-[#221E19]/60">
Every order is prepared fresh, packed carefully, and ready on time — whether it's collection or delivery.
            </p>
          </div>

          <div className="flex justify-center gap-4">
            <div className="grid gap-4">
              <TicketCard rotate={-2} accent="gold" className="w-56 p-6">
                <div className={`${FONT_MONO} text-[10px] uppercase tracking-[0.2em] text-[#221E19]/45`}>Owner</div>
                <div className={`${FONT_DISPLAY} mt-1 text-lg font-semibold`}>Moulana Shaheed Bhabha</div>
              </TicketCard>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCTS */}
      <section id="products" className="py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <SectionEyebrow>Products</SectionEyebrow>
            <h2 className={`${FONT_DISPLAY} mt-3 text-[2rem] font-semibold tracking-tight sm:text-[2.5rem]`}>
              Fresh chicken, cut the way you need it.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[1rem] leading-7 text-[#221E19]/65">
              Choose whole chicken or a range of cut portions — everything
              prepared fresh around your collection or delivery slot.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <ProductCard
              title="Whole Chicken"
              text="Full birds, cleaned and ready to cook, prepared fresh close to your collection or delivery time."
              icon={<FeatherIcon />}
              rotate={-1.5}
              tone="gold"
            />
            <ProductCard
              title="Cut Portions"
              text="Breasts, thighs, drumsticks, wings, and mixed portion packs — pick the cuts that suit your order."
              icon={<ScaleIcon />}
              rotate={1}
              tone="teal"
            />
            <ProductCard
              title="Trusted Fulfilment"
              text="Every order is weighed, packed correctly, and ready on time — no surprises at collection."
              icon={<CrateIcon />}
              rotate={-1}
              tone="sage"
            />
          </div>
        </div>
      </section>

      {/* PLATFORM / HOW IT WORKS */}
      <section id="platform" className="relative overflow-hidden border-y-2 border-[#221E19] bg-gradient-to-br from-[#16302F] via-[#1F4B4A] to-[#0F2624] py-16 lg:py-24">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#D9B573] opacity-[0.10] blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6 sm:px-10">
          <div className="mb-12 text-center sm:text-left">
            <p className={`${FONT_MONO} text-center text-[11px] uppercase tracking-[0.32em] text-[#D9B573] sm:text-left`}>The platform</p>
            <h2 className={`${FONT_DISPLAY} mt-2 text-[2rem] font-semibold tracking-tight text-[#FAF6EE] sm:text-4xl`}>
              A structured process, ticket to table.
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {[
              { step: "NP-01", title: "Ordering", text: "Customers choose whole or cut chicken and submit their order through a clear, guided flow." },
              { step: "NP-02", title: "Preparation", text: "Orders are organised and prepared fresh, so stock is planned rather than guessed at." },
              { step: "NP-03", title: "Order Tracking", text: "Order status and stock sit in one place, visible to staff and the customer alike." },
              { step: "NP-04", title: "Collection / Delivery", text: "Collection and delivery are scheduled and confirmed." },
            ].map((item) => (
              <div key={item.step} className="relative rounded-[10px] border-2 border-[#D9B573]/30 bg-[#0F2624]/70 p-6 text-center shadow-[4px_4px_0_0_#0A1A19] backdrop-blur-sm sm:text-left">
                <div className={`${FONT_MONO} text-[11px] font-semibold tracking-[0.15em] text-[#D9B573]`}>{item.step}</div>
                <h3 className={`${FONT_DISPLAY} mt-3 text-xl font-semibold text-[#FAF6EE]`}>{item.title}</h3>
                <p className="mt-3 leading-relaxed text-[#FAF6EE]/65">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="relative grid items-center gap-10 overflow-hidden rounded-[16px] border-2 border-[#221E19] bg-gradient-to-br from-[#221E19] via-[#2A2118] to-[#17130F] p-8 shadow-[6px_6px_0_0_#221E19] sm:p-10 lg:grid-cols-12 lg:p-14">
            <div className="pointer-events-none absolute -bottom-16 -right-16 h-72 w-72 rounded-full bg-[#D9B573] opacity-[0.12] blur-3xl" />
            <div className="relative text-center lg:col-span-7 lg:text-left">
              <p className={`${FONT_MONO} text-center text-[11px] uppercase tracking-[0.32em] text-[#D9B573] sm:text-left`}>Why Northside Chickens stands apart</p>
              <h2 className={`${FONT_DISPLAY} mt-3 text-[2rem] font-semibold tracking-tight text-[#FAF6EE] sm:text-[2.4rem]`}>
                 Quality Chicken. Fair Prices. Every Time.
              </h2>
              <p className="mt-5 max-w-2xl text-[1rem] leading-7 text-[#FAF6EE]/65">
Northside Chickens has built its reputation on consistent quality and straightforward pricing — the same honest service whether you're ordering one pack or stocking up for the week.
              </p>
            </div>
            <div className="relative lg:col-span-5">
              <div className="grid gap-3">
                {[
                  { title: "Clearer communication", text: "Customers get a smooth, professional experience from the first tap.", accent: "#C29A52" },
                  { title: "Better stock control", text: "Staff see cuts and quantities at a glance — nothing gets double-booked.", accent: "#2F6B69" },
                  { title: "Stronger reputation", text: "A polished ordering process builds trust order after order.", accent: "#8C9A7C" },
                ].map((item) => (
                  <div key={item.title} className="rounded-[8px] border border-[#FAF6EE]/15 border-l-4 bg-[#FAF6EE]/5 px-5 py-4 text-center backdrop-blur-sm sm:text-left" style={{ borderLeftColor: item.accent }}>
                    <div className="text-[0.98rem] font-semibold text-[#FAF6EE]">{item.title}</div>
                    <div className="mt-1 text-sm leading-6 text-[#FAF6EE]/60">{item.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-y-2 border-[#221E19] bg-[#FFFDF8] py-16 lg:py-24">
        <div className="mx-auto max-w-4xl px-6 sm:px-10">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <SectionEyebrow>Questions & Answers</SectionEyebrow>
            <h2 className={`${FONT_DISPLAY} mt-3 text-[2rem] font-semibold tracking-tight sm:text-[2.4rem]`}>
              Frequently asked
            </h2>
          </div>
          <div className="grid gap-4">
            <FAQItem
              question="What makes Northside Chickens different?"
              answer="It combines trusted supply with a clear digital ordering system — so both customers and staff always know exactly where an order stands."
            />
            <FAQItem
              question="Can I choose specific cuts or portions?"
              answer="Yes — select whole chicken or specific cuts like breasts, thighs, drumsticks, and wings through a simple online order form."
            />
          
    <FAQItem
              question="Why use a digital platform for a chicken order?"
              answer="It makes ordering more convenient for you — you can see what's in stock, place your order from anywhere, and know exactly when it'll be ready for collection or delivery."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="grid items-center gap-10 rounded-[16px] border-2 border-[#221E19] bg-gradient-to-br from-[#C29A52] via-[#A6752E] to-[#7F5720] p-8 shadow-[6px_6px_0_0_#221E19] sm:p-10 lg:grid-cols-12 lg:p-14">
            <div className="text-center lg:col-span-8 lg:text-left">
              <div className={`${FONT_MONO} text-[11px] uppercase tracking-[0.28em] text-[#221E19]/70`}>Ready to proceed?</div>
              <h2 className={`${FONT_DISPLAY} mt-3 text-[2rem] font-semibold leading-tight tracking-tight sm:text-[2.4rem]`}>
                Place your order, or head to the staff dashboard.
              </h2>
              {savedOrder ? (
                <div className="mx-auto mt-5 max-w-md rounded-[8px] border-2 border-dashed border-[#221E19] px-5 py-4 text-center lg:mx-0 lg:text-left">
                  <div className={`${FONT_MONO} text-[10px] uppercase tracking-[0.24em] text-[#221E19]/60`}>Order saved</div>
                  <div className="mt-1 text-sm font-semibold">Reference: {savedOrder.reference}</div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col items-center justify-center gap-3 lg:col-span-4 lg:items-end">
              {isStaff ? (
                <Link href="/admin" className="inline-flex h-[46px] min-w-[182px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#FAF6EE] px-6 text-[14px] font-semibold shadow-[4px_4px_0_0_#221E19,0_14px_28px_-12px_rgba(0,0,0,0.35)]">
                  Staff Dashboard
                </Link>
              ) : savedOrder ? (
                <Link href={`/order/success/${savedOrder.id}`} className="inline-flex h-[46px] min-w-[182px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#FAF6EE] px-6 text-[14px] font-semibold shadow-[4px_4px_0_0_#221E19,0_14px_28px_-12px_rgba(0,0,0,0.35)]">
                  View My Order
                </Link>
              ) : (
                <>
                  <Link href="/order" className="inline-flex h-[46px] min-w-[182px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#FAF6EE] px-6 text-[14px] font-semibold shadow-[4px_4px_0_0_#221E19,0_14px_28px_-12px_rgba(0,0,0,0.35)]">
                    Place Your Order
                  </Link>
                  <Link href="/login" className="inline-flex h-[42px] min-w-[156px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-transparent px-5 text-[13px] font-medium">
                    Staff Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t-2 border-[#221E19] bg-gradient-to-b from-[#16302F] to-[#0F2624]">
        <div className="mx-auto max-w-7xl px-6 py-14 sm:px-10">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="text-center lg:col-span-4 lg:text-left">
              <div className="flex items-center justify-center gap-3 lg:justify-start">
                <div className="relative h-20 w-20 shrink-0 rounded-full bg-[#FFFDF8] p-1.5">
                  <Image src="/logo4.png" alt="Northside Chickens" fill sizes="80px" className="object-contain" priority />
                </div>
                <div>
                  <div className={`${FONT_DISPLAY} text-lg font-semibold text-[#FAF6EE]`}>Northside Chickens</div>
   
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 text-center sm:grid-cols-3 sm:text-left lg:col-span-7 lg:col-start-6">
              <div>
                <div className="mb-3 text-[0.92rem] font-semibold text-[#D9B573]">Explore</div>
                <div className="space-y-2.5">
                  <a href="/" className="block text-sm text-[#FAF6EE]/65 hover:text-[#FAF6EE]">Home</a>
                  <a href="#about" className="block text-sm text-[#FAF6EE]/65 hover:text-[#FAF6EE]">About</a>
                  <a href="#products" className="block text-sm text-[#FAF6EE]/65 hover:text-[#FAF6EE]">Products</a>
                </div>
              </div>
              <div>
                <div className="mb-3 text-[0.92rem] font-semibold text-[#D9B573]">Platform</div>
                <div className="space-y-2.5">
                  <a href="#platform" className="block text-sm text-[#FAF6EE]/65 hover:text-[#FAF6EE]">How It Works</a>
                  <a href="#faq" className="block text-sm text-[#FAF6EE]/65 hover:text-[#FAF6EE]">FAQ</a>
                  <a href="/login" className="block text-sm text-[#FAF6EE]/65 hover:text-[#FAF6EE]">Staff Sign In</a>
                </div>
              </div>
              <div>
                <div className="mb-3 text-[0.92rem] font-semibold text-[#D9B573]">Order</div>
                <div className="space-y-2.5">
                  {!isStaff ? <a href="/order" className="block text-sm text-[#FAF6EE]/65 hover:text-[#FAF6EE]">Place Order</a> : null}
                  {isStaff ? (
                    <a href="/admin" className="block text-sm text-[#FAF6EE]/65 hover:text-[#FAF6EE]">Staff Dashboard</a>
                  ) : savedOrder ? (
                    <a href={`/order/success/${savedOrder.id}`} className="block text-sm text-[#FAF6EE]/65 hover:text-[#FAF6EE]">View My Order</a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="my-8 h-px bg-[#FAF6EE]/10" />

          <div className="flex flex-col items-center justify-between gap-4 text-sm text-[#FAF6EE]/45 sm:flex-row">
            <span>© {new Date().getFullYear()} Northside Chickens</span>
            <a
              href="https://wa.me/27662385090"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 text-xs text-[#FAF6EE]/45 hover:text-[#D9B573]"
            >
              <span>Platform by</span>
              <span className="font-medium text-[#FAF6EE]/75 group-hover:text-[#D9B573]">AK Web Design</span>
              <span className="transition group-hover:translate-x-1">→</span>
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}