"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth, db } from "../lib/firebase";

/* =====================================================================
   Shared design tokens — see app/page.tsx, app/order/page.tsx,
   app/order/success/[id]/page.tsx, app/login + app/staff-register
   ===================================================================== */
const FONT_DISPLAY = "font-['Fraunces',_serif]";
const FONT_MONO = "font-['IBM_Plex_Mono',_monospace]";

const DELIVERY_FEE = 60;

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

/* ---------------- Types ---------------- */
type Fulfilment = "collection" | "delivery";

type ProductBreakdownItem = {
  id: string;
  label: string;
  price: number | null;
  quantity: number;
  subtotal: number | null;
};

type OrderItem = {
  id: string;
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
  pricingFinalized?: boolean;
  paymentStatus?: "pending" | "paid";
  prepared?: boolean;
  packed?: boolean;
  delivered?: boolean;
  cancelled?: boolean;
  cancelReason?: string;
  queueNumber?: number | null;
  queueCheckedInAt?: any;
  manualEntry?: boolean;
  orderYear?: number;
  createdAt?: any;
  updatedAt?: any;
};

type SettingsProductOption = {
  label: string;
  price: number | null;
  stock?: number | null;
  isPOA?: boolean;
  unit?: string;
};

type AppSettings = {
  ordersOpen: boolean;
  orderCutoffDate: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  accountType: string;
  branchCode: string;
  referenceHint: string;
  reminderMessageIntro: string;
  productOptions: SettingsProductOption[];
};

type ProductRow = { id: string; label: string; quantity: string; price: string };

type EditFormState = {
  fullName: string;
  phone: string;
  email: string;
  notes: string;
  fulfilment: Fulfilment;
  deliveryArea: string;
  deliveryAddress: string;
  paymentStatus: "pending" | "paid";
  prepared: boolean;
  packed: boolean;
  delivered: boolean;
  cancelled: boolean;
  cancelReason: string;
  productRows: ProductRow[];
};

type ManualFormState = {
  fullName: string;
  phone: string;
  email: string;
  notes: string;
  fulfilment: Fulfilment;
  deliveryArea: string;
  deliveryAddress: string;
  paymentStatus: "pending" | "paid";
  productRows: ProductRow[];
};

type ExpenseItem = {
  id: string;
  title?: string;
  amount?: number;
  category?: "staff" | "packaging" | "transport" | "other";
  notes?: string;
  createdAt?: any;
  createdByRole?: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  ordersOpen: true,
  orderCutoffDate: "",
  accountName: "Northside Chickens",
  bankName: "REPLACE WITH BANK NAME",
  accountNumber: "REPLACE WITH ACCOUNT NUMBER",
  accountType: "Business Cheque",
  branchCode: "REPLACE WITH BRANCH CODE",
  referenceHint: "Please send your proof of payment / reference to Northside Chickens on WhatsApp.",
  reminderMessageIntro: "Hi, this is a kind reminder regarding your Northside Chickens order.",
  productOptions: [
    { label: "Whole Chicken (~1.6kg)", price: 120, stock: 40, unit: "bird" },
    { label: "Chicken Breasts (1kg)", price: 95, stock: 60, unit: "pack" },
    { label: "Chicken Thighs (1kg)", price: 85, stock: 60, unit: "pack" },
    { label: "Drumsticks & Wings (1kg)", price: 70, stock: 60, unit: "pack" },
    { label: "Mixed Portions Pack (1kg)", price: 80, stock: 60, unit: "pack" },
    { label: "Mixed Portions Pack (1kg)", price: 80, stock: 60, unit: "pack" },
    { label: "Mixed Portions Pack (1kg)", price: 80, stock: 60, unit: "pack" },
    { label: "Mixed Portions Pack (1kg)", price: 80, stock: 60, unit: "pack" },
    { label: "Mixed Portions Pack (1kg)", price: 80, stock: 60, unit: "pack" },
    { label: "Mixed Portions Pack (1kg)", price: 80, stock: 60, unit: "pack" },
    { label: "Mixed Portions Pack (1kg)", price: 80, stock: 60, unit: "pack" },

  ],
};

/* ---------------- Helpers ---------------- */
function formatZAR(value?: number) {
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
      return value.toDate().toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
    }
    return "—";
  } catch {
    return "—";
  }
}

function orderReference(id: string) {
  return `NP-${id.slice(0, 8).toUpperCase()}`;
}

function slugId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanPhoneForWhatsApp(phone?: string) {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("27")) return digits;
  if (digits.startsWith("0")) return `27${digits.slice(1)}`;
  return digits;
}

function productSummary(order: OrderItem) {
  if (order.productBreakdown?.length) {
    return order.productBreakdown.map((row) => `${row.quantity} × ${row.label}`).join(" • ");
  }
  const qty = order.quantity || 0;
  return qty ? `${qty} items` : order.productSummary || "—";
}

function statusLabel(order: OrderItem) {
  if (order.cancelled) return "Cancelled";
  if (order.delivered) return order.fulfilment === "delivery" ? "Delivered" : "Collected";
  if (order.packed) return "Packed & Ready";
  if (order.prepared) return "Prepared";
  if ((order.queueNumber || 0) > 0) return "In Queue";
  return "Order Received";
}

function rowsFromOrder(order: OrderItem): ProductRow[] {
  if (order.productBreakdown?.length) {
    return order.productBreakdown.map((row) => ({
      id: row.id || slugId(),
      label: row.label,
      quantity: String(row.quantity || 1),
      price: row.price && row.price > 0 ? String(row.price) : "",
    }));
  }
  return [{ id: slugId(), label: "", quantity: "1", price: "" }];
}

function buildLegacyProductSummary(breakdown: ProductBreakdownItem[]) {
  return breakdown.map((row) => `${row.label} x${row.quantity}`).join(", ");
}

function getPriceForLabel(label: string, settings: AppSettings) {
  const match = settings.productOptions.find((item) => item.label === label.trim());
  return match?.price ?? null;
}

function isPOABreakdownRow(row: ProductBreakdownItem) {
  return row.price === null || row.price === undefined || row.price <= 0;
}

function hasPOAPricing(order: OrderItem) {
  return order.productBreakdown?.some(isPOABreakdownRow) || false;
}

function isPricingFinalized(order: OrderItem) {
  return !hasPOAPricing(order);
}

function knownExtrasTotal(order: OrderItem) {
  return order.deliveryTotal || 0;
}

function orderAmountLabel(order: OrderItem) {
  if (hasPOAPricing(order)) {
    const extras = knownExtrasTotal(order);
    return extras > 0 ? `${formatZAR(extras)} + product price to be confirmed` : "Product price to be confirmed";
  }
  return formatZAR(order.totalPrice || 0);
}

function computeBreakdownFromRows(rows: ProductRow[], settings: AppSettings): ProductBreakdownItem[] {
  const validRows = rows
    .map((row) => {
      const quantity = Number(row.quantity || 0);
      const typedPrice = Number(row.price || 0);
      const settingsPrice = getPriceForLabel(row.label, settings);
      const price = Number.isFinite(typedPrice) && typedPrice > 0 ? typedPrice : settingsPrice;
      const subtotal = price && price > 0 ? quantity * price : null;
      return { id: row.id, label: row.label.trim(), quantity, price, subtotal };
    })
    .filter((row) => row.label && Number.isInteger(row.quantity) && row.quantity > 0);

  return validRows as ProductBreakdownItem[];
}

function normaliseStock(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

function mergeProductQuantities(rows: ProductBreakdownItem[]) {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.label, (map.get(row.label) || 0) + row.quantity);
  return map;
}

