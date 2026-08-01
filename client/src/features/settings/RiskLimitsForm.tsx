import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { queryKeys } from '../../lib/queryKeys';
import { ApiError } from '../../lib/api';
import { fetchRiskLimits, updateRiskLimits } from '../risk/api';

/** Mirrors server/src/schemas/risk.ts's UpdateRiskLimitsSchema bounds exactly. */
const BOUNDS = {
  maxPositionSize: { min: 0, max: Infinity, exclusiveMin: true },
  maxLeverage: { min: 0, max: 125, exclusiveMin: true },
  maxOpenPositions: { min: 0, max: 50, exclusiveMin: true, integer: true },
  maxDailyLossPercent: { min: 0, max: 100, exclusiveMin: true },
} as const;

type FieldName = keyof typeof BOUNDS;

interface FormState {
  maxPositionSize: string;
  maxLeverage: string;
  maxOpenPositions: string;
  maxDailyLossPercent: string;
  killSwitchEnabled: boolean;
}

function validateField(name: FieldName, raw: string): string | undefined {
  const bounds = BOUNDS[name];
  const value = Number(raw);
  if (raw.trim() === '' || Number.isNaN(value)) return 'Required';
  if ('integer' in bounds && bounds.integer && !Number.isInteger(value)) return 'Must be a whole number';
  if (bounds.exclusiveMin ? value <= bounds.min : value < bounds.min) return `Must be greater than ${bounds.min}`;
  if (value > bounds.max) return `Must be at most ${bounds.max}`;
  return undefined;
}

/**
 * Editable form for the risk limits the backend has enforced since
 * `feat/risk-engine` (PR #13) -- position size, leverage, open-position
 * count, daily-loss cap, and the personal kill switch. Previously this
 * screen only read these values (Overview page); this is the first client
 * mutation path for them (issue #18 / UI-014C).
 *
 * Deliberately does *not* optimistically update: this platform's own
 * guardrail is to never show a simulated success when the server hasn't
 * confirmed one, and a risk limit (especially the kill switch) is exactly
 * the kind of value where a false "saved" state before server confirmation
 * would be actively misleading, not just cosmetic.
 */
export function RiskLimitsForm() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: queryKeys.risk.limits, queryFn: fetchRiskLimits });

  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Initialize the editable form from the fetched values exactly once --
  // a later background refetch (staleTime: 60s elsewhere) must not clobber
  // an in-progress edit the user hasn't saved yet. Set during render rather
  // than in an effect: the `form === null` guard only holds for the render
  // where `data` first arrives, so this fires exactly once, not on every
  // render -- React's documented pattern for one-time initialization from
  // async data, and it avoids the extra commit-then-effect-then-second-commit
  // round trip a useEffect version of this would need.
  if (data && form === null) {
    setForm({
      maxPositionSize: data.maxPositionSize,
      maxLeverage: data.maxLeverage,
      maxOpenPositions: String(data.maxOpenPositions),
      maxDailyLossPercent: data.maxDailyLossPercent,
      killSwitchEnabled: data.killSwitchEnabled,
    });
  }

  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const mutation = useMutation({
    mutationFn: updateRiskLimits,
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.risk.limits, updated);
      setSavedAt(Date.now());
    },
  });

  function setField(name: FieldName, value: string) {
    setForm((prev) => (prev ? { ...prev, [name]: value } : prev));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
    setSavedAt(null);
  }

  function handleSubmit() {
    if (!form) return;
    const nextErrors: Partial<Record<FieldName, string>> = {};
    (Object.keys(BOUNDS) as FieldName[]).forEach((name) => {
      const message = validateField(name, form[name]);
      if (message) nextErrors[name] = message;
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    mutation.mutate({
      maxPositionSize: Number(form.maxPositionSize),
      maxLeverage: Number(form.maxLeverage),
      maxOpenPositions: Number(form.maxOpenPositions),
      maxDailyLossPercent: Number(form.maxDailyLossPercent),
      killSwitchEnabled: form.killSwitchEnabled,
    });
  }

  // isError must be checked before the loading/!form guard below: form stays
  // null forever if the initial fetch fails (the "initialize once" effect
  // only ever populates it from a successful `data`), so folding isError
  // into `isLoading || !form` would make this branch permanently
  // unreachable and show an indefinite "Loading…" on a real fetch failure.
  if (isError) {
    return (
      <Card className="shadow-elevated">
        <CardContent className="pt-6 text-sm text-short">Could not load your risk limits.</CardContent>
      </Card>
    );
  }

  if (isLoading || !form) {
    return (
      <Card className="shadow-elevated">
        <CardContent className="pt-6 text-sm text-ink-muted">Loading your risk limits…</CardContent>
      </Card>
    );
  }

  const isValid = (Object.keys(BOUNDS) as FieldName[]).every((name) => !validateField(name, form[name]));

  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <CardTitle>Risk Limits</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Max Position Size"
            name="maxPositionSize"
            value={form.maxPositionSize}
            error={errors.maxPositionSize}
            onChange={(v) => setField('maxPositionSize', v)}
          />
          <FormField
            label="Max Leverage"
            name="maxLeverage"
            value={form.maxLeverage}
            error={errors.maxLeverage}
            onChange={(v) => setField('maxLeverage', v)}
            suffix="x"
          />
          <FormField
            label="Max Open Positions"
            name="maxOpenPositions"
            value={form.maxOpenPositions}
            error={errors.maxOpenPositions}
            onChange={(v) => setField('maxOpenPositions', v)}
            step="1"
          />
          <FormField
            label="Max Daily Loss"
            name="maxDailyLossPercent"
            value={form.maxDailyLossPercent}
            error={errors.maxDailyLossPercent}
            onChange={(v) => setField('maxDailyLossPercent', v)}
            suffix="%"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-floating/60 p-4">
          <div className="flex items-start gap-3">
            {form.killSwitchEnabled ? (
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-short" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-long" aria-hidden />
            )}
            <div>
              <Label htmlFor="kill-switch">Personal Kill Switch</Label>
              <p className="mt-0.5 text-xs text-ink-muted">
                {form.killSwitchEnabled
                  ? 'Enabled -- new orders are rejected until you turn this off.'
                  : 'Disabled -- new orders are evaluated normally.'}
              </p>
            </div>
          </div>
          <Switch
            id="kill-switch"
            checked={form.killSwitchEnabled}
            onCheckedChange={(checked) => {
              setForm((prev) => (prev ? { ...prev, killSwitchEnabled: checked } : prev));
              setSavedAt(null);
            }}
          />
        </div>

        {mutation.isError && (
          <p role="alert" className="text-sm text-short">
            {mutation.error instanceof ApiError ? mutation.error.message : 'Failed to save risk limits.'}
            {mutation.error instanceof ApiError && mutation.error.requestId && (
              <span className="ml-1 text-ink-muted">(ref: {mutation.error.requestId})</span>
            )}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button disabled={!isValid || mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
          {savedAt !== null && !mutation.isPending && (
            <span className="text-sm text-long" role="status">
              Saved
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FormField({
  label,
  name,
  value,
  error,
  onChange,
  suffix,
  step = 'any',
}: {
  label: string;
  name: FieldName;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  suffix?: string;
  step?: string;
}) {
  const inputId = `risk-limit-${name}`;
  const errorId = `${inputId}-error`;
  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative mt-1.5">
        <Input
          id={inputId}
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={suffix ? 'pr-8' : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-short">
          {error}
        </p>
      )}
    </div>
  );
}
