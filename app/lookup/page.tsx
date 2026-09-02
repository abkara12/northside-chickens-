// app/lookup/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "../lib/firebase";

type WeightBreakdownItem = {
  id?: string;
  label: string;
  price?: number;
  quantity: number;
  subtotal?: number;
};

type OrderItem = {
  id: string;
  fullName?: string;
  phone?: string;
  email?: string;
  quantity?: number;
  preferredWeight?: string;
  weightBreakdown?: WeightBreakdownItem[];
  cutPreferences?: string[];
  notes?: string;
  addServices?: boolean;
  delivery?: boolean;
  totalPrice?: number;
  paymentStatus?: string;
  slaughtered?: boolean;
  delivered?: boolean;
  cancelled?: boolean;
  cancelReason?: string;
  queueNumber?: number | null;
  createdAt?: any;
};

function formatZAR(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value: any) {
  try {
    if (!value) return "—";
    if (value?.toDate) {
      return value.toDate().toLocaleString("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    }
    return "—";
  } catch {
    return "—";
  }
}

function orderReference(id: string) {
  return `NQ-${id.slice(0, 8).toUpperCase()}`;
}

function normalizeReference(reference: string) {
  return reference.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("27")) return digits;
  if (digits.startsWith("0")) return `27${digits.slice(1)}`;
  return digits;
}

function phoneMatches(orderPhone?: string, searchPhone?: string) {
  const orderNormalized = normalizePhone(orderPhone || "");
  const searchNormalized = normalizePhone(searchPhone || "");

  if (!orderNormalized || !searchNormalized) return false;

  return (
    orderNormalized === searchNormalized ||
    orderNormalized.endsWith(searchNormalized) ||
    searchNormalized.endsWith(orderNormalized)
  );
}

function sheepSummary(order: OrderItem) {
  if (order.weightBreakdown?.length) {
    return order.weightBreakdown
      .map((row) => `${row.quantity} × ${row.label}`)
      .join(" • ");
  }

  const qty = order.quantity || 0;
  const weight = order.preferredWeight?.trim();

  if (qty && weight) return `${qty} sheep • ${weight}`;
  if (qty) return `${qty} sheep`;
  if (weight) return weight;
  return "—";
}

function workflowStatus(order: OrderItem) {
  if (order.cancelled) {
    return {
      label: "Cancelled",
      className: "border-rose-400/20 bg-rose-400/10 text-rose-200",
    };
  }

  if (order.delivered) {
    return {
      label: "Delivered",
      className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    };
  }

  if (order.slaughtered) {
    return {
      label: "Slaughtered",
      className: "border-sky-400/20 bg-sky-400/10 text-sky-200",
    };
  }

  return {
    label: "Pending",
    className: "border-violet-400/20 bg-violet-400/10 text-violet-200",
  };
}

function paymentStatus(order: OrderItem) {
  const paid = (order.paymentStatus || "pending").toLowerCase() === "paid";

  return {
    label: paid ? "Paid" : "Unpaid",
    className: paid
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : "border-amber-400/20 bg-amber-400/10 text-amber-200",
  };
}

function StatusBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {label}
    </span>
  );
}

function DetailRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/10 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
      <span className="text-sm text-white/45">{label}</span>
      <span
        className={`text-sm break-words sm:max-w-[62%] sm:text-right ${
          strong ? "font-semibold text-white" : "font-medium text-white"
        }`}
      >
        {value || "—"}
      </span>
    </div>
  );
}