async function applyProductStockTransaction({
  existingOrder,
  nextProductBreakdown,
  buildOrderPayload,
}: {
  existingOrder?: OrderItem | null;
  nextProductBreakdown: ProductBreakdownItem[];
  buildOrderPayload: () => Record<string, any>;
}) {
  const settingsRef = doc(db, "settings", "poultry");
  const targetOrderRef = existingOrder ? doc(db, "orders", existingOrder.id) : doc(collection(db, "orders"));

  await runTransaction(db, async (transaction) => {
    const settingsSnap = await transaction.get(settingsRef);
    const liveSettings = settingsSnap.exists()
      ? ({ ...DEFAULT_SETTINGS, ...(settingsSnap.data() as Partial<AppSettings>) } as AppSettings)
      : DEFAULT_SETTINGS;

    const previousMap = mergeProductQuantities(existingOrder?.productBreakdown || []);
    const nextMap = mergeProductQuantities(nextProductBreakdown);

    const updatedProductOptions = liveSettings.productOptions.map((option) => {
      const currentStock = normaliseStock(option.stock);
      const previousQty = previousMap.get(option.label) || 0;
      const nextQty = nextMap.get(option.label) || 0;
      const delta = nextQty - previousQty;

      if (delta === 0) return option;
      if (currentStock === null) return option;

      if (delta < 0) return { ...option, stock: currentStock + Math.abs(delta) };
      if (delta > currentStock) throw new Error(`${option.label} only has ${currentStock} left.`);
      return { ...option, stock: currentStock - delta };
    });

    transaction.update(settingsRef, { productOptions: updatedProductOptions, updatedAt: serverTimestamp() });

    if (existingOrder) {
      transaction.update(targetOrderRef, { ...buildOrderPayload(), updatedAt: serverTimestamp() });
    } else {
      transaction.set(targetOrderRef, {
        ...buildOrderPayload(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

function buildPaymentReminderMessage(order: OrderItem, settings: AppSettings) {
  const ref = orderReference(order.id);
  const summary = productSummary(order);
  const amountLine = `Amount Due: ${orderAmountLabel(order)}`;

  return `${settings.reminderMessageIntro}

Order Ref: ${ref}
Order: ${summary}
${amountLine}

Bank: ${settings.bankName}
Account Name: ${settings.accountName}
Account Number: ${settings.accountNumber}
Account Type: ${settings.accountType}
Branch Code: ${settings.branchCode}

${settings.referenceHint}`;
}

function buildCancellationMessage(order: OrderItem, reason: string) {
  const ref = orderReference(order.id);
  return `Hi, your Northside Chickens order (${ref}) has been cancelled.

Reason: ${reason || "No reason provided"}

If this was done in error, please contact the team directly.`;
}

function buildQueueAssignedMessage(order: OrderItem, assignedQueueNumber: number) {
  const ref = orderReference(order.id);
  return `Hi, your Northside Chickens order has now been added to the queue.

Order Ref: ${ref}
Queue Number: ${assignedQueueNumber}
Order: ${productSummary(order)}

Please keep your queue number ready and show it when called.`;
}

/* ---------------- UI atoms ---------------- */
function PaymentBadge({ value }: { value?: string }) {
  const paid = (value || "pending").toLowerCase() === "paid";
  return (
    <span
      className={`${FONT_MONO} inline-flex items-center justify-center rounded-full border-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
        paid ? "border-[#6E7A55] bg-[#6E7A55]/10 text-[#6E7A55]" : "border-[#C4872C] bg-[#C4872C]/15 text-[#8a5f1c]"
      }`}
    >
      {paid ? "Paid" : "Unpaid"}
    </span>
  );
}

function WorkflowBadge({ order }: { order: OrderItem }) {
  const label = statusLabel(order);
  const className =
    label === "Delivered" || label === "Collected"
      ? "border-[#6E7A55] bg-[#6E7A55]/10 text-[#6E7A55]"
      : label === "Packed & Ready" || label === "Prepared"
      ? "border-[#C4872C] bg-[#C4872C]/15 text-[#8a5f1c]"
      : label === "In Queue"
      ? "border-[#221E19] bg-[#221E19]/5 text-[#221E19]"
      : label === "Cancelled"
      ? "border-[#A93E2E] bg-[#A93E2E]/10 text-[#A93E2E]"
      : "border-[#221E19]/25 bg-transparent text-[#221E19]/60";

  return (
    <span className={`${FONT_MONO} inline-flex items-center justify-center rounded-full border-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${className}`}>
      {label}
    </span>
  );
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center rounded-full border-2 border-[#221E19] px-4 text-sm font-medium transition ${
        active ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] text-[#221E19] hover:bg-[#221E19]/[0.04]"
      }`}
    >
      {label}
    </button>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-[10px] border-2 border-[#221E19] bg-[#FFFDF8] p-5 shadow-[3px_3px_0_0_#221E19]">
      <div className={`${FONT_MONO} text-[10px] uppercase tracking-[0.16em] text-[#221E19]/45`}>{label}</div>
      <div className={`${FONT_DISPLAY} mt-2 text-[1.35rem] font-semibold`}>{value}</div>
      {helper ? <div className="mt-1 text-xs text-[#221E19]/45">{helper}</div> : null}
    </div>
  );
}

function DetailRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-b border-dashed border-[#E4D9C4] py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
      <span className="text-sm text-[#221E19]/45">{label}</span>
      <span className={`${FONT_MONO} text-sm break-words sm:max-w-[62%] sm:text-right ${strong ? "font-bold text-[#A93E2E]" : "font-medium text-[#221E19]"}`}>
        {value || "—"}
      </span>
    </div>
  );
}

function SectionCard({
  title,
  sub,
  children,
  highlight = false,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-[16px] border-2 border-[#221E19] p-5 shadow-[6px_6px_0_0_#221E19] sm:p-6 ${highlight ? "bg-[#C4872C]/10" : "bg-[#FFFDF8]"}`}>
      <div className="mb-5">
        <h3 className={`${FONT_DISPLAY} text-lg font-semibold`}>{title}</h3>
        {sub ? <p className="mt-1 text-sm text-[#221E19]/55">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

function ProductCountSummary({ settings, activeOrders }: { settings: AppSettings; activeOrders: OrderItem[] }) {
  const countMap = useMemo(() => {
    const map = new Map<string, { display: string; count: number }>();
    function normalise(label: string) {
      return label.toLowerCase().trim().replace(/\s+/g, " ");
    }
    activeOrders.forEach((order) => {
      (order.productBreakdown || []).forEach((row) => {
        if (row.label && row.quantity > 0) {
          const key = normalise(row.label);
          const existing = map.get(key);
          if (existing) existing.count += row.quantity;
          else map.set(key, { display: row.label.trim(), count: row.quantity });
        }
      });
    });
    return map;
  }, [activeOrders]);

  function normalise(label: string) {
    return label.toLowerCase().trim().replace(/\s+/g, " ");
  }

  const totalOrdered = Array.from(countMap.values()).reduce((a, b) => a + b.count, 0);
  const maxCount = Math.max(...Array.from(countMap.values()).map((v) => v.count), 1);

  const knownRows = settings.productOptions.map((opt) => {
    const found = countMap.get(normalise(opt.label));
    return { label: opt.label, price: opt.price, ordered: found?.count || 0, stock: opt.stock };
  });

  const knownKeys = new Set(settings.productOptions.map((o) => normalise(o.label)));
  const legacyRows = Array.from(countMap.entries())
    .filter(([key]) => !knownKeys.has(key))
    .map(([, { display, count }]) => ({ label: display, price: null, ordered: count, stock: null }));

  const allRows = [...knownRows, ...legacyRows];

  return (
    <div className="rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-5 shadow-[6px_6px_0_0_#221E19] sm:p-6">
      <h3 className={`${FONT_DISPLAY} mb-1 text-lg font-semibold`}>Product Count Summary</h3>
      <p className="mb-5 text-sm text-[#221E19]/55">Ordered quantity per product, and remaining stock.</p>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] p-4">
          <div className={`${FONT_MONO} text-xs text-[#221E19]/45`}>Total items ordered</div>
          <div className={`${FONT_DISPLAY} text-2xl font-semibold`}>{totalOrdered}</div>
        </div>
        <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] p-4">
          <div className={`${FONT_MONO} text-xs text-[#221E19]/45`}>Product lines</div>
          <div className={`${FONT_DISPLAY} text-2xl font-semibold`}>{allRows.length}</div>
        </div>
      </div>

      <div className="mt-2 space-y-2">
        {allRows.map((row) => {
          const barPct = Math.round((row.ordered / maxCount) * 100);
          return (
            <div key={row.label} className="grid grid-cols-[1fr_64px] items-center gap-2 rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-3 py-3">
              <div>
                <div className="text-sm font-semibold">{row.label}</div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#221E19]/10">
                  <div className="h-1.5 rounded-full bg-[#C4872C]" style={{ width: `${barPct}%` }} />
                </div>
                <div className={`${FONT_MONO} mt-1 text-xs text-[#221E19]/45`}>
                  {row.price ? formatZAR(row.price) : "POA"}
                  {typeof row.stock === "number" ? ` • ${row.stock} in stock` : ""}
                </div>
              </div>
              <div className={`${FONT_DISPLAY} text-xl font-semibold text-[#A93E2E]`}>{row.ordered}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==================================================================== */

export default function AdminPage() {
  const [authReady, setAuthReady] = useState(false);
  const [authorised, setAuthorised] = useState(false);
  const [userRole, setUserRole] = useState<"admin" | "staff" | "">("");

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [deliveryAreaFilter, setDeliveryAreaFilter] = useState("all");

  const [mode, setMode] = useState<"simple" | "management">("simple");

  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [simpleSearch, setSimpleSearch] = useState("");

  const [updatingField, setUpdatingField] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOutstandingPanel, setShowOutstandingPanel] = useState(false);
  const [showExpensesPanel, setShowExpensesPanel] = useState(false);

  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ title: "", amount: "", category: "other" as ExpenseItem["category"], notes: "" });

  const isOwner = userRole === "admin";

  const [manualForm, setManualForm] = useState<ManualFormState>({
    fullName: "",
    phone: "",
    email: "",
    notes: "",
    fulfilment: "collection",
    deliveryArea: "",
    deliveryAddress: "",
    paymentStatus: "pending",
    productRows: [{ id: slugId(), label: "", quantity: "1", price: "" }],
  });
  const [manualSaving, setManualSaving] = useState(false);

  const [bulkReminderActive, setBulkReminderActive] = useState(false);
  const [bulkReminderIndex, setBulkReminderIndex] = useState(0);
  const [bulkReminderTargets, setBulkReminderTargets] = useState<OrderItem[]>([]);

  const selectedBookingRef = useRef<HTMLDivElement | null>(null);
  const manualBookingRef = useRef<HTMLDivElement | null>(null);
  const outstandingPanelRef = useRef<HTMLDivElement | null>(null);
  const expensesPanelRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);

  async function initialiseQueueCounter() {
    try {
      const ordersSnap = await getDocs(collection(db, "orders"));
      let maxQueueNumber = 0;
      ordersSnap.forEach((docSnap) => {
        const data = docSnap.data() as Omit<OrderItem, "id">;
        if (!data.cancelled && (data.queueNumber || 0) > maxQueueNumber) {
          maxQueueNumber = data.queueNumber || 0;
        }
      });
      await setDoc(
        doc(db, "queueMeta", "poultry"),
        { nextQueueNumber: maxQueueNumber + 1, updatedAt: serverTimestamp(), initialisedAt: serverTimestamp() },
        { merge: true }
      );
      alert(`Queue counter initialised. Next queue number is #${maxQueueNumber + 1}`);
    } catch (error) {
      console.error("Queue counter init failed:", error);
      alert("Could not initialise the queue counter.");
    }
  }

  /* ---- auth ---- */
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      if (!firebaseUser) {
        setAuthorised(false);
        setUserRole("");
        setAuthReady(true);
        window.location.assign("/login");
        return;
      }

      const userRef = doc(db, "users", firebaseUser.uid);
      unsubUserDoc = onSnapshot(
        userRef,
        (snap) => {
          const role = snap.exists() ? (snap.data() as any).role : null;
          const ok = role === "admin" || role === "staff";
          setAuthorised(ok);
          setUserRole(ok ? role : "");
          setAuthReady(true);
          if (!ok) window.location.assign("/login");
        },
        (error) => {
          console.error("User role snapshot error:", error);
          setAuthReady(true);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  useEffect(() => {
    if (!authorised) return;
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const nextOrders: OrderItem[] = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderItem, "id">) }));
        setOrders(nextOrders);
        setLoadingOrders(false);
        setSelectedOrder((prev) => (prev ? nextOrders.find((o) => o.id === prev.id) || null : prev));
      },
      (error) => {
        console.error("Orders snapshot error:", error);
        setLoadingOrders(false);
      }
    );
    return () => unsub();
  }, [authorised]);

  useEffect(() => {
    if (!authorised) return;
    const settingsRef = doc(db, "settings", "poultry");
    const unsub = onSnapshot(
      settingsRef,
      async (snap) => {
        if (!snap.exists()) {
          try {
            await setDoc(settingsRef, { ...DEFAULT_SETTINGS, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            setSettings(DEFAULT_SETTINGS);
          } catch (error) {
            console.error("Failed creating default settings:", error);
            setSettings(DEFAULT_SETTINGS);
          }
          return;
        }
        setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<AppSettings>) });
      },
      (error) => console.error("Settings snapshot error:", error)
    );
    return () => unsub();
  }, [authorised]);

  useEffect(() => {
    if (!authorised || !isOwner) {
      setExpenses([]);
      setLoadingExpenses(false);
      return;
    }
    const q = query(collection(db, "expenses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setExpenses(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExpenseItem, "id">) })));
        setLoadingExpenses(false);
      },
      (error) => {
        console.error("Expenses snapshot error:", error);
        setLoadingExpenses(false);
      }
    );
    return () => unsub();
  }, [authorised, isOwner]);

  useEffect(() => {
    if (!selectedOrder) {
      setEditForm(null);
      setHasUnsavedChanges(false);
      return;
    }

    setEditForm({
      fullName: selectedOrder.fullName || "",
      phone: selectedOrder.phone || "",
      email: selectedOrder.email || "",
      notes: selectedOrder.notes || "",
      fulfilment: selectedOrder.fulfilment || (selectedOrder.delivery ? "delivery" : "collection"),
      deliveryArea: selectedOrder.deliveryArea || "",
      deliveryAddress: selectedOrder.deliveryAddress || "",
      paymentStatus: (selectedOrder.paymentStatus || "pending").toLowerCase() === "paid" ? "paid" : "pending",
      prepared: !!selectedOrder.prepared,
      packed: !!selectedOrder.packed,
      delivered: !!selectedOrder.delivered,
      cancelled: !!selectedOrder.cancelled,
      cancelReason: selectedOrder.cancelReason || "",
      productRows: rowsFromOrder(selectedOrder),
    });

    setHasUnsavedChanges(false);
    setSaveMessage("");

    const timer = setTimeout(() => {
      selectedBookingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => clearTimeout(timer);
  }, [selectedOrder]);

  const activeOrders = useMemo(() => orders.filter((o) => !o.cancelled), [orders]);

  const nextQueueNumber = useMemo(() => {
    const maxQueue = activeOrders.reduce((max, order) => Math.max(max, order.queueNumber || 0), 0);
    return maxQueue + 1;
  }, [activeOrders]);

  const deliveryAreas = useMemo(() => {
    return Array.from(new Set(orders.map((o) => (o.deliveryArea || "").trim()).filter(Boolean).sort((a, b) => a.localeCompare(b))));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    const next = orders.filter((order) => {
      const matchesSearch =
        !term ||
        order.fullName?.toLowerCase().includes(term) ||
        order.phone?.toLowerCase().includes(term) ||
        order.email?.toLowerCase().includes(term) ||
        orderReference(order.id).toLowerCase().includes(term) ||
        productSummary(order).toLowerCase().includes(term) ||
        (order.deliveryArea || "").toLowerCase().includes(term) ||
        (order.deliveryAddress || "").toLowerCase().includes(term);

      const payment = (order.paymentStatus || "pending").toLowerCase();
      const matchesPayment =
        paymentFilter === "all" || (paymentFilter === "paid" && payment === "paid") || (paymentFilter === "unpaid" && payment !== "paid");

      const matchesWorkflow =
        workflowFilter === "all" ||
        (workflowFilter === "received" && !order.cancelled && !order.prepared && !order.packed && !order.delivered) ||
        (workflowFilter === "prepared" && !order.cancelled && !!order.prepared && !order.packed && !order.delivered) ||
        (workflowFilter === "packed" && !order.cancelled && !!order.packed && !order.delivered) ||
        (workflowFilter === "awaiting_delivery" && !order.cancelled && !!order.delivery && !!order.packed && !order.delivered) ||
        (workflowFilter === "delivered" && !order.cancelled && !!order.delivered) ||
        (workflowFilter === "cancelled" && !!order.cancelled);

      const matchesDeliveryArea =
        deliveryAreaFilter === "all" ? true : (order.deliveryArea || "").trim().toLowerCase() === deliveryAreaFilter.toLowerCase();

      return matchesSearch && matchesPayment && matchesWorkflow && matchesDeliveryArea;
    });

    return [...next].sort((a, b) => {
      if (deliveryAreaFilter !== "all") {
        const aDelivered = !!a.delivered;
        const bDelivered = !!b.delivered;
        if (aDelivered !== bDelivered) return aDelivered ? 1 : -1;
      }
      const nameA = (a.fullName || "").trim();
      const nameB = (b.fullName || "").trim();
      if (!nameA && !nameB) return 0;
      if (!nameA) return 1;
      if (!nameB) return -1;
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    });
  }, [orders, search, paymentFilter, workflowFilter, deliveryAreaFilter]);

  const simpleSearchResults = useMemo(() => {
    const term = simpleSearch.trim().toLowerCase();
    if (!term) return [];

    const matched = activeOrders.filter((order) => {
      const name = (order.fullName || "").toLowerCase();
      const phone = (order.phone || "").toLowerCase();
      const email = (order.email || "").toLowerCase();
      const ref = orderReference(order.id).toLowerCase();
      const area = (order.deliveryArea || "").toLowerCase();
      return name.includes(term) || phone.includes(term) || email.includes(term) || ref.includes(term) || area.includes(term);
    });

    matched.sort((a, b) => {
      const nameA = (a.fullName || "").toLowerCase();
      const nameB = (b.fullName || "").toLowerCase();
      const aStarts = nameA.startsWith(term);
      const bStarts = nameB.startsWith(term);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    });

    return matched.slice(0, 12);
  }, [activeOrders, simpleSearch]);

  const queueOrders = useMemo(() => {
    return activeOrders
      .filter((order) => !order.cancelled && !order.prepared && (order.queueNumber || 0) > 0)
      .sort((a, b) => (a.queueNumber || 999999) - (b.queueNumber || 999999));
  }, [activeOrders]);

  const paidOrders = activeOrders.filter((o) => (o.paymentStatus || "pending").toLowerCase() === "paid");
  const unpaidOrders = activeOrders.filter((o) => (o.paymentStatus || "pending").toLowerCase() !== "paid");
  const preparedOrders = activeOrders.filter((o) => !!o.prepared);
  const pendingOrders = activeOrders.filter((o) => !o.prepared && !o.cancelled);
  const cancelledOrders = orders.filter((o) => !!o.cancelled);

  const totalCollected = paidOrders.filter(isPricingFinalized).reduce((sum, o) => sum + (o.totalPrice || 0), 0);
  const totalOutstanding = unpaidOrders.filter(isPricingFinalized).reduce((sum, o) => sum + (o.totalPrice || 0), 0);

  const totalItemsOrdered = activeOrders.reduce((sum, order) => {
    if (order.productBreakdown?.length) {
      return sum + order.productBreakdown.reduce((inner, row) => inner + (row.quantity || 0), 0);
    }
    return sum + (order.quantity || 0);
  }, 0);

  const totalExpenses = expenses.reduce((sum, item) => sum + (item.amount || 0), 0);
  const netCollectedAfterExpenses = totalCollected - totalExpenses;

  const deliveryOrders = useMemo(() => orders.filter((o) => !o.cancelled && !!o.delivery && !!(o.deliveryArea || "").trim()), [orders]);
  const undeliveredDeliveryOrders = useMemo(() => deliveryOrders.filter((o) => !o.delivered), [deliveryOrders]);

  const deliveryAreaSummary = useMemo(() => {
    return deliveryAreas
      .map((area) => {
        const areaOrders = undeliveredDeliveryOrders.filter((o) => (o.deliveryArea || "").trim().toLowerCase() === area.toLowerCase());
        const totalOrdersCount = areaOrders.length;
        const totalItems = areaOrders.reduce((sum, order) => {
          if (order.productBreakdown?.length) return sum + order.productBreakdown.reduce((inner, row) => inner + (row.quantity || 0), 0);
          return sum + (order.quantity || 0);
        }, 0);
        return { area, totalOrders: totalOrdersCount, totalItems };
      })
      .filter((item) => item.totalOrders > 0)
      .sort((a, b) => a.area.localeCompare(b.area));
  }, [deliveryAreas, undeliveredDeliveryOrders]);

  const manualProductBreakdown = useMemo(() => computeBreakdownFromRows(manualForm.productRows, settings), [manualForm.productRows, settings]);
  const editProductBreakdown = useMemo(() => (editForm ? computeBreakdownFromRows(editForm.productRows, settings) : []), [editForm, settings]);

  const currentBulkReminderOrder = bulkReminderTargets[bulkReminderIndex] || null;

  function markDirty() {
    setHasUnsavedChanges(true);
    setSaveMessage("");
  }

  function scrollToRef(ref: React.RefObject<HTMLDivElement | null>) {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }

  async function updateField(orderId: string, payload: Partial<OrderItem>) {
    try {
      setUpdatingField(orderId);
      await updateDoc(doc(db, "orders", orderId), { ...payload, updatedAt: serverTimestamp() });
    } catch (error) {
      console.error("Update failed:", error);
      alert("Unable to update this order right now.");
    } finally {
      setUpdatingField("");
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      window.location.assign("/login");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  }

  async function saveSettings() {
    try {
      setSettingsSaving(true);
      await setDoc(doc(db, "settings", "poultry"), { ...settings, updatedAt: serverTimestamp() }, { merge: true });
    } catch (error) {
      console.error("Settings save failed:", error);
      alert("Could not save settings.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function deleteExpense(expense: ExpenseItem) {
    if (!isOwner) return;
    const confirmed = window.confirm(`Delete this expense?\n\n${expense.title || "Untitled"} - ${formatZAR(expense.amount || 0)}`);
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "expenses", expense.id));
      setSaveMessage("Expense deleted successfully.");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      console.error("Expense delete failed:", error);
      alert("Could not delete this expense.");
    }
  }

  async function saveExpense() {
    if (!isOwner) return;
    const title = expenseForm.title.trim();
    const amount = Number(expenseForm.amount || 0);

    if (!title) {
      alert("Please enter an expense title.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Please enter a valid expense amount.");
      return;
    }

    try {
      setExpenseSaving(true);
      await setDoc(doc(collection(db, "expenses")), {
        title,
        amount,
        category: expenseForm.category,
        notes: expenseForm.notes.trim(),
        createdAt: serverTimestamp(),
        createdByRole: userRole || "",
      });
      setExpenseForm({ title: "", amount: "", category: "other", notes: "" });
      setSaveMessage("Expense added successfully.");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      console.error("Expense save failed:", error);
      alert("Could not save expense.");
    } finally {
      setExpenseSaving(false);
    }
  }

  function openWhatsAppForOrder(order: OrderItem, message: string) {
    const phone = cleanPhoneForWhatsApp(order.phone);
    if (!phone) {
      alert("This customer does not have a valid phone number saved.");
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function handleBulkPaymentReminders() {
    const targets = unpaidOrders
      .filter((order) => cleanPhoneForWhatsApp(order.phone))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", undefined, { sensitivity: "base" }));

    if (!targets.length) {
      alert("There are no unpaid customers with valid phone numbers.");
      return;
    }

    setBulkReminderTargets(targets);
    setBulkReminderIndex(0);
    setBulkReminderActive(true);
    setShowOutstandingPanel(false);
    setShowManualForm(false);
    setShowSettings(false);
  }

  function openCurrentBulkReminder() {
    if (!currentBulkReminderOrder) return;
    openWhatsAppForOrder(currentBulkReminderOrder, buildPaymentReminderMessage(currentBulkReminderOrder, settings));
  }

  function goToNextBulkReminder() {
    if (bulkReminderIndex >= bulkReminderTargets.length - 1) {
      setBulkReminderActive(false);
      setBulkReminderTargets([]);
      setBulkReminderIndex(0);
      setSaveMessage("Bulk reminder queue completed.");
      setTimeout(() => setSaveMessage(""), 3000);
      return;
    }
    setBulkReminderIndex((prev) => prev + 1);
  }

  function stopBulkReminder() {
    setBulkReminderActive(false);
    setBulkReminderTargets([]);
    setBulkReminderIndex(0);
  }

  async function handleQuickToggle(order: OrderItem, field: "paymentStatus" | "prepared" | "packed" | "delivered") {
    if (field === "paymentStatus") {
      const next = (order.paymentStatus || "pending").toLowerCase() === "paid" ? "pending" : "paid";
      await updateField(order.id, { paymentStatus: next as "pending" | "paid" });
      return;
    }
    if (field === "prepared") {
      const next = !order.prepared;
      await updateField(order.id, { prepared: next, queueNumber: next ? null : order.queueNumber || null });
      return;
    }
    if (field === "packed") {
      if (order.cancelled) return;
      await updateField(order.id, { packed: !order.packed });
      return;
    }
    if (field === "delivered") {
      await updateField(order.id, { delivered: !order.delivered });
    }
  }

  async function handleCheckIn(order: OrderItem) {
    if (order.cancelled || order.delivered || order.prepared) return;
    if (order.queueNumber && order.queueNumber > 0) return;

    try {
      setUpdatingField(order.id);

      const assignedQueueNumber = await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, "orders", order.id);
        const counterRef = doc(db, "queueMeta", "poultry");

        const orderSnap = await transaction.get(orderRef);
        const counterSnap = await transaction.get(counterRef);

        if (!orderSnap.exists()) throw new Error("Order no longer exists.");

        const latest = orderSnap.data() as Omit<OrderItem, "id">;
        if (latest.cancelled || latest.delivered || latest.prepared || (latest.queueNumber || 0) > 0) {
          throw new Error("This order cannot be queued.");
        }

        if (!counterSnap.exists()) {
          transaction.set(counterRef, { nextQueueNumber: 2, updatedAt: serverTimestamp() });
          transaction.update(orderRef, { queueNumber: 1, queueCheckedInAt: serverTimestamp(), updatedAt: serverTimestamp() });
          return 1;
        }

        const counterData = counterSnap.data() as { nextQueueNumber?: number };
        const nextNum = Number(counterData.nextQueueNumber || 0);
        if (!Number.isInteger(nextNum) || nextNum <= 0) throw new Error("Queue counter is invalid. Please fix the queue counter.");

        transaction.update(orderRef, { queueNumber: nextNum, queueCheckedInAt: serverTimestamp(), updatedAt: serverTimestamp() });
        transaction.set(counterRef, { nextQueueNumber: nextNum + 1, updatedAt: serverTimestamp() }, { merge: true });
        return nextNum;
      });

      setSimpleSearch("");
      setSaveMessage(`Queue number #${assignedQueueNumber} assigned successfully.`);
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      console.error("Queue assignment failed:", error);
      alert(error instanceof Error ? error.message : "Unable to assign the queue number right now.");
    } finally {
      setUpdatingField("");
    }
  }

  function handleOpenBooking(order: OrderItem) {
    setMode("management");
    setShowOutstandingPanel(false);
    setShowManualForm(false);
    setShowExpensesPanel(false);
    setShowSettings(false);
    setSelectedOrder(order);
    setTimeout(() => selectedBookingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }

  function handlePrintOrders() {
    const printableOrders = filteredOrders;
    const html = `
      <html>
        <head>
          <title>Northside Chickens Orders</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin-bottom: 8px; }
            .meta { margin-bottom: 24px; color: #555; font-size: 14px; }
            .order { border: 1px solid #ccc; border-radius: 10px; padding: 14px; margin-bottom: 14px; page-break-inside: avoid; }
            .row { margin: 4px 0; font-size: 14px; }
            .title { font-weight: bold; font-size: 16px; margin-bottom: 8px; }
          </style>
        </head>
        <body>
          <h1>Northside Chickens Orders</h1>
          <div class="meta">Printed on ${new Date().toLocaleString("en-ZA")} • Total orders: ${printableOrders.length}</div>
          ${printableOrders
            .map(
              (order) => `
            <div class="order">
              <div class="title">${order.fullName || "Unnamed"} — ${orderReference(order.id)}</div>
              <div class="row"><strong>Phone:</strong> ${order.phone || "—"}</div>
              <div class="row"><strong>Items:</strong> ${productSummary(order)}</div>
              <div class="row"><strong>Payment:</strong> ${order.paymentStatus || "pending"}</div>
              <div class="row"><strong>Status:</strong> ${statusLabel(order)}</div>
              <div class="row"><strong>Fulfilment:</strong> ${order.fulfilment === "delivery" ? "Delivery" : "Collection"}</div>
              <div class="row"><strong>Delivery Area:</strong> ${order.deliveryArea || "—"}</div>
              <div class="row"><strong>Total:</strong> ${orderAmountLabel(order)}</div>
            </div>`
            )
            .join("")}
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      alert("Unable to open print window.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function saveEditForm() {
    if (!selectedOrder || !editForm) return;

    if (!editForm.fullName.trim()) {
      alert("Please enter the customer name.");
      return;
    }
    if (!editForm.phone.trim()) {
      alert("Please enter the customer phone number.");
      return;
    }
    if (editForm.fulfilment === "delivery" && !editForm.deliveryArea.trim()) {
      alert("Please enter the delivery area.");
      return;
    }
    if (editForm.fulfilment === "delivery" && !editForm.deliveryAddress.trim()) {
      alert("Please enter the delivery address.");
      return;
    }
    if (editForm.packed && !editForm.prepared) {
      alert("An order cannot be marked as packed before it is marked as prepared.");
      return;
    }
    if (editForm.delivered && !editForm.packed) {
      alert("An order cannot be marked as delivered/collected before it is marked as packed.");
      return;
    }

    try {
      setSavingEdit(true);

      const productBreakdown = computeBreakdownFromRows(editForm.productRows, settings);
      if (!productBreakdown.length) {
        alert("Please add at least one valid product selection.");
        return;
      }

      const quantity = productBreakdown.reduce((sum, row) => sum + row.quantity, 0);
      const basePriceTotal = productBreakdown.reduce((sum, row) => sum + (row.subtotal || 0), 0);
      const deliveryTotal = editForm.fulfilment === "delivery" ? DELIVERY_FEE : 0;
      const pricingFinalized = !productBreakdown.some(isPOABreakdownRow);
      const totalPrice = pricingFinalized ? basePriceTotal + deliveryTotal : deliveryTotal;

      const finalPrepared = !!editForm.prepared;
      const finalPacked = finalPrepared ? !!editForm.packed : false;
      const finalDelivered = finalPacked ? !!editForm.delivered : false;

      const nextProductBreakdown = editForm.cancelled ? [] : productBreakdown;

      await applyProductStockTransaction({
        existingOrder: selectedOrder,
        nextProductBreakdown,
        buildOrderPayload: () => ({
          fullName: editForm.fullName.trim(),
          phone: editForm.phone.trim(),
          email: editForm.email.trim(),
          quantity: editForm.cancelled ? 0 : quantity,
          productSummary: editForm.cancelled ? "" : buildLegacyProductSummary(productBreakdown),
          productBreakdown: nextProductBreakdown,
          notes: editForm.notes.trim(),
          fulfilment: editForm.cancelled ? "collection" : editForm.fulfilment,
          delivery: editForm.cancelled ? false : editForm.fulfilment === "delivery",
          deliveryArea: editForm.cancelled || editForm.fulfilment !== "delivery" ? "" : editForm.deliveryArea.trim(),
          deliveryAddress: editForm.cancelled || editForm.fulfilment !== "delivery" ? "" : editForm.deliveryAddress.trim(),
          basePriceTotal: editForm.cancelled ? 0 : basePriceTotal,
          pricingFinalized: editForm.cancelled ? true : pricingFinalized,
          deliveryTotal: editForm.cancelled ? 0 : deliveryTotal,
          totalPrice: editForm.cancelled ? 0 : totalPrice,
          paymentStatus: editForm.paymentStatus,
          prepared: editForm.cancelled ? false : finalPrepared,
          packed: editForm.cancelled ? false : finalPacked,
          delivered: editForm.cancelled ? false : finalDelivered,
          cancelled: editForm.cancelled,
          cancelReason: editForm.cancelled ? editForm.cancelReason.trim() : "",
        }),
      });

      if (editForm.cancelled) {
        setHasUnsavedChanges(false);
        setSelectedOrder(null);
        setSaveMessage("Order cancelled.");
        setTimeout(() => setSaveMessage(""), 3000);
        return;
      }

      setHasUnsavedChanges(false);
      setSelectedOrder(null);
      setSaveMessage("Saved successfully.");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      console.error("Failed saving edit form:", error);
      alert(error instanceof Error ? error.message : "Could not save this order.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function submitManualBooking(e: FormEvent) {
    e.preventDefault();

    if (!manualForm.fullName.trim()) {
      alert("Please enter the customer name.");
      return;
    }
    if (!manualForm.phone.trim()) {
      alert("Please enter the customer phone number.");
      return;
    }
    if (manualForm.fulfilment === "delivery" && !manualForm.deliveryArea.trim()) {
      alert("Please enter the delivery area.");
      return;
    }
    if (manualForm.fulfilment === "delivery" && !manualForm.deliveryAddress.trim()) {
      alert("Please enter the delivery address.");
      return;
    }

    const productBreakdown = computeBreakdownFromRows(manualForm.productRows, settings);
    if (!productBreakdown.length) {
      alert("Please add at least one valid product selection.");
      return;
    }

    const quantity = productBreakdown.reduce((sum, row) => sum + row.quantity, 0);
    const basePriceTotal = productBreakdown.reduce((sum, row) => sum + (row.subtotal || 0), 0);
    const deliveryTotal = manualForm.fulfilment === "delivery" ? DELIVERY_FEE : 0;
    const pricingFinalized = !productBreakdown.some(isPOABreakdownRow);
    const totalPrice = pricingFinalized ? basePriceTotal + deliveryTotal : deliveryTotal;

    try {
      setManualSaving(true);

      await applyProductStockTransaction({
        existingOrder: null,
        nextProductBreakdown: productBreakdown,
        buildOrderPayload: () => ({
          fullName: manualForm.fullName.trim(),
          phone: manualForm.phone.trim(),
          email: manualForm.email.trim(),
          quantity,
          productSummary: buildLegacyProductSummary(productBreakdown),
          productBreakdown,
          notes: manualForm.notes.trim(),
          fulfilment: manualForm.fulfilment,
          delivery: manualForm.fulfilment === "delivery",
          deliveryArea: manualForm.fulfilment === "delivery" ? manualForm.deliveryArea.trim() : "",
          deliveryAddress: manualForm.fulfilment === "delivery" ? manualForm.deliveryAddress.trim() : "",
          basePriceTotal,
          pricingFinalized,
          deliveryTotal,
          totalPrice,
          paymentStatus: manualForm.paymentStatus,
          prepared: false,
          packed: false,
          delivered: false,
          cancelled: false,
          cancelReason: "",
          queueNumber: null,
          manualEntry: true,
          orderYear: new Date().getFullYear(),
        }),
      });

      setManualForm({
        fullName: "",
        phone: "",
        email: "",
        notes: "",
        fulfilment: "collection",
        deliveryArea: "",
        deliveryAddress: "",
        paymentStatus: "pending",
        productRows: [{ id: slugId(), label: "", quantity: "1", price: "" }],
      });
      setShowManualForm(false);
      setSaveMessage("Manual order added successfully.");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      console.error("Manual order failed:", error);
      alert(error instanceof Error ? error.message : "Could not add manual order.");
    } finally {
      setManualSaving(false);
    }
  }

  if (!authReady || !authorised) {
    return (
      <main className="min-h-screen bg-[#FAF6EE] font-['Work_Sans',sans-serif] text-[#221E19]">
        <FontLoader />
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] px-8 py-6 text-center shadow-[6px_6px_0_0_#221E19]">
            <p className={`${FONT_MONO} text-sm uppercase tracking-[0.22em] text-[#A93E2E]`}>Northside Chickens</p>
            <h1 className={`${FONT_DISPLAY} mt-3 text-2xl font-semibold`}>Opening the register</h1>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#FAF6EE] font-['Work_Sans',sans-serif] text-[#221E19]">
      <FontLoader />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.035] bg-[radial-gradient(#221E19_1px,transparent_1px)] bg-[size:18px_18px]" />

      <header className="mx-auto max-w-7xl px-4 pb-0 pt-5 sm:px-10">
        <div className="flex items-center justify-between gap-3 border-b-2 border-[#221E19] pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-[#221E19] bg-[#FFFDF8]">
              <Image src="/logo4.png" alt="Northside Chickens" width={90} height={90} className="object-contain rounded-full" priority />
            </div>
            <div className="hidden sm:block">
              <div className={`${FONT_DISPLAY} text-lg font-semibold leading-none`}>Northside Chickens</div>
              <div className={`${FONT_MONO} mt-1 text-[10px] uppercase tracking-[0.22em] text-[#221E19]/50`}>Staff register</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/" className="inline-flex h-9 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-transparent px-4 text-sm font-semibold transition hover:bg-[#221E19] hover:text-[#FAF6EE]">
              Home
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex h-9 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#C4872C] px-4 text-sm font-semibold text-[#221E19] shadow-[2px_2px_0_0_#221E19] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:w-auto sm:gap-3">
          <button
            type="button"
            onClick={() => setMode("simple")}
            className={`flex h-11 items-center justify-center rounded-[8px] border-2 border-[#221E19] text-sm font-semibold transition ${
              mode === "simple" ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] text-[#221E19] hover:bg-[#221E19]/[0.04]"
            }`}
          >
            Order Queue
          </button>
          <button
            type="button"
            onClick={() => setMode("management")}
            className={`flex h-11 items-center justify-center rounded-[8px] border-2 border-[#221E19] text-sm font-semibold transition ${
              mode === "management" ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] text-[#221E19] hover:bg-[#221E19]/[0.04]"
            }`}
          >
            Management
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-10 lg:pb-24">
        <div className="text-center xl:text-left">
          <div className={`${FONT_MONO} inline-flex items-center gap-2 rounded-full border-[2.5px] border-[#A93E2E] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A93E2E]`}>
            Northside Chickens
          </div>
          <h1 className={`${FONT_DISPLAY} mt-4 text-[2rem] font-semibold leading-[1.08] tracking-tight sm:text-[3rem] lg:text-[3.4rem]`}>
            {mode === "simple" ? "Order Queue" : "Management Dashboard"}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-[0.95rem] leading-7 text-[#221E19]/62 sm:text-[1.04rem] sm:leading-8 xl:mx-0">
            {mode === "simple"
              ? "When a customer arrives, search for their order and place it into the queue to be prepared and packed."
              : "Full control over orders, product stock, payments, settings, reminders, manual orders, and expenses."}
          </p>
        </div>

        {mode === "simple" ? (
          <div className="mt-8 space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <SummaryCard label="Not Yet Prepared" value={String(pendingOrders.length)} />
              <SummaryCard label="Prepared" value={String(preparedOrders.length)} />
            </div>

            <div className="rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-5 shadow-[6px_6px_0_0_#221E19] sm:p-6">
              <div className="mb-4">
                <h3 className={`${FONT_DISPLAY} text-lg font-semibold`}>Add Customer To Queue</h3>
                <p className="mt-1 text-sm text-[#221E19]/55">Search orders below and place them into the queue in order of arrival.</p>
              </div>

              <label className="mb-3 block text-sm font-medium text-[#221E19]/80">Search customer</label>


              {simpleSearch.trim() ? (
                <div className="mt-5 space-y-3">
                  {simpleSearchResults.length === 0 ? (
                    <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] p-4 text-sm text-[#221E19]/60">No matching order found.</div>
                  ) : (
                    simpleSearchResults.map((order) => {
                      const alreadyInQueue = !!(order.queueNumber && order.queueNumber > 0);
                      return (
                        <div key={order.id} className="rounded-[10px] border-2 border-[#221E19] bg-[#FFFDF8] p-4 shadow-[3px_3px_0_0_#221E19] sm:p-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className={`${FONT_DISPLAY} text-base font-semibold`}>{order.fullName || "Unnamed order"}</div>
                            <PaymentBadge value={order.paymentStatus} />
                            <WorkflowBadge order={order} />
                          </div>
                          <div className="mt-2 text-sm text-[#221E19]/55">
                            {orderReference(order.id)} • {order.phone || "No phone"}
                          </div>
                          <div className={`${FONT_MONO} mt-1 text-sm text-[#A93E2E]`}>{productSummary(order)}</div>

                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            {alreadyInQueue ? (
                              <div className="inline-flex items-center rounded-full border-2 border-[#C4872C] bg-[#C4872C]/15 px-4 py-2 text-sm font-medium text-[#8a5f1c]">
                                Already in queue as #{order.queueNumber}
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={updatingField === order.id || !!order.cancelled || !!order.prepared}
                                onClick={() => handleCheckIn(order)}
                                className="inline-flex h-12 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#C4872C] px-6 text-sm font-semibold text-[#221E19] shadow-[3px_3px_0_0_#221E19] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {updatingField === order.id ? "Assigning Queue Number..." : "Put Customer Next In Queue"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="mt-5 rounded-[10px] border-2 border-dashed border-[#E4D9C4] p-4 text-sm text-[#221E19]/45">
                  Start typing the customer name, phone number, email, or order reference to place them into the queue.
                </div>
              )}
            </div>

            <div className="rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-5 shadow-[6px_6px_0_0_#221E19] sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className={`${FONT_DISPLAY} text-lg font-semibold`}>Order Queue</h3>
                  <p className="mt-1 text-sm text-[#221E19]/55">In order of arrival.</p>
                </div>
                <div className="rounded-full border-2 border-[#221E19] bg-[#FAF6EE] px-4 py-2 text-sm text-[#221E19]/70">Next: #{nextQueueNumber}</div>
              </div>

              <div className="space-y-3">
                {queueOrders.length === 0 ? (
                  <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] p-4 text-sm text-[#221E19]/60">
                    No customers in the queue yet. Search a customer above to check them in.
                  </div>
                ) : (
                  queueOrders.map((order, index) => (
                    <div
                      key={order.id}
                      className={`rounded-[10px] border-2 p-4 transition ${
                        index === 0 ? "border-[#C4872C] bg-[#C4872C]/10" : "border-[#221E19]/15 bg-[#FAF6EE]"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`${FONT_MONO} inline-flex h-8 min-w-[48px] items-center justify-center rounded-full border-2 border-[#221E19] bg-[#C4872C] px-3 text-sm font-bold text-[#221E19]`}>
                            #{order.queueNumber}
                          </span>
                          <span className={`${FONT_DISPLAY} text-base font-semibold`}>{order.fullName || "Unnamed"}</span>
                        </div>
                        {isOwner ? <span className={`${FONT_MONO} text-sm font-semibold text-[#A93E2E]`}>{orderAmountLabel(order)}</span> : null}
                      </div>

                      {index === 0 && (
                        <div className={`${FONT_MONO} mt-3 inline-flex rounded-full border-2 border-[#C4872C] bg-[#C4872C]/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a5f1c]`}>
                          Next Customer
                        </div>
                      )}

                      <div className="mt-2 text-sm text-[#221E19]/55">
                        {orderReference(order.id)} • {order.phone || "No phone"} • {productSummary(order)}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={updatingField === order.id || !!order.cancelled}
                          onClick={() => handleQuickToggle(order, "prepared")}
                          className={`inline-flex rounded-full border-2 border-[#221E19] px-4 py-2 text-sm font-medium transition ${
                            order.prepared ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] text-[#221E19] hover:bg-[#221E19]/[0.04]"
                          }`}
                        >
                          {order.prepared ? "Prepared" : "Mark Prepared"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openWhatsAppForOrder(order, buildQueueAssignedMessage(order, order.queueNumber || 0))}
                          className="inline-flex rounded-full border-2 border-[#221E19] bg-transparent px-4 py-2 text-sm font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                        >
                          WhatsApp Update
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            <div className={`grid gap-4 sm:grid-cols-2 ${isOwner ? "xl:grid-cols-7" : "xl:grid-cols-2"}`}>
              <SummaryCard label="Total Orders" value={String(activeOrders.length)} helper={`${cancelledOrders.length} cancelled`} />
              <SummaryCard label="Items Ordered" value={String(totalItemsOrdered)} />
              {isOwner && <SummaryCard label="Collected" value={formatZAR(totalCollected)} helper={`${paidOrders.length} paid`} />}
              {isOwner && <SummaryCard label="Outstanding" value={formatZAR(totalOutstanding)} helper={`${unpaidOrders.length} unpaid`} />}
              {isOwner && <SummaryCard label="Expenses" value={formatZAR(totalExpenses)} helper={`${expenses.length} logged`} />}
              {isOwner && <SummaryCard label="Net Profit" value={formatZAR(netCollectedAfterExpenses)} helper="Collected minus expenses" />}
              {isOwner && <SummaryCard label="Prepared" value={String(preparedOrders.length)} />}
            </div>

            <ProductCountSummary settings={settings} activeOrders={activeOrders} />

            <div className="rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-5 shadow-[6px_6px_0_0_#221E19] sm:p-6">
              <div className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className={`${FONT_MONO} text-[11px] font-semibold uppercase tracking-[0.28em] text-[#A93E2E]`}>Management Operations</p>
                    <h3 className={`${FONT_DISPLAY} mt-2 text-lg font-semibold sm:text-xl`}>Admin controls</h3>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] p-4 sm:p-5">
                    <p className={`${FONT_MONO} mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#A93E2E]`}>Workflow</p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !showManualForm;
                          setShowManualForm(next);
                          setShowSettings(false);
                          setShowExpensesPanel(false);
                          setPaymentFilter("all");
                          setWorkflowFilter("all");
                          if (next) scrollToRef(manualBookingRef);
                        }}
                        className={`inline-flex h-11 items-center justify-center rounded-[8px] border-2 border-[#221E19] px-5 text-sm font-semibold transition ${
                          showManualForm ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                        }`}
                      >
                        {showManualForm ? "Hide Manual Order" : "Add Manual Order"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next = !showExpensesPanel;
                          setShowExpensesPanel(next);
                          setShowManualForm(false);
                          setShowSettings(false);
                          if (next) scrollToRef(expensesPanelRef);
                        }}
                        className={`inline-flex h-11 items-center justify-center rounded-[8px] border-2 border-[#221E19] px-5 text-sm font-semibold transition ${
                          showExpensesPanel ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                        }`}
                      >
                        {showExpensesPanel ? "Hide Expenses" : "Expenses"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const isActive = workflowFilter === "awaiting_delivery";
                          setShowManualForm(false);
                          setShowSettings(false);
                          setPaymentFilter("all");
                          setWorkflowFilter(isActive ? "all" : "awaiting_delivery");
                        }}
                        className={`inline-flex h-11 items-center justify-center rounded-[8px] border-2 border-[#221E19] px-5 text-sm font-semibold transition ${
                          workflowFilter === "awaiting_delivery" ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                        }`}
                      >
                        Awaiting Delivery
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const isActive = workflowFilter === "delivered";
                          setShowManualForm(false);
                          setShowSettings(false);
                          setPaymentFilter("all");
                          setWorkflowFilter(isActive ? "all" : "delivered");
                        }}
                        className={`inline-flex h-11 items-center justify-center rounded-[8px] border-2 border-[#221E19] px-5 text-sm font-semibold transition ${
                          workflowFilter === "delivered" ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                        }`}
                      >
                        Delivered / Collected
                      </button>

                      {isOwner ? (
                        <button
                          type="button"
                          onClick={() => {
                            const next = !showOutstandingPanel;
                            setShowOutstandingPanel(next);
                            setShowManualForm(false);
                            setShowSettings(false);
                            setShowExpensesPanel(false);
                            if (next) scrollToRef(outstandingPanelRef);
                          }}
                          className={`inline-flex h-11 items-center justify-center rounded-[8px] border-2 border-[#221E19] px-5 text-sm font-semibold transition ${
                            showOutstandingPanel ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                          }`}
                        >
                          {showOutstandingPanel ? "Hide Outstanding" : "Outstanding Payments"}
                        </button>
                      ) : null}

                      {isOwner ? (
                        <button
                          type="button"
                          onClick={handleBulkPaymentReminders}
                          className="inline-flex h-11 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-transparent px-5 text-sm font-semibold transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                        >
                          Bulk Payment Reminders
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] p-4 sm:p-5">
                    <p className={`${FONT_MONO} mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#A93E2E]`}>Filters</p>
                    <div className="space-y-4">
                      <div>
                        <div className="mb-2 text-sm font-medium text-[#221E19]/80">Payment</div>
                        <div className="flex flex-wrap gap-2">
                          <FilterButton active={paymentFilter === "all"} label="All" onClick={() => setPaymentFilter("all")} />
                          <FilterButton active={paymentFilter === "unpaid"} label="Unpaid" onClick={() => setPaymentFilter("unpaid")} />
                          <FilterButton active={paymentFilter === "paid"} label="Paid" onClick={() => setPaymentFilter("paid")} />
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-sm font-medium text-[#221E19]/80">Status</div>
                        <div className="flex flex-wrap gap-2">
                          <FilterButton active={workflowFilter === "all"} label="All" onClick={() => setWorkflowFilter("all")} />
                          <FilterButton active={workflowFilter === "received"} label="Received" onClick={() => setWorkflowFilter("received")} />
                          <FilterButton active={workflowFilter === "prepared"} label="Prepared" onClick={() => setWorkflowFilter("prepared")} />
                          <FilterButton active={workflowFilter === "packed"} label="Packed" onClick={() => setWorkflowFilter("packed")} />
                          <FilterButton active={workflowFilter === "cancelled"} label="Cancelled" onClick={() => setWorkflowFilter("cancelled")} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] p-4 sm:p-5">
                    <p className={`${FONT_MONO} mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#A93E2E]`}>Tools</p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handlePrintOrders}
                        className="inline-flex h-11 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#FFFDF8] px-5 text-sm font-medium transition hover:bg-[#221E19]/[0.04]"
                      >
                        Print Orders
                      </button>
                      {isOwner ? (
                        <button
                          type="button"
                          onClick={initialiseQueueCounter}
                          className="inline-flex h-11 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#FFFDF8] px-5 text-sm font-medium transition hover:bg-[#221E19]/[0.04]"
                        >
                          Fix Queue Counter
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          const next = !showSettings;
                          setShowSettings(next);
                          setShowManualForm(false);
                          if (next) scrollToRef(settingsPanelRef);
                        }}
                        className={`inline-flex h-11 items-center justify-center rounded-[8px] border-2 border-[#221E19] px-5 text-sm font-semibold transition ${
                          showSettings ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                        }`}
                      >
                        {showSettings ? "Hide Settings" : "Settings"}
                      </button>
                    </div>
                  </div>
                </div>

                {saveMessage ? (
                  <div className="flex items-center">
                    <div className="inline-flex rounded-full border-2 border-[#6E7A55] bg-[#6E7A55]/10 px-4 py-2 text-sm text-[#6E7A55]">{saveMessage}</div>
                  </div>
                ) : null}

                {bulkReminderActive && currentBulkReminderOrder ? (
                  <div className="rounded-[10px] border-2 border-dashed border-[#C4872C] bg-[#C4872C]/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className={`${FONT_MONO} text-xs uppercase tracking-[0.18em] text-[#8a5f1c]`}>
                          Reminder {bulkReminderIndex + 1} of {bulkReminderTargets.length}
                        </p>
                        <p className={`${FONT_DISPLAY} mt-1 font-semibold`}>{currentBulkReminderOrder.fullName || "Unnamed"}</p>
                        <p className="text-sm text-[#221E19]/60">{orderReference(currentBulkReminderOrder.id)} • {currentBulkReminderOrder.phone}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={openCurrentBulkReminder} className="inline-flex h-10 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#C4872C] px-4 text-sm font-semibold">
                          Open WhatsApp
                        </button>
                        <button type="button" onClick={goToNextBulkReminder} className="inline-flex h-10 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#FFFDF8] px-4 text-sm font-medium">
                          Next
                        </button>
                        <button type="button" onClick={stopBulkReminder} className="inline-flex h-10 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-transparent px-4 text-sm font-medium">
                          Stop
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 grid gap-4 xl:grid-cols-[1.5fr_auto] xl:items-end">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Search</label>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Name, phone, email, reference, or product"
                      className="h-12 w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none transition focus:border-[#221E19]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Delivery Area</label>
                    <select
                      value={deliveryAreaFilter}
                      onChange={(e) => setDeliveryAreaFilter(e.target.value)}
                      className="h-12 w-full min-w-[240px] rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 pr-10 text-sm text-[#221E19] outline-none transition focus:border-[#221E19]"
                    >
                      <option value="all">All Areas ({undeliveredDeliveryOrders.length} orders)</option>
                      {deliveryAreaSummary
                        .sort((a, b) => (b.totalOrders !== a.totalOrders ? b.totalOrders - a.totalOrders : a.area.localeCompare(b.area)))
                        .map((item) => (
                          <option key={item.area} value={item.area}>
                            {item.area} — {item.totalOrders} order{item.totalOrders === 1 ? "" : "s"} • {item.totalItems} items
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {showManualForm ? (
                  <div ref={manualBookingRef} className="mt-6 rounded-[10px] border-2 border-dashed border-[#E4D9C4] p-5">
                    <h3 className={`${FONT_DISPLAY} text-lg font-semibold`}>Add Manual Order</h3>
                    <p className="mt-1 text-sm text-[#221E19]/55">Add an order directly for a walk-in customer.</p>

                    <form onSubmit={submitManualBooking} className="mt-5 grid gap-5">
                      <div className="grid gap-4 md:grid-cols-3">
                        {[
                          ["Full name", "fullName"],
                          ["Phone number", "phone"],
                          ["Email", "email"],
                        ].map(([label, key]) => (
                          <div key={key}>
                            <label className="mb-2 block text-sm font-medium text-[#221E19]/80">{label}</label>
                            <input
                              value={(manualForm as any)[key]}
                              onChange={(e) => setManualForm((prev) => ({ ...prev, [key]: e.target.value }))}
                              className="h-12 w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FFFDF8] px-4 text-sm text-[#221E19] outline-none"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FFFDF8] p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <div>
                            <p className="font-medium">Product selections</p>
                            <p className="text-sm text-[#221E19]/55">Mix multiple products in one order.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setManualForm((prev) => ({
                                ...prev,
                                productRows: [...prev.productRows, { id: slugId(), label: "", quantity: "1", price: "" }],
                              }))
                            }
                            className="inline-flex h-10 items-center justify-center rounded-full border-2 border-[#221E19] bg-transparent px-4 text-sm font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                          >
                            Add Row
                          </button>
                        </div>

                        <div className="space-y-3">
                          {manualForm.productRows.map((row) => (
                            <div key={row.id} className="grid gap-3 md:grid-cols-[1fr_120px_160px_auto]">
                              <select
                                value={row.label}
                                onChange={(e) =>
                                  setManualForm((prev) => ({
                                    ...prev,
                                    productRows: prev.productRows.map((item) => (item.id === row.id ? { ...item, label: e.target.value } : item)),
                                  }))
                                }
                                className="h-12 rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
                              >
                                <option value="">Select product</option>
                                {settings.productOptions.map((option) => (
                                  <option key={option.label} value={option.label}>
                                    {option.label} — {option.isPOA || option.price === null ? "POA" : formatZAR(option.price ?? 0)}
                                    {typeof option.stock === "number" ? ` — ${option.stock} left` : ""}
                                  </option>
                                ))}
                              </select>

                              <input
                                type="number"
                                min={1}
                                value={row.quantity}
                                onChange={(e) =>
                                  setManualForm((prev) => ({
                                    ...prev,
                                    productRows: prev.productRows.map((item) => (item.id === row.id ? { ...item, quantity: e.target.value } : item)),
                                  }))
                                }
                                className="h-12 rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
                              />

                              <input
                                type="number"
                                min={0}
                                placeholder="Price if POA"
                                value={row.price}
                                onChange={(e) =>
                                  setManualForm((prev) => ({
                                    ...prev,
                                    productRows: prev.productRows.map((item) => (item.id === row.id ? { ...item, price: e.target.value } : item)),
                                  }))
                                }
                                className="h-12 rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  setManualForm((prev) => ({
                                    ...prev,
                                    productRows: prev.productRows.length === 1 ? prev.productRows : prev.productRows.filter((item) => item.id !== row.id),
                                  }))
                                }
                                className="inline-flex h-12 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#FAF6EE] px-4 text-sm font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Notes</label>
                        <textarea
                          rows={4}
                          value={manualForm.notes}
                          onChange={(e) => setManualForm((prev) => ({ ...prev, notes: e.target.value }))}
                          className="w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FFFDF8] px-4 py-3 text-sm text-[#221E19] outline-none"
                        />
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setManualForm((prev) => ({ ...prev, fulfilment: prev.fulfilment === "delivery" ? "collection" : "delivery" }))}
                          className={`inline-flex h-11 items-center justify-center rounded-full border-2 border-[#221E19] px-5 text-sm font-medium transition ${
                            manualForm.fulfilment === "delivery" ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                          }`}
                        >
                          {manualForm.fulfilment === "delivery" ? "Delivery" : "Collection"}
                        </button>

                        {manualForm.fulfilment === "delivery" ? (
                          <div className="grid w-full gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Delivery area</label>
                              <input
                                value={manualForm.deliveryArea}
                                onChange={(e) => setManualForm((prev) => ({ ...prev, deliveryArea: e.target.value }))}
                                placeholder="Example: Lenasia"
                                className="h-12 w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FFFDF8] px-4 text-sm text-[#221E19] outline-none"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Delivery address</label>
                              <textarea
                                rows={3}
                                value={manualForm.deliveryAddress}
                                onChange={(e) => setManualForm((prev) => ({ ...prev, deliveryAddress: e.target.value }))}
                                placeholder="Enter the full delivery address"
                                className="w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FFFDF8] px-4 py-3 text-sm text-[#221E19] outline-none"
                              />
                            </div>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => setManualForm((prev) => ({ ...prev, paymentStatus: prev.paymentStatus === "paid" ? "pending" : "paid" }))}
                          className={`inline-flex h-11 items-center justify-center rounded-full border-2 border-[#221E19] px-5 text-sm font-medium transition ${
                            manualForm.paymentStatus === "paid" ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                          }`}
                        >
                          {manualForm.paymentStatus === "paid" ? "Marked Paid" : "Marked Unpaid"}
                        </button>
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={manualSaving}
                          className="inline-flex h-12 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#C4872C] px-6 text-sm font-semibold text-[#221E19] shadow-[3px_3px_0_0_#221E19] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
                        >
                          {manualSaving ? "Saving..." : "Save Manual Order"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowManualForm(false)}
                          className="inline-flex h-12 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-transparent px-6 text-sm font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}

                {showSettings ? (
                  <div ref={settingsPanelRef} className="mt-6 rounded-[10px] border-2 border-dashed border-[#E4D9C4] p-5">
                    <h3 className={`${FONT_DISPLAY} text-lg font-semibold`}>Settings</h3>
                    <p className="mt-1 text-sm text-[#221E19]/55">Banking details, order cutoff, and product prices/stock.</p>

<div className="mt-5 rounded-[10px] border-2 border-[#221E19]/15 bg-[#FFFDF8] p-4">
  <div className="mb-4 flex items-center justify-between">
    <div>
      <p className="font-medium">Product Prices & Stock</p>
      <p className="text-sm text-[#221E19]/55">Set prices AND stock. Leave stock empty = unlimited.</p>
    </div>
    <button
      type="button"
      onClick={() =>
        setSettings((prev) => ({
          ...prev,
          productOptions: [...prev.productOptions, { label: "", price: 0, stock: null, unit: "pack" }],
        }))
      }
      className="inline-flex h-10 items-center justify-center rounded-full border-2 border-[#221E19] bg-transparent px-4 text-sm font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
    >
      + Add Product
    </button>
  </div>

  <div className="space-y-3">
{settings.productOptions.map((option, index) => (
  <div key={index} className="grid gap-3 md:grid-cols-[1fr_150px_150px_auto]">
        <input
          value={option.label}
          onChange={(e) =>
            setSettings((prev) => ({
              ...prev,
              productOptions: prev.productOptions.map((item, i) => (i === index ? { ...item, label: e.target.value } : item)),
            }))
          }
          className="h-12 rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
          placeholder="Product label"
        />

        <input
          type="number"
          min={0}
          value={option.price ?? ""}
          onChange={(e) =>
            setSettings((prev) => ({
              ...prev,
              productOptions: prev.productOptions.map((item, i) =>
                i === index ? { ...item, price: Number(e.target.value || 0) } : item
              ),
            }))
          }
          className="h-12 rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
          placeholder="Price"
        />

        <input
          type="number"
          min={0}
          value={option.stock ?? ""}
          onChange={(e) =>
            setSettings((prev) => ({
              ...prev,
              productOptions: prev.productOptions.map((item, i) =>
                i === index ? { ...item, stock: e.target.value.trim() === "" ? null : Number(e.target.value) } : item
              ),
            }))
          }
          className="h-12 rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
          placeholder="Stock (blank = unlimited)"
        />

        <button
          type="button"
          onClick={() =>
            setSettings((prev) => ({
              ...prev,
              productOptions: prev.productOptions.filter((_, i) => i !== index),
            }))
          }
          className="inline-flex h-12 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#FAF6EE] px-4 text-sm font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
        >
          Remove
        </button>
      </div>
    ))}
  </div>
</div>

                    <div className="mt-5 rounded-[10px] border-2 border-[#221E19]/15 bg-[#FFFDF8] p-4">
                      <p className="mb-4 font-medium">Banking Details</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        {(["accountName", "bankName", "accountNumber", "accountType", "branchCode"] as const).map((key) => (
                          <input
                            key={key}
                            value={settings[key]}
                            onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                            className="h-12 rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
                            placeholder={key}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 flex gap-3">
                      <button
                        type="button"
                        onClick={saveSettings}
                        disabled={settingsSaving}
                        className="inline-flex h-12 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#C4872C] px-6 text-sm font-semibold text-[#221E19] shadow-[3px_3px_0_0_#221E19] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
                      >
                        {settingsSaving ? "Saving..." : "Save Settings"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {isOwner && showOutstandingPanel ? (
                  <div ref={outstandingPanelRef} className="mt-6 rounded-[10px] border-2 border-dashed border-[#E4D9C4] p-5">
                    <h3 className={`${FONT_DISPLAY} text-lg font-semibold`}>Outstanding Payments</h3>
                    <p className="mt-1 text-sm text-[#221E19]/55">Quick follow-up list of unpaid customers.</p>

                    <div className="mt-5 space-y-3">
                      {unpaidOrders.length === 0 ? (
                        <div className="text-sm text-[#221E19]/55">No unpaid customers right now.</div>
                      ) : (
                        unpaidOrders.slice(0, 10).map((order) => (
                          <div key={order.id} className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FFFDF8] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium">{order.fullName}</div>
                                <div className="mt-1 text-sm text-[#221E19]/55">{order.phone}</div>
                                {order.deliveryArea ? <div className="mt-1 text-xs text-[#221E19]/45">Area: {order.deliveryArea}</div> : null}
                              </div>
                              <div className={`${FONT_MONO} text-sm font-semibold text-[#A93E2E]`}>{isOwner ? orderAmountLabel(order) : ""}</div>
                            </div>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => openWhatsAppForOrder(order, buildPaymentReminderMessage(order, settings))}
                                className="inline-flex rounded-full border-2 border-[#221E19] bg-transparent px-4 py-2 text-xs font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                              >
                                Remind
                              </button>
                              <button
                                type="button"
                                onClick={() => (selectedOrder?.id === order.id ? setSelectedOrder(null) : handleOpenBooking(order))}
                                className="inline-flex rounded-full border-2 border-[#221E19] bg-transparent px-4 py-2 text-xs font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                              >
                                {selectedOrder?.id === order.id ? "Close" : "Open"}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}

                {isOwner && showExpensesPanel ? (
                  <div ref={expensesPanelRef} className="mt-6 rounded-[10px] border-2 border-dashed border-[#E4D9C4] p-5">
                    <h3 className={`${FONT_DISPLAY} text-lg font-semibold`}>Expenses</h3>
                    <p className="mt-1 text-sm text-[#221E19]/55">Track costs like staff wages, packaging, transport, and other operational expenses.</p>

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <SummaryCard label="Total Expenses" value={formatZAR(totalExpenses)} />
                      <SummaryCard label="Collected" value={formatZAR(totalCollected)} />
                      <SummaryCard label="Outstanding" value={formatZAR(totalOutstanding)} />
                      <SummaryCard label="Net After Expenses" value={formatZAR(netCollectedAfterExpenses)} />
                    </div>

                    <div className="mt-6 rounded-[10px] border-2 border-[#221E19]/15 bg-[#FFFDF8] p-4">
                      <h4 className={`${FONT_DISPLAY} text-base font-semibold`}>Add Expense</h4>
                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Title</label>
                          <input
                            value={expenseForm.title}
                            onChange={(e) => setExpenseForm((prev) => ({ ...prev, title: e.target.value }))}
                            placeholder="e.g. Packaging supplies"
                            className="h-12 w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Amount</label>
                          <input
                            type="number"
                            min={0}
                            value={expenseForm.amount}
                            onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                            placeholder="Enter amount"
                            className="h-12 w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Category</label>
                          <select
                            value={expenseForm.category}
                            onChange={(e) => setExpenseForm((prev) => ({ ...prev, category: e.target.value as ExpenseItem["category"] }))}
                            className="h-12 w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
                          >
                            <option value="staff">Staff</option>
                            <option value="packaging">Packaging</option>
                            <option value="transport">Transport</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={saveExpense}
                            disabled={expenseSaving}
                            className="inline-flex h-12 w-full items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#C4872C] px-6 text-sm font-semibold text-[#221E19] shadow-[3px_3px_0_0_#221E19] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
                          >
                            {expenseSaving ? "Saving..." : "Save Expense"}
                          </button>
                        </div>
                      </div>
                      <div className="mt-4">
                        <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Notes</label>
                        <textarea
                          rows={3}
                          value={expenseForm.notes}
                          onChange={(e) => setExpenseForm((prev) => ({ ...prev, notes: e.target.value }))}
                          placeholder="Optional notes"
                          className="w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 py-3 text-sm text-[#221E19] outline-none"
                        />
                      </div>
                    </div>

                    <div className="mt-6 rounded-[10px] border-2 border-[#221E19]/15 bg-[#FFFDF8] p-4">
                      <h4 className={`${FONT_DISPLAY} text-base font-semibold`}>Recent Expenses</h4>
                      <div className="mt-4 space-y-3">
                        {loadingExpenses ? (
                          <div className="text-sm text-[#221E19]/55">Loading expenses...</div>
                        ) : expenses.length === 0 ? (
                          <div className="text-sm text-[#221E19]/55">No expenses logged yet.</div>
                        ) : (
                          expenses.slice(0, 12).map((item) => (
                            <div key={item.id} className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-medium">{item.title || "Untitled expense"}</div>
                                  <div className={`${FONT_MONO} mt-1 text-xs text-[#221E19]/55`}>
                                    {(item.category || "other").toUpperCase()} • {formatDate(item.createdAt)}
                                  </div>
                                  {item.notes ? <div className="mt-2 text-sm text-[#221E19]/60">{item.notes}</div> : null}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className={`${FONT_MONO} text-sm font-semibold text-[#A93E2E]`}>{formatZAR(item.amount || 0)}</div>
                                  <button
                                    type="button"
                                    onClick={() => deleteExpense(item)}
                                    className="inline-flex h-9 items-center justify-center rounded-full border-2 border-[#A93E2E] bg-[#A93E2E]/10 px-4 text-xs font-semibold text-[#A93E2E] transition hover:bg-[#A93E2E]/20"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-8 xl:grid-cols-12 xl:gap-8">
              <div className="xl:col-span-7">
                <SectionCard
                  title="Orders"
                  sub={deliveryAreaFilter === "all" ? "Find the order, open it, and manage it from one clear editor." : `Showing orders for delivery area: ${deliveryAreaFilter}`}
                >
                  <div className="space-y-4">
                    {loadingOrders ? (
                      <div className="text-sm text-[#221E19]/60">Loading orders...</div>
                    ) : filteredOrders.length === 0 ? (
                      <div className="text-sm text-[#221E19]/60">No orders found for the current filter.</div>
                    ) : (
                      filteredOrders.map((order) => (
                        <div
                          key={order.id}
                          className={`rounded-[10px] border-2 p-4 transition ${
                            selectedOrder?.id === order.id ? "border-[#C4872C] bg-[#C4872C]/10" : "border-[#221E19]/15 bg-[#FAF6EE]"
                          }`}
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className={`${FONT_DISPLAY} text-base font-semibold`}>{order.fullName || "Unnamed order"}</div>
                                <PaymentBadge value={order.paymentStatus} />
                                <WorkflowBadge order={order} />
                                {order.manualEntry && (
                                  <span className={`${FONT_MONO} inline-flex rounded-full border-2 border-[#221E19]/20 bg-transparent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#221E19]/60`}>
                                    Manual
                                  </span>
                                )}
                              </div>

                              <div className="mt-2 text-sm text-[#221E19]/55">
                                {orderReference(order.id)} • {order.phone || "No phone"} • {order.fulfilment === "delivery" ? "Delivery" : "Collection"}
                              </div>

                              <div className={`${FONT_MONO} mt-1 text-sm text-[#A93E2E]`}>{productSummary(order)}</div>

                              {order.deliveryArea ? <div className="mt-1 text-xs text-[#221E19]/45">Delivery area: {order.deliveryArea}</div> : null}

                              {isOwner ? <div className={`${FONT_MONO} mt-2 text-sm font-medium`}>{orderAmountLabel(order)}</div> : null}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={updatingField === order.id}
                                onClick={() => handleQuickToggle(order, "paymentStatus")}
                                className={`inline-flex rounded-full border-2 border-[#221E19] px-4 py-2 text-sm font-medium transition ${
                                  (order.paymentStatus || "pending").toLowerCase() === "paid" ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                                }`}
                              >
                                {(order.paymentStatus || "pending").toLowerCase() === "paid" ? "Paid" : "Mark Paid"}
                              </button>

                              <button
                                type="button"
                                disabled={updatingField === order.id || !!order.cancelled}
                                onClick={() => handleQuickToggle(order, "prepared")}
                                className={`inline-flex rounded-full border-2 border-[#221E19] px-4 py-2 text-sm font-medium transition ${
                                  order.prepared ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                                }`}
                              >
                                {order.prepared ? "Prepared" : "Mark Prepared"}
                              </button>

                              <button
                                type="button"
                                disabled={updatingField === order.id || !!order.cancelled}
                                onClick={() => handleQuickToggle(order, "packed")}
                                className={`inline-flex rounded-full border-2 border-[#221E19] px-4 py-2 text-sm font-medium transition ${
                                  order.packed ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                                }`}
                              >
                                {order.packed ? "Packed" : "Mark Packed"}
                              </button>

                              <button
                                type="button"
                                disabled={updatingField === order.id || !!order.cancelled}
                                onClick={() => handleQuickToggle(order, "delivered")}
                                className={`inline-flex rounded-full border-2 border-[#221E19] px-4 py-2 text-sm font-medium transition ${
                                  order.delivered ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                                }`}
                              >
                                {order.delivered ? (order.fulfilment === "delivery" ? "Delivered" : "Collected") : order.fulfilment === "delivery" ? "Mark Delivered" : "Mark Collected"}
                              </button>

                              <button
                                type="button"
                                onClick={() => (selectedOrder?.id === order.id ? setSelectedOrder(null) : handleOpenBooking(order))}
                                className="inline-flex rounded-full border-2 border-[#221E19] bg-transparent px-4 py-2 text-sm font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                              >
                                {selectedOrder?.id === order.id ? "Close" : "Open"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>
              </div>

              <div className="xl:col-span-5">
                <div ref={selectedBookingRef} className="xl:sticky xl:top-6">
                  <SectionCard
                    title="Currently Editing"
                    sub={selectedOrder ? `${selectedOrder.fullName || "Order"} • ${orderReference(selectedOrder.id)}` : "Choose any order from the list to open it here."}
                    highlight={!!selectedOrder}
                  >
                    {!selectedOrder || !editForm ? (
                      <div className="text-sm text-[#221E19]/55">No order selected yet.</div>
                    ) : (
                      <div className="space-y-5">
                        <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FAF6EE] p-4">
                          <DetailRow label="Reference" value={orderReference(selectedOrder.id)} strong />
                          <DetailRow label="Created" value={formatDate(selectedOrder.createdAt)} />
                          <DetailRow label="Order" value={productSummary(selectedOrder)} />
                          <DetailRow label="Fulfilment" value={selectedOrder.fulfilment === "delivery" ? "Delivery" : "Collection"} />
                          <DetailRow label="Delivery area" value={selectedOrder.deliveryArea || "—"} />
                          <DetailRow label="Delivery address" value={selectedOrder.deliveryAddress || "—"} />
                          {isOwner ? <DetailRow label="Total" value={orderAmountLabel(selectedOrder)} /> : null}
                          <DetailRow label="Current Status" value={statusLabel(selectedOrder)} />
                          <DetailRow label="Queue" value={(selectedOrder.queueNumber || 0) > 0 ? `In queue as #${selectedOrder.queueNumber}` : "Not in queue"} />
                        </div>

                        {hasUnsavedChanges ? (
                          <div className="inline-flex rounded-full border-2 border-[#C4872C] bg-[#C4872C]/15 px-4 py-2 text-sm text-[#8a5f1c]">Unsaved changes</div>
                        ) : null}

                        <div className="space-y-4">
                          {[
                            ["Full name", "fullName"],
                            ["Phone", "phone"],
                            ["Email", "email"],
                          ].map(([label, key]) => (
                            <div key={key}>
                              <label className="mb-2 block text-sm font-medium text-[#221E19]/80">{label}</label>
                              <input
                                value={(editForm as any)[key]}
                                onChange={(e) => {
                                  markDirty();
                                  setEditForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));
                                }}
                                className="h-12 w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FFFDF8] px-4 text-sm text-[#221E19] outline-none"
                              />
                            </div>
                          ))}

                          <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FFFDF8] p-4">
                            <div className="mb-4 flex items-center justify-between">
                              <div>
                                <p className="font-medium">Edit product selections</p>
                                <p className="text-sm text-[#221E19]/55">Correct products and quantities here.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  markDirty();
                                  setEditForm((prev) =>
                                    prev ? { ...prev, productRows: [...prev.productRows, { id: slugId(), label: "", quantity: "1", price: "" }] } : prev
                                  );
                                }}
                                className="inline-flex h-10 items-center justify-center rounded-full border-2 border-[#221E19] bg-transparent px-4 text-sm font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                              >
                                Add Row
                              </button>
                            </div>

                            <div className="space-y-3">
                              {editForm.productRows.map((row) => (
                                <div key={row.id} className="grid gap-3 md:grid-cols-[1fr_120px_160px_auto]">
                                  <select
                                    value={row.label}
                                    onChange={(e) => {
                                      markDirty();
                                      setEditForm((prev) =>
                                        prev
                                          ? { ...prev, productRows: prev.productRows.map((item) => (item.id === row.id ? { ...item, label: e.target.value } : item)) }
                                          : prev
                                      );
                                    }}
                                    className="h-12 rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
                                  >
                                    <option value="">Select product</option>
                                    {settings.productOptions.map((option) => (
                                      <option key={option.label} value={option.label}>
                                        {option.label} — {option.isPOA || option.price === null ? "POA" : formatZAR(option.price ?? 0)}
                                        {typeof option.stock === "number" ? ` — ${option.stock} left` : ""}
                                      </option>
                                    ))}
                                  </select>

                                  <input
                                    type="number"
                                    min={1}
                                    value={row.quantity}
                                    onChange={(e) => {
                                      markDirty();
                                      setEditForm((prev) =>
                                        prev
                                          ? { ...prev, productRows: prev.productRows.map((item) => (item.id === row.id ? { ...item, quantity: e.target.value } : item)) }
                                          : prev
                                      );
                                    }}
                                    className="h-12 rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
                                  />

                                  <input
                                    type="number"
                                    min={0}
                                    placeholder="Price if POA"
                                    value={row.price}
                                    onChange={(e) => {
                                      markDirty();
                                      setEditForm((prev) =>
                                        prev
                                          ? { ...prev, productRows: prev.productRows.map((item) => (item.id === row.id ? { ...item, price: e.target.value } : item)) }
                                          : prev
                                      );
                                    }}
                                    className="h-12 rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
                                  />

                                  <button
                                    type="button"
                                    onClick={() => {
                                      markDirty();
                                      setEditForm((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              productRows: prev.productRows.length === 1 ? prev.productRows : prev.productRows.filter((item) => item.id !== row.id),
                                            }
                                          : prev
                                      );
                                    }}
                                    className="inline-flex h-12 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#FAF6EE] px-4 text-sm font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-[10px] border-2 border-[#221E19]/15 bg-[#FFFDF8] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">Fulfilment</p>
                                <p className="text-sm text-[#221E19]/55">Delivery is charged at {formatZAR(DELIVERY_FEE)} flat fee.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  markDirty();
                                  setEditForm((prev) => (prev ? { ...prev, fulfilment: prev.fulfilment === "delivery" ? "collection" : "delivery" } : prev));
                                }}
                                className={`inline-flex h-11 items-center justify-center rounded-full border-2 border-[#221E19] px-5 text-sm font-medium transition ${
                                  editForm.fulfilment === "delivery" ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                                }`}
                              >
                                {editForm.fulfilment === "delivery" ? "Delivery" : "Collection"}
                              </button>
                            </div>

                            {editForm.fulfilment === "delivery" ? (
                              <div className="mt-4 grid gap-4">
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Delivery area</label>
                                  <input
                                    value={editForm.deliveryArea}
                                    onChange={(e) => {
                                      markDirty();
                                      setEditForm((prev) => (prev ? { ...prev, deliveryArea: e.target.value } : prev));
                                    }}
                                    placeholder="Example: Lenasia"
                                    className="h-12 w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 text-sm text-[#221E19] outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Delivery address</label>
                                  <textarea
                                    rows={3}
                                    value={editForm.deliveryAddress}
                                    onChange={(e) => {
                                      markDirty();
                                      setEditForm((prev) => (prev ? { ...prev, deliveryAddress: e.target.value } : prev));
                                    }}
                                    placeholder="Enter the full delivery address"
                                    className="w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FAF6EE] px-4 py-3 text-sm text-[#221E19] outline-none"
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-[#221E19]/80">Notes</label>
                            <textarea
                              rows={3}
                              value={editForm.notes}
                              onChange={(e) => {
                                markDirty();
                                setEditForm((prev) => (prev ? { ...prev, notes: e.target.value } : prev));
                              }}
                              className="w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FFFDF8] px-4 py-3 text-sm text-[#221E19] outline-none"
                            />
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                markDirty();
                                setEditForm((prev) => (prev ? { ...prev, paymentStatus: prev.paymentStatus === "paid" ? "pending" : "paid" } : prev));
                              }}
                              className={`inline-flex h-11 items-center justify-center rounded-full border-2 border-[#221E19] px-5 text-sm font-medium transition ${
                                editForm.paymentStatus === "paid" ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                              }`}
                            >
                              {editForm.paymentStatus === "paid" ? "Marked Paid" : "Marked Unpaid"}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                markDirty();
                                setEditForm((prev) => (prev ? { ...prev, prepared: !prev.prepared } : prev));
                              }}
                              className={`inline-flex h-11 items-center justify-center rounded-full border-2 border-[#221E19] px-5 text-sm font-medium transition ${
                                editForm.prepared ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                              }`}
                            >
                              {editForm.prepared ? "Prepared" : "Not Prepared"}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                markDirty();
                                setEditForm((prev) => (prev ? { ...prev, packed: !prev.packed } : prev));
                              }}
                              className={`inline-flex h-11 items-center justify-center rounded-full border-2 border-[#221E19] px-5 text-sm font-medium transition ${
                                editForm.packed ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                              }`}
                            >
                              {editForm.packed ? "Packed" : "Not Packed"}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                markDirty();
                                setEditForm((prev) => (prev ? { ...prev, delivered: !prev.delivered } : prev));
                              }}
                              className={`inline-flex h-11 items-center justify-center rounded-full border-2 border-[#221E19] px-5 text-sm font-medium transition ${
                                editForm.delivered ? "bg-[#C4872C] text-[#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                              }`}
                            >
                              {editForm.delivered ? (editForm.fulfilment === "delivery" ? "Delivered" : "Collected") : "Awaiting Delivery/Collection"}
                            </button>
                          </div>

                          <div className="rounded-[10px] border-2 border-[#A93E2E] bg-[#A93E2E]/10 p-4">
                            <button
                              type="button"
                              onClick={() => {
                                markDirty();
                                setEditForm((prev) => (prev ? { ...prev, cancelled: !prev.cancelled } : prev));
                              }}
                              className={`inline-flex h-11 items-center justify-center rounded-full border-2 border-[#221E19] px-5 text-sm font-medium transition ${
                                editForm.cancelled ? "bg-[#A93E2E] text-[#FAF6EE]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.04]"
                              }`}
                            >
                              {editForm.cancelled ? "Order Cancelled" : "Cancel Order"}
                            </button>

                            {editForm.cancelled ? (
                              <div className="mt-4 space-y-3">
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-[#221E19]/90">Cancellation reason</label>
                                  <textarea
                                    rows={3}
                                    value={editForm.cancelReason}
                                    onChange={(e) => {
                                      markDirty();
                                      setEditForm((prev) => (prev ? { ...prev, cancelReason: e.target.value } : prev));
                                    }}
                                    className="w-full rounded-[8px] border-2 border-[#221E19]/15 bg-[#FFFDF8] px-4 py-3 text-sm text-[#221E19] outline-none"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openWhatsAppForOrder(selectedOrder, buildCancellationMessage(selectedOrder, editForm.cancelReason))}
                                  className="inline-flex h-10 items-center justify-center rounded-full border-2 border-[#221E19] bg-transparent px-4 text-sm font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                                >
                                  Notify Customer via WhatsApp
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={savingEdit}
                              onClick={saveEditForm}
                              className="inline-flex h-12 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#C4872C] px-6 text-sm font-semibold text-[#221E19] shadow-[3px_3px_0_0_#221E19] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
                            >
                              {savingEdit ? "Saving..." : "Save Order Changes"}
                            </button>
                            <button
                              type="button"
                              onClick={() => openWhatsAppForOrder(selectedOrder, buildPaymentReminderMessage(selectedOrder, settings))}
                              className="inline-flex h-12 items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-transparent px-6 text-sm font-medium transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                            >
                              WhatsApp Reminder
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </SectionCard>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}