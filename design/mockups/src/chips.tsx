type ChipAmountProps = {
  value: number;
  sign?: "plus" | "minus";
  className?: string;
};

export const formatNumberVi = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(Math.abs(value));

export const formatChipText = (value: number, sign: "" | "+" | "-" = "") =>
  `${sign}${formatNumberVi(value)} chip`;

export function ChipIcon() {
  return (
    <span className="poker-chip-icon" aria-hidden="true">
      <i />
    </span>
  );
}

export function ChipAmount({ value, sign, className = "" }: ChipAmountProps) {
  const prefix = sign === "plus" ? "+" : sign === "minus" ? "−" : "";
  return (
    <span
      className={`chip-amount ${className}`.trim()}
      aria-label={`${prefix}${formatNumberVi(value)} chip`}
    >
      <ChipIcon />
      <b>
        {prefix}
        {formatNumberVi(value)}
      </b>
    </span>
  );
}
