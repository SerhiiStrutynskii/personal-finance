import {
  INVITE_TTL_DAYS,
  type CreatedInvite,
  type Household,
  type HouseholdMember,
} from '@hf/shared';
import { Check, Copy, Crown, Pencil, Share2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.tsx';
import { ErrorText, Field, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../shared/ui/dialog.tsx';
import { formatShortDate } from '../../shared/ui/format.ts';
import { Input } from '../../shared/ui/input.tsx';
import { ListRow } from '../../shared/ui/list-row.tsx';
import { useAuth, useCurrentUser } from '../auth/authContext.ts';
import {
  inviteLink,
  useCreateInvite,
  useHousehold,
  useLeaveHousehold,
  useRemoveMember,
  useRenameHousehold,
  useRevokeInvite,
  useTransferOwnership,
} from './api.ts';

const ROLE_LABELS = { owner: 'власник', member: 'учасник' } as const;

/** Учасники домогосподарства, запрошення за посиланням і вихід із домогосподарства. */
export function HouseholdPage() {
  const household = useHousehold();
  const createInvite = useCreateInvite();
  // Нове посилання показується лише раз — одразу після створення.
  const [created, setCreated] = useState<CreatedInvite>();
  const [renaming, setRenaming] = useState(false);
  const data = household.data;
  const isOwner = data?.role === 'owner';

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1">
            {data?.name ?? 'Домогосподарство'}
            {isOwner && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Перейменувати домогосподарство"
                onClick={() => setRenaming(true)}
              >
                <Pencil />
              </Button>
            )}
          </span>
        }
        action={
          isOwner && (
            <Button
              disabled={createInvite.isPending}
              onClick={() => createInvite.mutate(undefined, { onSuccess: setCreated })}
            >
              <UserPlus />
              Запросити
            </Button>
          )
        }
      />
      <ErrorText>{household.isError && errorMessage(household.error)}</ErrorText>
      <ErrorText>{createInvite.isError && errorMessage(createInvite.error)}</ErrorText>
      {household.isPending && <Muted>Завантаження…</Muted>}

      {data && (
        <>
          <Members household={data} />
          {isOwner && <Invites household={data} />}
          {!isOwner && <LeaveSection />}
        </>
      )}

      <InviteLinkDialog invite={created} onClose={() => setCreated(undefined)} />
      {data && <RenameDialog open={renaming} onOpenChange={setRenaming} name={data.name} />}
    </div>
  );
}

function Members({ household }: { household: Household }) {
  const { user } = useCurrentUser();
  const remove = useRemoveMember();
  const transfer = useTransferOwnership();
  const { reloadCurrentUser } = useAuth();
  const isOwner = household.role === 'owner';

  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold">Учасники</h2>
      <p className="text-sm text-muted-foreground">
        Усі бачать ті самі дані. Учасники ведуть витрати, прибутки й покупки; рахунки, категорії,
        бюджет, борги й цілі змінює власник.
      </p>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      <ErrorText>{transfer.isError && errorMessage(transfer.error)}</ErrorText>
      <ul className="divide-y text-sm" data-testid="household-members">
        {household.members.map((member) => (
          <ListRow
            key={member.userId}
            className="items-center py-2"
            data-testid="household-member"
            meta={member.email}
            amount={<span className="text-muted-foreground">{ROLE_LABELS[member.role]}</span>}
            actions={
              isOwner &&
              member.userId !== user.id && (
                <div className="flex gap-1">
                  <TransferOwnershipButton
                    member={member}
                    disabled={transfer.isPending}
                    onConfirm={() =>
                      transfer.mutate(member.userId, {
                        // Роль у меню й права на інших сторінках бере сесія.
                        onSuccess: () => reloadCurrentUser(),
                      })
                    }
                  />
                  <ConfirmButton
                    title={`Вилучити «${member.name}» з домогосподарства?`}
                    description="Учасник одразу втратить доступ до цих даних. Його акаунт лишиться з власним порожнім домогосподарством; повернутися можна лише за новим запрошенням на інший email."
                    label="Вилучити"
                    disabled={remove.isPending}
                    onConfirm={() => remove.mutate(member.userId)}
                  />
                </div>
              )
            }
          >
            {member.name}
            {member.userId === user.id && <span className="text-muted-foreground"> (ви)</span>}
          </ListRow>
        ))}
      </ul>
    </section>
  );
}

