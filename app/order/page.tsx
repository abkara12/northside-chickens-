"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

/* =====================================================================
   Shared design tokens — see app/page.tsx for the full system.
   Kept identical here so the order flow feels like one product.
   ===================================================================== */
const FONT_DISPLAY = "font-['Fraunces',_serif]";
const FONT_MONO = "font-['IBM_Plex_Mono',_monospace]";

const INK = "#221E19";
const PAPER = "#FAF6EE";
const CARD = "#FFFDF8";
const LINE = "#E4D9C4";
const GOLD = "#C4872C";
const RUST = "#A93E2E";
const SAGE = "#6E7A55";

const DELIVERY_FEE = 60;

type Fulfilment = "collection" | "delivery";

type ProductOption = {
  label: string;
  price: number | null;
  stock?: number | null;
  isPOA?: boolean;
  unit?: string;
};

type ProductSelectionRow = {
  id: string;
  productLabel: string;
  quantity: string;
};

type ProductBreakdownItem = {
  id: string;
  label: string;
  price: number | null;
  isPOA: boolean;
  quantity: number;
  subtotal: number;
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
  productOptions: ProductOption[];
};

type FormData = {
  fullName: string;
  phone: string;
  email: string;
  productSelections: ProductSelectionRow[];
  fulfilment: Fulfilment;
  deliveryArea: string;
  deliveryAddress: string;
  notes: string;
  agree: boolean;
};

type Errors = {
  fullName?: string;
  phone?: string;
  email?: string;
  productSelections?: string;
  deliveryArea?: string;
  deliveryAddress?: string;
  notes?: string;
  agree?: string;
};

type ProductOptionDisplay = {
  rawValue: string;
  displayLabel: string;
  disabled: boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  ordersOpen: true,
  orderCutoffDate: "",
  accountName: "Northside Chickens",
  bankName: "REPLACE WITH BANK NAME",
  accountNumber: "REPLACE WITH ACCOUNT NUMBER",
  accountType: "Business Cheque",
  branchCode: "REPLACE WITH BRANCH CODE",
  referenceHint:
    "Please send your proof of payment / reference to Northside Chickens on WhatsApp.",
  reminderMessageIntro:
    "Hi, this is a kind reminder regarding your Northside Chickens order.",
  productOptions: [
    { label: "Whole Chicken (Skinless)", price: 75, stock: 40, unit: "bird" },
    { label: "Whole Chicken (Skin On)", price: 65, stock: 60, unit: "pack" },
    { label: "9pc Cut & Washed Chickens", price: 82, stock: 60, unit: "pack" },
    { label: "5pc Cut & Washed Chickens", price: 82, stock: 60, unit: "pack" },
    { label: "Drumsticks", price: 89, stock: 60, unit: "pack" },
    { label: "Leg Quarters", price: 79, stock: 60, unit: "pack" },
    { label: "Whole Fillets", price: 83, stock: 60, unit: "pack" },
    { label: "Cubed Fillets", price: 85, stock: 60, unit: "pack" },
    { label: "Stripped Fillets", price: 85, stock: 60, unit: "pack" },
    { label: "Wings (Skin on)", price: 83, stock: 60, unit: "pack" },
    { label: "Mince", price: 80, stock: 60, unit: "pack" },
    { label: "Thighs", price: 71, stock: 60, unit: "pack" },
  ],
};

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createInitialForm(): FormData {
  return {
    fullName: "",
    phone: "",
    email: "",
    productSelections: [{ id: makeId(), productLabel: "", quantity: "1" }],
    fulfilment: "collection",
    deliveryArea: "",
    deliveryAddress: "",
    notes: "",
    agree: false,
  };
}

