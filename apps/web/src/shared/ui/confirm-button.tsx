import { Trash2 } from 'lucide-react';
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

/** Іконка-кнопка небезпечної дії, яка виконується лише після підтвердження в діалозі. */
export function ConfirmButton({
  title,
  description,
  label = 'Видалити',
  disabled,
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false);
  // Кнопка без тексту: назвою для зчитувачів і підказкою слугує запитання без «?».
  const name = title.replace(/\?$/, '');

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label={name}
        title={name}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Trash2 />
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