/** Іконка-кнопка «Зробити власником» із підтвердженням. */
function TransferOwnershipButton({
  member,
  disabled,
  onConfirm,
}: {
  member: HouseholdMember;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const name = `Зробити «${member.name}» власником`;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={name}
        title={name}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Crown />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Передати роль власника «${member.name}»?`}
        description={`${member.name} зможе змінювати рахунки, категорії, бюджет, борги, цілі й керувати домогосподарством. Ви станете учасником; повернути роль може лише новий власник.`}
        label="Передати"
        onConfirm={onConfirm}
      />
    </>
  );
}

function Invites({ household }: { household: Household }) {
  const { user } = useCurrentUser();
  const revoke = useRevokeInvite();
  if (household.invites.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold">Активні запрошення</h2>
      <ErrorText>{revoke.isError && errorMessage(revoke.error)}</ErrorText>
      <ul className="divide-y text-sm" data-testid="household-invites">
        {household.invites.map((invite) => (
          <ListRow
            key={invite.id}
            className="items-center py-2"
            data-testid="household-invite"
            amount={
              <span className="text-muted-foreground">
                до {formatShortDate(invite.expiresAt, user.timeZone)}
              </span>
            }
            actions={
              <ConfirmButton
                title="Відкликати запрошення?"
                description="Посилання перестане діяти."
                label="Відкликати"
                disabled={revoke.isPending}
                onConfirm={() => revoke.mutate(invite.id)}
              />
            }
          >
            Посилання від {formatShortDate(invite.createdAt, user.timeZone)}
          </ListRow>
        ))}
      </ul>
    </section>
  );
}

function LeaveSection() {
  const leave = useLeaveHousehold();
  const { reloadCurrentUser } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-2">
      <ErrorText>{leave.isError && errorMessage(leave.error)}</ErrorText>
      <Button variant="outline" disabled={leave.isPending} onClick={() => setOpen(true)}>
        Вийти з домогосподарства
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Вийти з домогосподарства?"
        description="Ви втратите доступ до його даних і отримаєте власне порожнє домогосподарство. Повернутися можна лише за новим запрошенням."
        label="Вийти"
        onConfirm={() => leave.mutate(undefined, { onSuccess: () => reloadCurrentUser() })}
      />
    </section>
  );
}

/** Посилання щойно створеного запрошення: скопіювати або поділитися. */
function InviteLinkDialog({
  invite,
  onClose,
}: {
  invite: CreatedInvite | undefined;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = invite ? inviteLink(invite.token) : '';
  const canShare = typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Буфер обміну недоступний — посилання можна скопіювати з поля вручну.
    }
  }

  return (
    <Dialog
      open={invite !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Посилання-запрошення</DialogTitle>
          <DialogDescription>
            Надішліть його людині, яку запрошуєте. Посилання діє {INVITE_TTL_DAYS} днів, лише для
            одного нового облікового запису, і показується тільки зараз.
          </DialogDescription>
        </DialogHeader>
        <Input
          readOnly
          aria-label="Посилання-запрошення"
          value={link}
          onFocus={(e) => e.target.select()}
        />
        <DialogFooter>
          {canShare && (
            <Button
              variant="outline"
              onClick={() => navigator.share({ title: 'Запрошення до Prospera', url: link })}
            >
              <Share2 />
              Поділитися
            </Button>
          )}
          <Button onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Скопійовано' : 'Скопіювати'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  open,
  onOpenChange,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <RenameForm name={name} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ name: initial, onDone }: { name: string; onDone: () => void }) {
  const rename = useRenameHousehold();
  const { reloadCurrentUser } = useAuth();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 100) {
      setError('Вкажіть назву до 100 символів');
      return;
    }
    setError(undefined);
    rename.mutate(
      { name: trimmed },
      {
        onSuccess: async () => {
          // Назва домогосподарства показується в меню — її бере сесія.
          await reloadCurrentUser();
          onDone();
        },
      },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>Назва домогосподарства</DialogTitle>
      </DialogHeader>
      <Field label="Назва" error={error}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <ErrorText>{rename.isError && errorMessage(rename.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={rename.isPending}>
          Зберегти
        </Button>
      </DialogFooter>
    </form>
  );
}
