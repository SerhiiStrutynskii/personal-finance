import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog.tsx';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Запитання в діалозі, наприклад «Видалити рахунок „Картка“?». */
  title: string;
  description?: string | undefined;
  /** Підпис кнопки підтвердження. */
  label?: string | undefined;
  onConfirm: () => void;
}

/** Діалог підтвердження небезпечної дії, яким керує батьківський компонент. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description = 'Цю дію не можна скасувати.',
  label = 'Видалити',
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