export default function LookupPage() {
  const [searchType, setSearchType] = useState<"reference" | "phone">("reference");
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [results, setResults] = useState<OrderItem[]>([]);
  const [searched, setSearched] = useState(false);

  const searchLabel = useMemo(() => {
    return searchType === "reference" ? "Booking reference" : "Phone number";
  }, [searchType]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSearchError("");
    setSubmitting(true);
    setSearched(false);
    setResults([]);

    try {
      if (searchType === "reference" && !reference.trim()) {
        setSearchError("Please enter your booking reference.");
        setSubmitting(false);
        return;
      }

      if (searchType === "phone" && !phone.trim()) {
        setSearchError("Please enter your phone number.");
        setSubmitting(false);
        return;
      }

      const snap = await getDocs(query(collection(db, "orders")));
      const orders: OrderItem[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<OrderItem, "id">),
      }));

      let matches: OrderItem[] = [];

      if (searchType === "reference") {
        const searchValue = normalizeReference(reference);
        matches = orders.filter((order) => normalizeReference(orderReference(order.id)) === searchValue);
      } else {
        matches = orders.filter((order) => phoneMatches(order.phone, phone));
      }

      matches.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.()?.getTime?.() || 0;
        const bTime = b.createdAt?.toDate?.()?.getTime?.() || 0;
        return bTime - aTime;
      });

      setResults(matches);
      setSearched(true);
    } catch (error) {
      console.error("Lookup failed:", error);
      setSearchError("Something went wrong while searching. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#09070b] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#09070b]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#120c12_0%,#0c090d_38%,#070509_100%)]" />
        <div className="absolute right-[-12rem] top-[-12rem] h-[36rem] w-[36rem] rounded-full bg-[#c6a268]/[0.10] blur-3xl" />
        <div className="absolute left-[-10rem] top-[10rem] h-[30rem] w-[30rem] rounded-full bg-[#141016]/[0.26] blur-3xl" />
        <div className="absolute bottom-[-18rem] left-[-12rem] h-[40rem] w-[40rem] rounded-full bg-[#7a5a45]/[0.06] blur-3xl" />
      </div>

      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7 sm:px-10">
        <Link href="/" className="flex items-center gap-4">
          <div className="grid h-[78px] w-[78px] place-items-center rounded-[22px] border border-white/10 bg-white/5 shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <Image
              src="/logo4.png"
              alt="Northside Chickens"
              width={65}
              height={65}
              className="object-contain"
              priority
            />
          </div>
          <div className="hidden sm:block">
            <div className="text-[1.05rem] font-semibold tracking-[-0.02em] text-white">
              Northside Chickens
            </div>
            <div className="mt-1 text-sm text-white/55">Booking lookup</div>
          </div>
        </Link>

        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Back Home
        </Link>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-16 pt-2 sm:px-10 lg:pb-24 lg:pt-4">
        <div className="grid gap-8 xl:grid-cols-12 xl:gap-10">
          <div className="xl:col-span-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[#d8b67e] backdrop-blur-xl">
              Booking Lookup
            </div>

            <h1 className="mt-5 bg-[linear-gradient(135deg,#fbf4e8_0%,#d8b67e_44%,#ffffff_100%)] bg-clip-text text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.05em] text-transparent sm:text-[3rem] lg:text-[3.8rem]">
              Find your booking
              <span className="mt-1 block">in seconds.</span>
            </h1>

            <p className="mt-5 max-w-2xl text-[0.98rem] leading-7 text-white/68 sm:text-[1.03rem] sm:leading-8">
              Search using your booking reference number or your phone number to
              view your qurbani booking and live status.
            </p>

            <div className="mt-8 grid gap-3">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.045] px-5 py-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                <div className="text-sm text-white/42">Search by</div>
                <div className="mt-1 text-sm font-semibold leading-snug text-white">
                  Reference number or phone number
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-white/[0.045] px-5 py-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                <div className="text-sm text-white/42">See live status</div>
                <div className="mt-1 text-sm font-semibold leading-snug text-white">
                  Pending, slaughtered, delivered, cancelled, and payment status
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-white/[0.045] px-5 py-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                <div className="text-sm text-white/42">Review booking</div>
                <div className="mt-1 text-sm font-semibold leading-snug text-white">
                  Sheep sizes, totals, notes, and full reference details
                </div>
              </div>
            </div>
          </div>

          <div className="xl:col-span-7">
            <div className="rounded-[34px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:p-8">
              <div className="text-center xl:text-left">
                <p className="text-[11px] uppercase tracking-[0.26em] text-[#d8b67e]">
                  Search for booking
                </p>
                <h2 className="mt-3 text-[1.9rem] font-semibold tracking-[-0.03em] text-white sm:text-[2.2rem]">
                  Enter your details
                </h2>
                <p className="mt-3 text-[0.98rem] leading-7 text-white/65">
                  Use the same phone number you booked with, or enter your booking reference.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setSearchType("reference")}
                  className={`inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition ${
                    searchType === "reference"
                      ? "bg-[#c6a268] text-[#161015]"
                      : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  Search by reference
                </button>

                <button
                  type="button"
                  onClick={() => setSearchType("phone")}
                  className={`inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition ${
                    searchType === "phone"
                      ? "bg-[#c6a268] text-[#161015]"
                      : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  Search by phone
                </button>
              </div>

              <form onSubmit={handleSearch} noValidate className="mt-8 grid gap-6">
                {searchType === "reference" ? (
                  <div>
                    <label
                      htmlFor="reference"
                      className="mb-2 block text-sm font-medium text-white/82"
                    >
                      {searchLabel}
                    </label>
                    <input
                      id="reference"
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Enter your booking reference e.g. NQ-ABC12345"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none backdrop-blur-xl transition placeholder:text-white/30 focus:border-[#c6a268]/60 focus:bg-white/[0.07]"
                    />
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-2 block text-sm font-medium text-white/82"
                    >
                      {searchLabel}
                    </label>
                    <input
                      id="phone"
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Enter your phone number"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none backdrop-blur-xl transition placeholder:text-white/30 focus:border-[#c6a268]/60 focus:bg-white/[0.07]"
                    />
                  </div>
                )}

                {searchError ? (
                  <div className="rounded-[24px] border border-red-400/20 bg-red-400/10 p-4">
                    <p className="text-sm font-semibold text-red-200">
                      Search could not be completed
                    </p>
                    <p className="mt-1 text-sm leading-6 text-red-100/80">
                      {searchError}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-col items-center gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-[44px] min-w-[190px] items-center justify-center rounded-full bg-[#c6a268] px-6 text-[14px] font-semibold text-[#161015] shadow-[0_16px_30px_rgba(0,0,0,0.25)] transition-all duration-300 hover:brightness-105 hover:shadow-[0_20px_38px_rgba(0,0,0,0.3)] disabled:cursor-not-allowed disabled:opacity-70 sm:text-[15px]"
                  >
                    {submitting ? "Searching..." : "Find Booking"}
                  </button>

                  <Link
                    href="/order"
                    className="inline-flex h-[40px] min-w-[156px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-[13px] font-medium text-white transition hover:bg-white/10"
                  >
                    Place New Order
                  </Link>
                </div>
              </form>

              {searched ? (
                <div className="mt-8">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold text-white">
                      {results.length === 1
                        ? "1 booking found"
                        : `${results.length} bookings found`}
                    </h3>
                  </div>

                  {results.length === 0 ? (
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                      <p className="text-sm font-medium text-white">No booking found</p>
                      <p className="mt-1 text-sm leading-6 text-white/60">
                        Please check that your reference number or phone number is correct.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {results.map((order) => {
                        const workflow = workflowStatus(order);
                        const payment = paymentStatus(order);

                        return (
                          <div
                            key={order.id}
                            className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5"
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-lg font-semibold text-white">
                                    {order.fullName || "Unnamed booking"}
                                  </h4>
                                  <StatusBadge label={workflow.label} className={workflow.className} />
                                  <StatusBadge label={payment.label} className={payment.className} />
                                </div>

                                <p className="mt-2 text-sm text-white/55">
                                  {orderReference(order.id)}
                                </p>
                              </div>

                              <Link
                                href={`/order/success/${order.id}`}
                                className="inline-flex h-[40px] min-w-[156px] items-center justify-center rounded-full bg-[#c6a268] px-5 text-[13px] font-semibold text-[#161015] transition hover:brightness-105"
                              >
                                Open Booking
                              </Link>
                            </div>

                            <div className="mt-5 rounded-[22px] border border-white/10 bg-white/5 p-4">
                              <DetailRow label="Phone" value={order.phone || "—"} />
                              <DetailRow label="Booked" value={formatDate(order.createdAt)} />
                              <DetailRow label="Sheep selected" value={sheepSummary(order)} />
                              <DetailRow
                                label="Total sheep"
                                value={String(
                                  order.weightBreakdown?.length
                                    ? order.weightBreakdown.reduce(
                                        (sum, row) => sum + (row.quantity || 0),
                                        0
                                      )
                                    : order.quantity || 0
                                )}
                              />
                              <DetailRow
                                label="Total due"
                                value={formatZAR(order.totalPrice || 0)}
                                strong
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}