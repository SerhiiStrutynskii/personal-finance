import type { MenuDayTemplate } from '@hf/shared';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Field } from '../../shared/ui/controls.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../shared/ui/dialog.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { useCreateMenuTemplate, useRenameMenuTemplate } from './api.ts';
import { parseTemplateName } from './templates.ts';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (
  | /** Зберегти записи дня date як новий шаблон. */ { date: string; template?: undefined }
  | /** Перейменувати шаблон. */ { date?: undefined; template: MenuDayTemplate | undefined }
);

/**
 * Назва шаблону меню дня: збереження дня як шаблону або перейменування наявного. Помилку API
 * (зокрема дубль назви, 409) показує в діалозі й не закривається.
 */
export function SaveTemplateDialog({ open, onOpenChange, date, template }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <TemplateNameForm date={date} template={template} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateNameForm({
  date,
  template,
  onDone,
}: {
  date: string | undefined;
  template: MenuDayTemplate | undefined;
  onDone: () => void;
}) {
  const create = useCreateMenuTemplate();
  const rename = useRenameMenuTemplate();
  const save = template ? rename : create;
  const [name, setName] = useState(template?.name ?? '');
  const [error, setError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseTemplateName(name);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError(undefined);
    if (template) rename.mutate({ id: template.id, name: parsed.name }, { onSuccess: onDone });
    else if (date) create.mutate({ name: parsed.name, date }, { onSuccess: onDone });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>{template ? 'Перейменувати шаблон' : 'Зберегти як шаблон'}</DialogTitle>
        {!template && (
          <DialogDescription>
            Страви й продукти цього дня збережуться як шаблон. Подальші зміни дня шаблон не змінять.
          </DialogDescription>
        )}
      </DialogHeader>
      <Field label="Назва" error={error}>
        <Input
          autoFocus
          value={name}
          placeholder="Наприклад, «Будній день»"
          aria-invalid={error ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          Зберегти
        </Button>
      </DialogFooter>
    </form>
  );
}
