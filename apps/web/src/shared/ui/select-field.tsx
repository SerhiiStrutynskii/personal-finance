import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.tsx';

// Radix Select не допускає порожнього значення в пункті, тому '' підмінюється службовим.
const EMPTY = '__empty__';

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  placeholder?: string;
  invalid?: boolean;
}

/** Список вибору зі значеннями-рядками; пункт зі значенням '' означає «нічого не обрано». */
export function SelectField<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  invalid,
}: Props<T>) {
  const hasEmptyOption = options.some((option) => option.value === '');
  const encode = (raw: string) => (raw === '' && hasEmptyOption ? EMPTY : raw);

  return (
    <Select
      value={encode(value)}
      onValueChange={(next) => onChange((next === EMPTY ? '' : next) as T)}
    >
      <SelectTrigger className="w-full" aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={encode(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
