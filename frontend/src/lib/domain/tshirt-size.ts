export const TSHIRT_SIZE_SAVE_LIMIT = 2;

export const TSHIRT_SIZES = [
  { id: "S", label: "S", chest: "36–38" },
  { id: "M", label: "M", chest: "38–40" },
  { id: "L", label: "L", chest: "40–42" },
  { id: "XL", label: "XL", chest: "42–44" },
  { id: "XXL", label: "XXL", chest: "44–46" },
] as const;

export type TshirtSizeId = (typeof TSHIRT_SIZES)[number]["id"];

export function normalizeTshirtSize(value: unknown): TshirtSizeId | null {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  return TSHIRT_SIZES.some((size) => size.id === raw) ? (raw as TshirtSizeId) : null;
}

export function tshirtSizeChoiceLabel(id: string | null | undefined) {
  const size = TSHIRT_SIZES.find((row) => row.id === id);
  return size ? `${size.label}  ${size.chest}` : "Not set";
}
