"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../lib/firebase";

/* =====================================================================
   Shared design tokens — see app/page.tsx and app/order/page.tsx
   ===================================================================== */
const FONT_DISPLAY = "font-['Fraunces',_serif]";
const FONT_MONO = "font-['IBM_Plex_Mono',_monospace]";

type ProductBreakdownItem = {
  id?: string;
  label: string;
  price?: number | null;
  quantity: number;
  subtotal?: number | null;
};

type Fulfilment = "collection" | "delivery";

type OrderData = {
  fullName?: string;
  phone?: string;
  email?: string;
  quantity?: number;
  productSummary?: string;
  productBreakdown?: ProductBreakdownItem[];
  notes?: string;
  fulfilment?: Fulfilment;
  delivery?: boolean;
  deliveryArea?: string;
  deliveryAddress?: string;
  basePriceTotal?: number;
  deliveryTotal?: number;
  totalPrice?: number;
  pricingVisible?: boolean;
  paymentStatus?: string;
  prepared?: boolean;
  packed?: boolean;
  delivered?: boolean;
  cancelled?: boolean;
  cancelReason?: string;
  queueNumber?: number | null;
};

type AppSettings = {
  accountName: string;
  bankName: string;
  accountNumber: string;
  accountType: string;
  branchCode: string;
  referenceHint: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  accountName: "Northside Chickens",
  bankName: "REPLACE WITH BANK NAME",
  accountNumber: "REPLACE WITH ACCOUNT NUMBER",
  accountType: "Business Cheque",
  branchCode: "REPLACE WITH BRANCH CODE",
  referenceHint:
    "Use your name and surname as the payment reference, then send your proof of payment to Northside Chickens on WhatsApp.",
};

