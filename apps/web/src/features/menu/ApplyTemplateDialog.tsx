import type { MenuDayTemplate } from '@hf/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Field, Muted } from '../../shared/ui/controls.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../shared/ui/dialog.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { useApplyMenuTemplate, useMenuTemplates } from './api.ts';
import { replaceWarning, templateOptionLabel } from './templates.ts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  /** Скільки записів зараз у дні: вони зникнуть під час заміни. */
  entryCount: number;
}

/** Вибір шаблону й заміна ним меню дня; у непорожньому дні — з попередженням. */
export function ApplyTemplateDialog({ open, onOpenChange, date, entryCount }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <ApplyTemplateForm
            date={date}
            entryCount={entryCount}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApplyTemplateForm({
  date,
  entryCount,
  onDone,
}: {
  date: string;
  entryCount: number;
  onDone: () => void;
}) {
  const templates = useMenuTemplates();
  const apply = useApplyMenuTemplate();
  const [picked, setPicked] = useState('');
  const items: readonly MenuDayTemplate[] = templates.data ?? [];
  // Поки нічого не вибрано — перший шаблон списку.
  const templateId = items.some((item) => item.id === picked) ? picked : (items[0]?.id ?? '');
  const warning = replaceWarning(entryCount);

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Застосувати шаблон</DialogTitle>
      </DialogHeader>
      <ErrorText>{templates.isError && errorMessage(templates.error)}</ErrorText>
      {templates.isPending && <Muted>Завантаження…</Muted>}
      {templates.data?.length === 0 && (
        <Muted>Шаблонів ще немає. Збережіть меню дня як шаблон</Muted>
      )}
      {items.length > 0 && (
        <>
          <Field label="Шаблон">
            <SelectField
              value={templateId}
              onChange={setPicked}
              options={items.map((item) => ({ value: item.id, label: templateOptionLabel(item) }))}
            />
          </Field>
          {warning && (
            <p className="text-sm text-destructive" data-testid="template-replace-warning">
              {warning}
            </p>
          )}
        </>
      )}
      <Link className="text-sm text-primary underline" to="/menu/dictionaries#templates">
        Керувати шаблонами
      </Link>
      <ErrorText>{apply.isError && errorMessage(apply.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        {items.length > 0 && (
          <Button
            variant={warning ? 'destructive' : 'default'}
            disabled={apply.isPending || templateId === ''}
            onClick={() => apply.mutate({ id: templateId, date }, { onSuccess: onDone })}
          >
            {warning ? 'Замінити меню дня' : 'Застосувати'}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
