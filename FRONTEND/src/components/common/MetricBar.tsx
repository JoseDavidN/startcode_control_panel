import { barGradient } from '@utils/metrics';

export const MetricBar = ({
  label, value, suffix = '%', compact = false,
}: {
  label: string;
  value: number;
  suffix?: string;
  /** Variante para filas densas: etiqueta pequeña y pista más fina. */
  compact?: boolean;
}) => (
  <div>
    <div className={`flex items-center justify-between ${compact ? 'mb-1' : 'mb-1.5'}`}>
      <span className={`${compact ? 'text-xs' : 'text-sm'} text-white/55`}>{label}</span>
      <span className={`${compact ? 'text-xs' : 'text-sm'} font-mono font-semibold text-white tabular-nums`}>
        {Math.round(value)}{suffix}
      </span>
    </div>
    <div className={`${compact ? 'h-1' : 'h-1.5'} rounded-full bg-white/[0.06] overflow-hidden`}>
      <div
        className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${barGradient(value)}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  </div>
);
