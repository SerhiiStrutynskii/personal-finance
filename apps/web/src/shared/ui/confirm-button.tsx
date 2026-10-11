import { useState } from 'react';
import { Button } from './button.tsx';
import { ConfirmDialog } from './confirm-dialog.tsx';

interface Props {
  /** Запитання в діалозі, наприклад «Видалити рахунок „Картка“?». */
  title: string;
  description?: string;
  label?: string;
  disabled?: boolean;
  onConfirm: () => void;
}

/** Кнопка небезпечної дії, яка виконується лише після підтвердження в діалозі. */
export function ConfirmButton({
  title,
  description,
  label = 'Видалити',
  disabled,
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        label={label}
        onConfirm={onConfirm}
      />
    </>
  );
}
