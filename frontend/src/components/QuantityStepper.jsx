import { Minus, Plus } from "lucide-react";

export default function QuantityStepper({ value, onChange, min = 1, max = 99 }) {
  return (
    <div className="stepper">
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus size={15} />
      </button>
      <span>{value}</span>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