function formatZAR(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function isPOAValue(value?: number | null) {
  return value === null || value === undefined || value <= 0;
}

function isPOARow(row: ProductBreakdownItem) {
  return isPOAValue(row.price);
}

function hasPOAPricing(order: OrderData | null) {
  if (!order) return false;
  return order.productBreakdown?.some(isPOARow) || false;
}

function knownExtrasTotal(order: OrderData | null) {
  if (!order) return 0;
  return order.deliveryTotal || 0;
}

function totalDueValue(order: OrderData | null) {
  if (!order) return "—";

  if (hasPOAPricing(order)) {
    const extras = knownExtrasTotal(order);
    if (extras > 0) {
      return `${formatZAR(extras)} + product price to be confirmed`;
    }
    return "Product price to be confirmed";
  }

  return formatZAR(order.totalPrice || 0);
}

/* ---------------- UI primitives (paper theme) ---------------- */
function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-b border-dashed border-[#E4D9C4] py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className={`text-sm ${strong ? "text-[#221E19]/80" : "text-[#221E19]/45"}`}>{label}</span>
      <span
        className={`${FONT_MONO} text-sm break-words sm:max-w-[60%] sm:text-right ${
          strong ? "font-bold text-[#1F4B4A]" : "font-medium text-[#221E19]"
        }`}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function StatusBadge({ label, variant }: { label: string; variant: "sage" | "gold" | "rust" | "ink" }) {
  const styles =
    variant === "sage"
      ? "border-[#221E19] bg-[#57624C] text-[#FAF6EE]"
      : variant === "gold"
      ? "border-[#221E19] bg-gradient-to-b from-[#C29A52] to-[#8F6023] text-[#221E19]"
      : variant === "rust"
      ? "border-[#221E19] bg-[#1F4B4A] text-[#FAF6EE]"
      : "border-[#221E19] bg-[#221E19] text-[#FAF6EE]";

  return (
    <div className={`${FONT_MONO} inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] shadow-[3px_3px_0_0_#221E19] ${styles}`}>
      {label}
    </div>
  );
}

function copyText(value: string) {
  if (!value) return false;

  const scrollY = window.scrollY;
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (error) {
    console.error("Copy failed:", error);
  }

  document.body.removeChild(textArea);
  window.scrollTo(0, scrollY);
  return copied;
}


 

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    copyText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${FONT_MONO} text-xs uppercase tracking-[0.16em] text-[#221E19]/45`}>{label}</p>
          <p className="mt-2 break-all text-sm font-medium text-[#221E19]">{value}</p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-[#221E19] bg-[#FFFDF8] px-4 py-2 text-xs font-medium text-[#221E19] transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function getWorkflowStatus(order: OrderData | null) {
  if (!order) return { label: "Unavailable", variant: "rust" as const };
  if (order.cancelled) return { label: "Order Cancelled", variant: "rust" as const };
  if (order.delivered) {
    return {
      label: order.fulfilment === "delivery" ? "Delivered" : "Collected",
      variant: "sage" as const,
    };
  }
  if (order.packed) return { label: "Packed & Ready", variant: "gold" as const };
  if (order.prepared) return { label: "Prepared", variant: "gold" as const };
  if ((order.queueNumber || 0) > 0) return { label: "In Queue", variant: "ink" as const };
  return { label: "Order Received", variant: "ink" as const };
}

function getPaymentStatus(order: OrderData | null) {
  const paid = (order?.paymentStatus || "pending").toLowerCase() === "paid";
  return paid ? { label: "Payment Received", variant: "sage" as const } : { label: "Payment Outstanding", variant: "gold" as const };
}

function totalItems(order: OrderData | null) {
  if (!order) return 0;
  if (order.productBreakdown?.length) {
    return order.productBreakdown.reduce((sum, row) => sum + (row.quantity || 0), 0);
  }
  return order.quantity || 0;
}

function productSummaryText(order: OrderData | null) {
  if (!order) return "—";
  if (order.productBreakdown?.length) {
    return order.productBreakdown.map((row) => `${row.quantity} × ${row.label}`).join(" • ");
  }
  return order.productSummary || "—";
}

function orderReferenceValue(id: string) {
  return `NP-${id.slice(0, 8).toUpperCase()}`;
}

export default function OrderSuccessPage() {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [orderId, setOrderId] = useState("");

  useEffect(() => {
    const pathParts = window.location.pathname.split("/");
    const id = pathParts[pathParts.length - 1] || "";
    setOrderId(id);

    if (!id) {
      setError("We could not find this order.");
      setLoading(false);
      return;
    }

    const unsubOrder = onSnapshot(
      doc(db, "orders", id),
      (orderSnap) => {
        if (!orderSnap.exists()) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("poultry_last_order_id");
            localStorage.removeItem("poultry_last_order_reference");
          }
          setError("We could not find this order.");
          setOrder(null);
          setLoading(false);
          return;
        }

        const orderData = orderSnap.data() as OrderData;

        if (orderData.cancelled) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("poultry_last_order_id");
            localStorage.removeItem("poultry_last_order_reference");
          }
          setError("We could not find this order.");
          setOrder(null);
          setLoading(false);
          return;
        }

        setOrder(orderData);
        setError("");
        setLoading(false);
      },
      (err) => {
        console.error("Error loading order:", err);
        setError("Something went wrong while loading the order.");
        setLoading(false);
      }
    );

    const unsubSettings = onSnapshot(
      doc(db, "settings", "poultry"),
      (settingsSnap) => {
        if (settingsSnap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...(settingsSnap.data() as Partial<AppSettings>) });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
      },
      (err) => {
        console.error("Error loading settings:", err);
        setSettings(DEFAULT_SETTINGS);
      }
    );

    return () => {
      unsubOrder();
      unsubSettings();
    };
  }, []);

  const orderReference = orderId ? orderReferenceValue(orderId) : "—";
  const workflowStatus = getWorkflowStatus(order);
  const paymentStatus = getPaymentStatus(order);
  const queueAssigned = (order?.queueNumber || 0) > 0;
  const hasPOA = hasPOAPricing(order);
  const isDelivery = order?.fulfilment === "delivery";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#FAF6EE] font-['Work_Sans',sans-serif] text-[#221E19]">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Work+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"
        rel="stylesheet"
      />

      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.035] bg-[radial-gradient(#221E19_1px,transparent_1px)] bg-[size:18px_18px]" />

      <header className="mx-auto flex max-w-7xl items-center justify-between border-b-2 border-[#221E19] px-6 py-3 sm:px-10 sm:py-4">
        <Link href="/" className="flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28">
            <Image src="/logo4.png" alt="Northside Chickens" fill sizes="140px" className="object-contain" priority />
          </div>
          <div className="hidden sm:block">
            <div className={`${FONT_DISPLAY} text-lg font-semibold leading-none`}>Northside Chickens</div>
            <div className={`${FONT_MONO} mt-1 text-[10px] uppercase tracking-[0.24em] text-[#221E19]/50`}>Fresh Chicken · Done Right </div>
          </div>
        </Link>

        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-[8px] border-2 border-[#1F4B4A] bg-transparent px-4 text-sm font-semibold text-[#1F4B4A] transition hover:bg-[#1F4B4A] hover:text-[#FAF6EE]"
        >
          Back Home
        </Link>
      </header>
      <div className="h-[3px] w-full bg-gradient-to-r from-[#A6752E] via-[#1F4B4A] to-[#57624C]" />

      <section className="mx-auto max-w-6xl overflow-x-hidden px-5 pb-16 pt-8 sm:px-8 lg:px-10 lg:pb-24">
        {loading ? (
          <div className="rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-8 text-center shadow-[6px_6px_0_0_#221E19]">
            <p className={`${FONT_MONO} text-sm uppercase tracking-[0.24em] text-[#1F4B4A]`}>Loading</p>
            <h1 className={`${FONT_DISPLAY} mt-4 text-[2rem] font-semibold sm:text-[2.4rem]`}>Loading your order</h1>
          </div>
        ) : error ? (
          <div className="rounded-[16px] border-2 border-[#1F4B4A] bg-[#1F4B4A]/10 p-8 text-center shadow-[6px_6px_0_0_#221E19]">
            <p className={`${FONT_MONO} text-sm uppercase tracking-[0.24em] text-[#1F4B4A]`}>Order unavailable</p>
            <h1 className={`${FONT_DISPLAY} mt-4 text-[2rem] font-semibold sm:text-[2.4rem]`}>We could not load this order</h1>
            <p className="mt-4 text-[#221E19]/70">{error}</p>

            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/order"
                className="inline-flex h-[44px] min-w-[190px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-gradient-to-b from-[#C29A52] to-[#8F6023] px-6 text-[14px] font-semibold text-[#221E19] shadow-[4px_4px_0_0_#221E19,0_14px_28px_-10px_rgba(166,117,46,0.6)]"
              >
                Place New Order
              </Link>
              <Link
                href="/"
                className="inline-flex h-[40px] min-w-[156px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-transparent px-5 text-[13px] font-semibold text-[#221E19]"
              >
                Back Home
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-12 xl:gap-8">
            <div className="xl:col-span-7">
              <div className="rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-6 shadow-[6px_6px_0_0_#221E19] sm:p-8">
                <div className="flex w-full justify-center lg:justify-start">
                  <StatusBadge label="Order Confirmed" variant="sage" />
                </div>

                <h1 className={`${FONT_DISPLAY} mt-5 text-center text-[2rem] font-semibold leading-[1.08] tracking-tight sm:text-[2.5rem] lg:text-left lg:text-[2.7rem]`}>
                  Your order
                  <span className="mt-1 block">was received successfully.</span>
                </h1>

                <div className="mt-6 space-y-4">
                  <div className="rounded-[10px] border-2 border-dashed border-[#A6752E] bg-[#A6752E]/10 p-5">
                    <p className={`${FONT_MONO} text-xs uppercase tracking-[0.2em] text-[#6B4A1E]`}>What happens next</p>

                    <div className="mt-4 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className={`${FONT_MONO} mt-1 h-6 w-6 flex-shrink-0 rounded-full border-2 border-[#221E19] bg-gradient-to-b from-[#C29A52] to-[#8F6023] text-[12px] font-bold text-[#221E19] flex items-center justify-center`}>
                          1
                        </div>
                        <p className="text-sm leading-6 text-[#221E19]/80">Make payment using the banking details below.</p>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className={`${FONT_MONO} mt-1 h-6 w-6 flex-shrink-0 rounded-full border-2 border-[#221E19] bg-gradient-to-b from-[#C29A52] to-[#8F6023] text-[12px] font-bold text-[#221E19] flex items-center justify-center`}>
                          2
                        </div>
                        <p className="text-sm leading-6 text-[#221E19]/80">
                          Use your <span className="font-semibold text-[#221E19]">name and surname</span> as the reference and
                          send your proof of payment to <span className="font-semibold text-[#221E19]">Northside Chickens</span> on WhatsApp.
                        </p>
                      </div>

                      <div className="flex items-start gap-3">
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                  <StatusBadge label={workflowStatus.label} variant={workflowStatus.variant} />
                  <StatusBadge label={paymentStatus.label} variant={paymentStatus.variant} />
                </div>

                {queueAssigned ? (
                  <div className="mt-6 rounded-[10px] border-2 border-dashed border-[#A6752E] bg-[#A6752E]/10 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className={`${FONT_DISPLAY} mt-2 text-[2rem] font-semibold leading-none sm:text-[2.4rem]`}>
                          {order?.queueNumber}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>                    
                  </div>
                )}


              </div>
            </div>

            <div className="xl:col-span-5">
              <div className="space-y-5 xl:sticky xl:top-6">
                <div className="rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-6 shadow-[6px_6px_0_0_#221E19]">
                  <p className={`${FONT_MONO} text-center text-[11px] uppercase tracking-[0.22em] text-[#1F4B4A] lg:text-left`}>
                    Banking details
                  </p>

                  <div className="mt-4 grid gap-3">
                    <CopyField label="Account name" value={settings.accountName} />
                    <CopyField label="Bank" value={settings.bankName} />
                    <CopyField label="Account number" value={settings.accountNumber} />
                    <CopyField label="Account type" value={settings.accountType} />
                    <CopyField label="Branch code" value={settings.branchCode} />

                    <div className="rounded-[10px] border-2 border-dashed border-[#A6752E] bg-[#A6752E]/10 p-4">
                      <p className={`${FONT_MONO} text-xs uppercase tracking-[0.16em] text-[#6B4A1E]`}>Payment instruction</p>
                      <p className="mt-2 text-sm font-medium leading-6 text-[#221E19]">{settings.referenceHint}</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] shadow-[6px_6px_0_0_#221E19]">
                  <div className="border-b-2 border-dashed border-[#E4D9C4] p-6">
                    <p className={`${FONT_MONO} text-center text-[11px] uppercase tracking-[0.22em] text-[#1F4B4A] lg:text-left`}>
                      Order ticket
                    </p>
                    <h2 className={`${FONT_DISPLAY} mt-2 text-center text-[1.6rem] font-semibold lg:text-left`}>
                      Review your details
                    </h2>
                  </div>

                  <div className="px-6 py-2">
                    <SummaryRow label="Full name" value={order?.fullName || "—"} />
                    <SummaryRow label="Phone" value={order?.phone || "—"} />
                    <SummaryRow label="Email" value={order?.email || "—"} />
                    <SummaryRow label="Total items" value={String(totalItems(order))} />
                    <SummaryRow label="Products" value={productSummaryText(order)} />
                    <SummaryRow label="Fulfilment" value={isDelivery ? "Delivery" : "Collection"} />
                    <SummaryRow label="Delivery area" value={isDelivery ? order?.deliveryArea || "—" : "Collection"} />
                    <SummaryRow label="Delivery address" value={isDelivery ? order?.deliveryAddress || "—" : "Collection"} />
                    <SummaryRow
                      label="Payment status"
                      value={(order?.paymentStatus || "pending").toLowerCase() === "paid" ? "Paid" : "Unpaid"}
                    />
                    <SummaryRow label="Workflow status" value={workflowStatus.label} />
                  </div>

                  <div className="m-6 mt-2 rounded-[10px] border-2 border-dashed border-[#221E19]/25 p-5">
                    <SummaryRow
                      label="Products total"
                      value={order?.basePriceTotal ? formatZAR(order.basePriceTotal) : hasPOA ? "POA" : "—"}
                    />
                    <SummaryRow label="Delivery total" value={order?.deliveryTotal ? formatZAR(order.deliveryTotal) : "—"} />
                    <SummaryRow label={hasPOA ? "Known charges" : "Total due"} value={totalDueValue(order)} strong />
                  </div>
                </div>

                {order?.productBreakdown?.length ? (
                  <div className="rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-6 shadow-[6px_6px_0_0_#221E19]">
                    <p className={`${FONT_MONO} text-center text-[11px] uppercase tracking-[0.22em] text-[#1F4B4A] lg:text-left`}>
                      Product breakdown
                    </p>

                    <div className="mt-4 space-y-3">
                      {order.productBreakdown.map((row, index) => (
                        <div key={row.id || `${row.label}-${index}`} className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className={`${FONT_DISPLAY} text-sm font-semibold`}>{row.label}</p>
                              <p className="mt-1 text-sm text-[#221E19]/55">{row.quantity} units</p>
                            </div>
                            <div className="text-right">
                              <p className={`${FONT_MONO} text-sm text-[#221E19]/55`}>
                                {isPOARow(row) ? "POA" : `${formatZAR(row.price || 0)} each`}
                              </p>
                              <p className={`${FONT_MONO} mt-1 text-sm font-semibold text-[#221E19]`}>
                                {isPOARow(row) ? "Price to be confirmed" : formatZAR(row.subtotal || 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {order?.notes?.trim() ? (
                  <div className="rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-6 shadow-[6px_6px_0_0_#221E19]">
                    <p className={`${FONT_MONO} text-center text-[11px] uppercase tracking-[0.22em] text-[#1F4B4A] lg:text-left`}>
                      Additional notes
                    </p>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#221E19]/75">{order.notes}</p>
                  </div>
                ) : null}

                {order?.cancelled && order?.cancelReason?.trim() ? (
                  <div className="rounded-[16px] border-2 border-[#1F4B4A] bg-[#1F4B4A]/10 p-6 shadow-[6px_6px_0_0_#221E19]">
                    <p className={`${FONT_MONO} text-center text-[11px] uppercase tracking-[0.22em] text-[#1F4B4A] lg:text-left`}>
                      Cancellation notes
                    </p>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#221E19]/85">{order.cancelReason}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}