function formatZAR(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatProductPrice(option: ProductOption) {
  return option.isPOA || option.price === null ? "POA" : formatZAR(option.price);
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isOrdersClosed(settings: AppSettings) {
  if (!settings.ordersOpen) return true;
  if (!settings.orderCutoffDate) return false;
  return settings.orderCutoffDate < getTodayDateString();
}

/* ---------------- Shared field primitives (paper theme) ---------------- */
function Label({
  htmlFor,
  children,
  required = false,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-[#221E19]/80">
      {children}
      {required ? <span className="ml-1 text-[#A93E2E]">*</span> : null}
    </label>
  );
}

function Input({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  error,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  min?: number;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <input
        id={id}
        type={type}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`h-12 w-full rounded-[8px] border-2 bg-[#FFFDF8] px-4 text-sm text-[#221E19] outline-none transition placeholder:text-[#221E19]/30 disabled:cursor-not-allowed disabled:opacity-60 ${
          error ? "border-[#A93E2E]" : "border-[#221E19]/15 focus:border-[#221E19]"
        }`}
      />
      {error ? <p className="mt-2 text-xs text-[#A93E2E]">{error}</p> : null}
    </div>
  );
}

function TextArea({
  id,
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
  rows = 5,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={`w-full rounded-[8px] border-2 bg-[#FFFDF8] px-4 py-3 text-sm text-[#221E19] outline-none transition placeholder:text-[#221E19]/30 disabled:cursor-not-allowed disabled:opacity-60 ${
          error ? "border-[#A93E2E]" : "border-[#221E19]/15 focus:border-[#221E19]"
        }`}
      />
      {error ? <p className="mt-2 text-xs text-[#A93E2E]">{error}</p> : null}
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-[#E4D9C4] py-3 last:border-b-0">
      <span className={`text-sm ${strong ? "text-[#221E19]/80" : "text-[#221E19]/45"}`}>{label}</span>
      <span className={`${FONT_MONO} text-right text-sm ${strong ? "font-bold text-[#A93E2E]" : "font-medium text-[#221E19]"}`}>
        {value || "—"}
      </span>
    </div>
  );
}

function StockPill({ stockLeft, isSoldOut }: { stockLeft: number | null; isSoldOut: boolean }) {
  if (stockLeft === null) {
    return (
      <span className={`${FONT_MONO} inline-flex rounded-full border-2 border-[#221E19]/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#221E19]/60`}>
        Stock open
      </span>
    );
  }
  return (
    <span
      className={`${FONT_MONO} inline-flex rounded-full border-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
        isSoldOut ? "border-[#A93E2E] bg-[#A93E2E]/10 text-[#A93E2E]" : "border-[#6E7A55] bg-[#6E7A55]/10 text-[#6E7A55]"
      }`}
    >
      {isSoldOut ? "Sold out" : `${stockLeft} left`}
    </span>
  );
}

function ProductRowCard({
  index,
  row,
  onProductChange,
  onQuantityChange,
  onRemove,
  canRemove,
  error,
  options,
  stockLeft,
  disabled = false,
}: {
  index: number;
  row: ProductSelectionRow;
  onProductChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  error?: string;
  options: ProductOptionDisplay[];
  stockLeft: number | null;
  disabled?: boolean;
}) {
  const selectedSoldOut = stockLeft !== null && stockLeft <= 0;

  return (
    <div className="relative rounded-[10px] border-2 border-[#221E19] bg-[#FFFDF8] p-4 shadow-[3px_3px_0_0_#221E19]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className={`${FONT_DISPLAY} text-sm font-semibold`}>Item {index + 1}</p>
          <p className="mt-1 text-xs text-[#221E19]/45">Choose a product and quantity.</p>
        </div>
        <div className="flex items-center gap-2">
          {row.productLabel ? <StockPill stockLeft={stockLeft} isSoldOut={selectedSoldOut} /> : null}
          {canRemove ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              className="inline-flex h-9 items-center justify-center rounded-full border-2 border-[#221E19] bg-[#FAF6EE] px-4 text-xs font-medium text-[#221E19] transition hover:bg-[#221E19] hover:text-[#FAF6EE] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`product-${row.id}`} required>
            Product
          </Label>
          <select
            id={`product-${row.id}`}
            value={row.productLabel}
            onChange={(e) => onProductChange(e.target.value)}
            disabled={disabled}
            className={`h-12 w-full rounded-[8px] border-2 bg-[#FFFDF8] px-4 text-sm text-[#221E19] outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${
              error ? "border-[#A93E2E]" : "border-[#221E19]/15 focus:border-[#221E19]"
            }`}
          >
            <option value="" disabled>
              Select a product
            </option>
            {options.map((option) => (
              <option key={option.rawValue} value={option.rawValue} disabled={option.disabled}>
                {option.displayLabel}
              </option>
            ))}
          </select>
          {error ? <p className="mt-2 text-xs text-[#A93E2E]">{error}</p> : null}
        </div>

        <div>
          <Label htmlFor={`quantity-${row.id}`} required>
            Quantity
          </Label>
          <Input
            id={`quantity-${row.id}`}
            type="number"
            min={1}
            value={row.quantity}
            onChange={onQuantityChange}
            placeholder="Enter quantity"
            error={error}
            disabled={disabled}
          />
        </div>
      </div>

      {row.productLabel && stockLeft !== null && stockLeft >= 0 ? (
        <p className="mt-3 text-xs text-[#221E19]/45">
          {selectedSoldOut ? "This item is currently sold out." : `${stockLeft} still available.`}
        </p>
      ) : null}
    </div>
  );
}

function FulfilmentCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[10px] border-2 border-[#221E19] p-5 text-left transition ${
        active ? "bg-[#C4872C]/20 shadow-[4px_4px_0_0_#221E19]" : "bg-[#FFFDF8] hover:bg-[#221E19]/[0.03]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`${FONT_DISPLAY} text-base font-semibold`}>{title}</p>
          <p className="mt-2 text-sm leading-6 text-[#221E19]/60">{description}</p>
        </div>
        <div
          className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[11px] ${
            active ? "border-[#221E19] bg-[#221E19] text-[#FAF6EE]" : "border-[#221E19]/25 text-transparent"
          }`}
        >
          ✓
        </div>
      </div>
    </button>
  );
}

function PrimaryButton({
  children,
  className = "",
  ...props
}: { children: ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex h-[46px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#C4872C] px-7 text-[14px] font-semibold text-[#221E19] shadow-[4px_4px_0_0_#221E19] transition active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 sm:text-[15px] ${className}`}
    >
      {children}
    </button>
  );
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-[42px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-transparent px-6 text-[13px] font-semibold text-[#221E19] transition hover:bg-[#221E19] hover:text-[#FAF6EE] sm:text-[14px]"
    >
      {children}
    </Link>
  );
}

export default function OrderPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [form, setForm] = useState<FormData>(createInitialForm);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "poultry"),
      (snap) => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<AppSettings>) });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
        setSettingsLoaded(true);
      },
      (error) => {
        console.error("Settings load failed:", error);
        setSettings(DEFAULT_SETTINGS);
        setSettingsLoaded(true);
      }
    );
    return () => unsub();
  }, []);

  const ordersClosed = isOrdersClosed(settings);

  const parsedSelections = useMemo(() => {
    return form.productSelections.map((row) => {
      const selectedOption =
        settings.productOptions.find((option) => option.label === row.productLabel) || null;

      const quantity = Math.max(0, Number(row.quantity) || 0);
      const isPOA = Boolean(selectedOption?.isPOA || selectedOption?.price === null);
      const price = isPOA ? null : selectedOption?.price ?? 0;
      const subtotal = isPOA ? 0 : (selectedOption?.price ?? 0) * quantity;

      return { ...row, quantityNumber: quantity, selectedOption, price, isPOA, subtotal };
    });
  }, [form.productSelections, settings.productOptions]);

  function getCurrentFormQuantityForLabel(label: string, excludingRowId?: string) {
    return parsedSelections.reduce((sum, row) => {
      if (excludingRowId && row.id === excludingRowId) return sum;
      if (row.selectedOption?.label !== label) return sum;
      return sum + row.quantityNumber;
    }, 0);
  }

  function getStockLeftForLabel(label: string, excludingRowId?: string) {
    const option = settings.productOptions.find((item) => item.label === label);
    const configuredStock =
      typeof option?.stock === "number" && Number.isFinite(option.stock) ? Math.max(0, option.stock) : null;
    if (configuredStock === null) return null;
    const inFormElsewhere = getCurrentFormQuantityForLabel(label, excludingRowId);
    return Math.max(0, configuredStock - inFormElsewhere);
  }

  const productSelectOptionsByRow = useMemo(() => {
    const map: Record<string, ProductOptionDisplay[]> = {};

    form.productSelections.forEach((row) => {
      map[row.id] = settings.productOptions.map((option) => {
        const stockLeft = getStockLeftForLabel(option.label, row.id);
        const soldOut = stockLeft !== null && stockLeft <= 0 && row.productLabel !== option.label;

        return {
          rawValue: option.label,
          displayLabel:
            stockLeft === null
              ? `${option.label} — ${formatProductPrice(option)}`
              : soldOut
              ? `${option.label} — ${formatProductPrice(option)} — Sold Out`
              : `${option.label} — ${formatProductPrice(option)} — ${stockLeft} left`,
          disabled: soldOut,
        };
      });
    });

    return map;
  }, [form.productSelections, settings.productOptions, parsedSelections]);

  const totalQuantity = parsedSelections.reduce((sum, row) => sum + row.quantityNumber, 0);

  const productBreakdown: ProductBreakdownItem[] = parsedSelections
    .filter((row) => row.selectedOption && row.quantityNumber > 0)
    .map((row) => ({
      id: row.id,
      label: row.selectedOption!.label,
      price: row.isPOA ? null : row.selectedOption!.price,
      isPOA: row.isPOA,
      quantity: row.quantityNumber,
      subtotal: row.subtotal,
    }));

  const basePriceTotal = productBreakdown.reduce((sum, row) => sum + row.subtotal, 0);
  const hasPOASelection = productBreakdown.some((row) => row.isPOA);

  const deliveryTotal = form.fulfilment === "delivery" ? DELIVERY_FEE : 0;
  const totalPrice = basePriceTotal + deliveryTotal;
  const pricingVisible = totalPrice > 0 && !hasPOASelection;

  const legacyProductSummary = productBreakdown.map((row) => `${row.label} x${row.quantity}`).join(", ");

  const filledCount = useMemo(() => {
    let count = 0;
    if (form.fullName.trim()) count += 1;
    if (form.phone.trim()) count += 1;
    if (productBreakdown.length > 0) count += 1;
    if (form.fulfilment === "collection" || (form.deliveryArea.trim() && form.deliveryAddress.trim())) {
      count += 1;
    }
    if (form.agree) count += 1;
    return count;
  }, [form.fullName, form.phone, form.fulfilment, form.deliveryArea, form.deliveryAddress, form.agree, productBreakdown.length]);

  const progress = Math.round((filledCount / 5) * 100);

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function updateProductRow(id: string, patch: Partial<ProductSelectionRow>) {
    setForm((prev) => ({
      ...prev,
      productSelections: prev.productSelections.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
    setErrors((prev) => ({ ...prev, productSelections: undefined }));
  }

  function addProductRow() {
    setForm((prev) => ({
      ...prev,
      productSelections: [...prev.productSelections, { id: makeId(), productLabel: "", quantity: "1" }],
    }));
  }

  function removeProductRow(id: string) {
    setForm((prev) => ({
      ...prev,
      productSelections: prev.productSelections.filter((row) => row.id !== id),
    }));
    setErrors((prev) => ({ ...prev, productSelections: undefined }));
  }

  function setFulfilment(value: Fulfilment) {
    setForm((prev) => ({
      ...prev,
      fulfilment: value,
      deliveryArea: value === "delivery" ? prev.deliveryArea : "",
      deliveryAddress: value === "delivery" ? prev.deliveryAddress : "",
    }));
    setErrors((prev) => ({ ...prev, deliveryArea: undefined, deliveryAddress: undefined }));
  }

  function validate() {
    const nextErrors: Errors = {};

    if (!form.fullName.trim()) nextErrors.fullName = "Please enter your full name.";
    if (!form.phone.trim()) nextErrors.phone = "Please enter your phone number.";

    if (form.fulfilment === "delivery") {
      if (!form.deliveryArea.trim()) nextErrors.deliveryArea = "Please enter the delivery area.";
      if (!form.deliveryAddress.trim()) nextErrors.deliveryAddress = "Please enter the full delivery address.";
    }

    const hasValidSelections =
      form.productSelections.length > 0 &&
      form.productSelections.every((row) => {
        const qty = Number(row.quantity);
        return row.productLabel && Number.isInteger(qty) && qty >= 1;
      });

    if (!hasValidSelections) {
      nextErrors.productSelections = "Please complete each item with a product and a valid quantity.";
    } else {
      const invalidStock = parsedSelections.some((row) => {
        if (!row.selectedOption) return true;
        const stockLeft = getStockLeftForLabel(row.selectedOption.label, row.id);
        return stockLeft !== null && row.quantityNumber > stockLeft;
      });
      if (invalidStock) {
        nextErrors.productSelections = "One or more selected products do not have enough stock available.";
      }
    }

    if (!form.agree) nextErrors.agree = "Please confirm before submitting.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");

    if (ordersClosed) {
      setSubmitError("Orders are currently closed.");
      return;
    }

    if (!validate()) return;

    try {
      setSubmitting(true);

      const settingsRef = doc(db, "settings", "poultry");
      const newOrderRef = doc(collection(db, "orders"));
      let savedOrderId = "";

      await runTransaction(db, async (transaction) => {
        const settingsSnap = await transaction.get(settingsRef);
        const liveSettings = settingsSnap.exists()
          ? ({ ...DEFAULT_SETTINGS, ...(settingsSnap.data() as Partial<AppSettings>) } as AppSettings)
          : DEFAULT_SETTINGS;

        const requestedByLabel = new Map<string, number>();
        for (const row of productBreakdown) {
          requestedByLabel.set(row.label, (requestedByLabel.get(row.label) || 0) + row.quantity);
        }

        const updatedProductOptions = liveSettings.productOptions.map((option) => {
          const requested = requestedByLabel.get(option.label) || 0;
          if (requested === 0) return option;

          const currentStock =
            typeof option.stock === "number" && Number.isFinite(option.stock) ? option.stock : null;

          if (currentStock === null) {
            throw new Error(`Stock has not been set for ${option.label}. Please ask staff to set stock first.`);
          }
          if (requested > currentStock) {
            throw new Error(`${option.label} only has ${currentStock} left. Please reduce your quantity.`);
          }

          return { ...option, stock: currentStock - requested };
        });

        // Use set + merge instead of update: if settings/poultry hasn't been
        // created yet (e.g. no one has opened the admin dashboard), update()
        // would throw "Can't update a document that doesn't exist." set()
        // with merge works whether the doc exists or not.
        transaction.set(
          settingsRef,
          {
            ...liveSettings,
            productOptions: updatedProductOptions,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        transaction.set(newOrderRef, {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),

          quantity: totalQuantity,
          productSummary: legacyProductSummary,
          productBreakdown,

          fulfilment: form.fulfilment,
          delivery: form.fulfilment === "delivery",
          deliveryArea: form.fulfilment === "delivery" ? form.deliveryArea.trim() : "",
          deliveryAddress: form.fulfilment === "delivery" ? form.deliveryAddress.trim() : "",

          basePriceTotal,
          deliveryTotal,
          totalPrice,
          pricingVisible,
          pricingFinalized: pricingVisible,

          notes: form.notes.trim(),

          paymentStatus: "pending",
          prepared: false,
          packed: false,
          delivered: false,
          cancelled: false,
          cancelReason: "",
          queueNumber: null,
          manualEntry: false,
          orderYear: new Date().getFullYear(),

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        savedOrderId = newOrderRef.id;
      });

      const savedOrderReference = `NP-${savedOrderId.slice(0, 8).toUpperCase()}`;

      if (typeof window !== "undefined") {
        localStorage.setItem("poultry_last_order_id", savedOrderId);
        localStorage.setItem("poultry_last_order_reference", savedOrderReference);
      }

      window.location.replace(`/order/success/${savedOrderId}`);
    } catch (error) {
      console.error("Error saving order:", error);
      setSubmitError(
        error instanceof Error ? error.message : "Something went wrong while saving the order. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const readyToRender = settingsLoaded;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#FAF6EE] font-['Work_Sans',sans-serif] text-[#221E19]">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Work+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"
        rel="stylesheet"
      />

      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.035] bg-[radial-gradient(#221E19_1px,transparent_1px)] bg-[size:18px_18px]" />

      <header className="mx-auto flex max-w-7xl items-center justify-between border-b-2 border-[#221E19] px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-[#221E19] bg-[#FFFDF8]">
            <Image src="/logo4.png" alt="Northside Chickens" width={90} height={90} className="object-contain rounded-full" priority />
          </div>
          <div className="hidden sm:block">
            <div className={`${FONT_DISPLAY} text-lg font-semibold leading-none`}>Northside Chickens</div>
          </div>
        </Link>

        <SecondaryLink href="/">Back Home</SecondaryLink>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-16 pt-8 sm:px-10 lg:pb-24">
        {!readyToRender ? (
          <div className="rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-8 text-center shadow-[6px_6px_0_0_#221E19]">
            <p className={`${FONT_MONO} text-sm uppercase tracking-[0.24em] text-[#A93E2E]`}>Loading</p>
            <h1 className={`${FONT_DISPLAY} mt-4 text-[2rem] font-semibold sm:text-[2.4rem]`}>
              Preparing the order form
            </h1>
          </div>
        ) : ordersClosed ? (
          <div className="rounded-[16px] border-2 border-[#221E19] bg-[#C4872C]/15 p-8 text-center shadow-[6px_6px_0_0_#221E19]">
            <p className={`${FONT_MONO} text-sm uppercase tracking-[0.24em] text-[#A93E2E]`}>Orders Closed</p>
            <h1 className={`${FONT_DISPLAY} mt-4 text-[2rem] font-semibold sm:text-[2.4rem]`}>
              Orders are currently closed
            </h1>
            <p className="mt-4 text-[#221E19]/70">Please contact the team directly if you need assistance.</p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/"
                className="inline-flex h-[44px] min-w-[190px] items-center justify-center rounded-[8px] border-2 border-[#221E19] bg-[#C4872C] px-6 text-[14px] font-semibold text-[#221E19] shadow-[4px_4px_0_0_#221E19]"
              >
                Back Home
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <div className="mx-auto flex w-fit items-center gap-2 rounded-full border-[2.5px] border-[#A93E2E] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A93E2E] lg:mx-0">
                Place Order
              </div>

              <h1 className={`${FONT_DISPLAY} mt-5 text-center text-[2.15rem] font-semibold leading-[1.08] tracking-tight sm:text-[2.7rem] lg:text-left lg:text-[3.4rem]`}>
                Fresh chicken, handled properly.
                <span className="mt-1 block">From order to collection.</span>
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-center text-[0.98rem] leading-7 text-[#221E19]/68 sm:text-[1.03rem] sm:leading-8 lg:mx-0 lg:text-left">
                Choose whole chicken or cut portions, in whatever quantity you need,
                and pick collection or delivery.
              </p>

              <form
                onSubmit={handleSubmit}
                noValidate
                className="mt-8 rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] p-5 shadow-[6px_6px_0_0_#221E19] sm:p-7"
              >
                <div className="grid gap-8">
                  {/* PRODUCTS */}
                  <div>
                    <div className="mb-5 text-center lg:text-left">
                      <p className={`${FONT_MONO} text-[11px] uppercase tracking-[0.22em] text-[#A93E2E]`}>
                        Products
                      </p>
                      <h2 className={`${FONT_DISPLAY} mt-2 text-[1.45rem] font-semibold`}>
                        What would you like to order?
                      </h2>
                    </div>

                    <div className="mb-4 rounded-[10px] border-2 border-dashed border-[#E4D9C4] p-4">
                      <p className="text-sm text-[#221E19]/70">
                        Available stock is shown for each product. Sold-out items can't be selected.
                      </p>
                    </div>

                    <div className="grid gap-4">
                      {form.productSelections.map((row, index) => {
                        const currentStockLeft = row.productLabel
                          ? getStockLeftForLabel(row.productLabel, row.id)
                          : null;

                        return (
                          <ProductRowCard
                            key={row.id}
                            index={index}
                            row={row}
                            onProductChange={(value) => updateProductRow(row.id, { productLabel: value })}
                            onQuantityChange={(value) => updateProductRow(row.id, { quantity: value })}
                            onRemove={() => removeProductRow(row.id)}
                            canRemove={form.productSelections.length > 1}
                            error={errors.productSelections}
                            options={productSelectOptionsByRow[row.id] || []}
                            stockLeft={currentStockLeft}
                          />
                        );
                      })}
                    </div>

                    {errors.productSelections ? (
                      <p className="mt-3 text-xs text-[#A93E2E]">{errors.productSelections}</p>
                    ) : null}

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={addProductRow}
                        className="inline-flex h-11 items-center justify-center rounded-full border-2 border-[#221E19] bg-[#FAF6EE] px-5 text-sm font-medium text-[#221E19] transition hover:bg-[#221E19] hover:text-[#FAF6EE]"
                      >
                        Add another product
                      </button>
                    </div>
                  </div>

                  <div className="h-px bg-[#E4D9C4]" />

                  {/* CUSTOMER DETAILS */}
                  <div>
                    <div className="mb-5 text-center lg:text-left">
                      <p className={`${FONT_MONO} text-[11px] uppercase tracking-[0.22em] text-[#A93E2E]`}>
                        Customer details
                      </p>
                      <h2 className={`${FONT_DISPLAY} mt-2 text-[1.45rem] font-semibold`}>Your information</h2>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Label htmlFor="fullName" required>
                          Full name
                        </Label>
                        <Input
                          id="fullName"
                          value={form.fullName}
                          onChange={(value) => updateField("fullName", value)}
                          placeholder="Enter your full name"
                          error={errors.fullName}
                        />
                      </div>

                      <div>
                        <Label htmlFor="phone" required>
                          Phone number
                        </Label>
                        <Input
                          id="phone"
                          value={form.phone}
                          onChange={(value) => updateField("phone", value)}
                          placeholder="Enter your phone number"
                          error={errors.phone}
                        />
                      </div>

                      <div>
                        <Label htmlFor="email">
                          Email address <span className="text-[#221E19]/35">(optional)</span>
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={form.email}
                          onChange={(value) => updateField("email", value)}
                          placeholder="Enter your email address"
                          error={errors.email}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-[#E4D9C4]" />

                  {/* FULFILMENT */}
                  <div>
                    <div className="mb-5 text-center lg:text-left">
                      <p className={`${FONT_MONO} text-[11px] uppercase tracking-[0.22em] text-[#A93E2E]`}>
                        Fulfilment
                      </p>
                      <h2 className={`${FONT_DISPLAY} mt-2 text-[1.45rem] font-semibold`}>
                        Collection or delivery?
                      </h2>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FulfilmentCard
                        active={form.fulfilment === "collection"}
                        title="Collection"
                        description="Collect your order directly, ready and packed for pickup."
                        onClick={() => setFulfilment("collection")}
                      />
                      <FulfilmentCard
                        active={form.fulfilment === "delivery"}
                        title="Delivery"
                        description={`Delivered to your address for a flat fee of ${formatZAR(DELIVERY_FEE)}.`}
                        onClick={() => setFulfilment("delivery")}
                      />
                    </div>

                    {form.fulfilment === "delivery" ? (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="deliveryArea" required>
                            Delivery area
                          </Label>
                          <Input
                            id="deliveryArea"
                            value={form.deliveryArea}
                            onChange={(value) => updateField("deliveryArea", value)}
                            placeholder="Example: Lenasia"
                            error={errors.deliveryArea}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label htmlFor="deliveryAddress" required>
                            Full delivery address
                          </Label>
                          <TextArea
                            id="deliveryAddress"
                            value={form.deliveryAddress}
                            onChange={(value) => updateField("deliveryAddress", value)}
                            placeholder="Enter the full address for delivery"
                            error={errors.deliveryAddress}
                            rows={4}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-5">
                      <Label htmlFor="notes">
                        Additional notes <span className="text-[#221E19]/35">(optional)</span>
                      </Label>
                      <TextArea
                        id="notes"
                        value={form.notes}
                        onChange={(value) => updateField("notes", value)}
                        placeholder="Add any additional notes or special requests"
                        error={errors.notes}
                      />
                    </div>
                  </div>

                  {/* AGREE */}
                  <div>
                    <label className="flex items-start gap-3 rounded-[10px] border-2 border-[#221E19] bg-[#FAF6EE] p-4">
                      <input
                        type="checkbox"
                        checked={form.agree}
                        onChange={(e) => updateField("agree", e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-[#221E19]/30 accent-[#C4872C]"
                      />
                      <p className="text-sm text-[#221E19]/80">
                        I confirm that the information provided above is correct.
                      </p>
                    </label>
                    {errors.agree ? <p className="mt-2 text-center text-xs text-[#A93E2E] lg:text-left">{errors.agree}</p> : null}
                  </div>

                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                    <SecondaryLink href="/">Back Home</SecondaryLink>
                    <PrimaryButton type="submit" disabled={submitting} className="min-w-[190px]">
                      {submitting ? "Submitting..." : "Submit Order"}
                    </PrimaryButton>
                  </div>

                  {submitError ? (
                    <div className="rounded-[10px] border-2 border-[#A93E2E] bg-[#A93E2E]/10 p-5">
                      <p className="text-center text-sm font-semibold text-[#A93E2E] lg:text-left">
                        Could not save order
                      </p>
                      <p className="mt-1 text-center text-sm leading-6 text-[#221E19]/70 lg:text-left">
                        {submitError}
                      </p>
                    </div>
                  ) : null}
                </div>
              </form>
            </div>

            {/* SUMMARY / TICKET */}
            <div className="xl:col-span-5">
              <div className="space-y-6 xl:sticky xl:top-6">
                <div className="overflow-hidden rounded-[16px] border-2 border-[#221E19] bg-[#FFFDF8] shadow-[6px_6px_0_0_#221E19]">
                  <div className="border-b-2 border-dashed border-[#E4D9C4] p-6">
                    <p className={`${FONT_MONO} text-center text-[11px] uppercase tracking-[0.22em] text-[#A93E2E] lg:text-left`}>
                      Order ticket
                    </p>
                    <h2 className={`${FONT_DISPLAY} mt-2 text-center text-[1.6rem] font-semibold lg:text-left`}>
                      Review your order
                    </h2>
                  </div>

                  <div className="px-6 py-2">
                    <SummaryRow label="Full name" value={form.fullName} />
                    <SummaryRow label="Phone" value={form.phone} />

                    <div className="border-b border-dashed border-[#E4D9C4] py-3">
                      <div className="mb-2 text-sm text-[#221E19]/45">Items</div>
                      {productBreakdown.length ? (
                        <div className="space-y-2">
                          {productBreakdown.map((row) => (
                            <div key={row.id} className="flex items-start justify-between gap-4 text-sm">
                              <div>
                                <span className="text-[#221E19]">
                                  {row.quantity} × {row.label}
                                </span>
                                <div className="mt-1 text-xs text-[#221E19]/45">
                                  {(() => {
                                    const stockLeft = getStockLeftForLabel(row.label, row.id);
                                    return stockLeft === null ? "Stock open" : `${stockLeft} left after this`;
                                  })()}
                                </div>
                              </div>
                              <span className={`${FONT_MONO} font-medium text-[#221E19]`}>
                                {row.isPOA ? "POA" : formatZAR(row.subtotal)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={`${FONT_MONO} text-sm font-medium text-[#221E19]`}>—</div>
                      )}
                    </div>

                    <SummaryRow label="Fulfilment" value={form.fulfilment === "delivery" ? "Delivery" : "Collection"} />
                    <SummaryRow label="Delivery area" value={form.fulfilment === "delivery" ? form.deliveryArea : "Collection"} />
                    <SummaryRow label="Delivery address" value={form.fulfilment === "delivery" ? form.deliveryAddress : "Collection"} />
                  </div>

                  <div className="m-6 mt-2 rounded-[10px] border-2 border-dashed border-[#221E19]/25 p-5">
                    <SummaryRow label="Total items" value={totalQuantity ? String(totalQuantity) : "—"} />
                    <SummaryRow label="Products total" value={basePriceTotal ? formatZAR(basePriceTotal) : "—"} />
                    <SummaryRow label="Delivery fee" value={deliveryTotal ? formatZAR(deliveryTotal) : "—"} />
                    <SummaryRow
                      label="Total due"
                      value={hasPOASelection ? "POA" : pricingVisible ? formatZAR(totalPrice) : "To be confirmed"}
                      strong
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}