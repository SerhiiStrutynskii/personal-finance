import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../shared/ui/button.tsx';
import { Muted } from '../../shared/ui/controls.tsx';
import { useAuth } from '../auth/authContext.ts';
import { AuthLayout, LoginLink, RegisterForm } from '../auth/AuthPages.tsx';
import { useInvitePreview } from './api.ts';

/**
 * Сторінка посилання-запрошення: реєстрація нового облікового запису, який одразу стає
 * учасником домогосподарства. Наявний акаунт приєднатися не може.
 */
export function InvitePage() {
  const { token = '' } = useParams();
  const { status, current, logout } = useAuth();
  const navigate = useNavigate();

  if (status === 'loading') return <Muted>Завантаження…</Muted>;
  if (status === 'authenticated' && current) {
    return (
      <AuthLayout title="Запрошення" footer={null}>
        <div className="space-y-3 text-sm">
          <p>
            Ви ввійшли як {current.user.name}. Запрошення діє лише для нового облікового запису:
            вийдіть і зареєструйтеся з іншим email.
          </p>
          <Button variant="outline" className="w-full max-sm:h-10" onClick={logout}>
            Вийти
          </Button>
        </div>
      </AuthLayout>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return <InviteRegistration token={token} onJoined={() => navigate('/', { replace: true })} />;
}

function InviteRegistration({ token, onJoined }: { token: string; onJoined: () => void }) {
  const preview = useInvitePreview(token);

  if (preview.isPending) {
    return (
      <AuthLayout title="Запрошення" footer={<LoginLink />}>
        <Muted>Завантаження…</Muted>
      </AuthLayout>
    );
  }
  if (preview.isError) {
    return (
      <AuthLayout title="Запрошення недійсне" footer={<LoginLink />}>
        <p className="text-sm" data-testid="invite-invalid">
          Посилання відкликали, уже використали або строк його дії минув. Попросіть нове.
        </p>
      </AuthLayout>
    );
  }

  const { householdName, invitedBy } = preview.data;
  return (
    <AuthLayout title={`Приєднатися до «${householdName}»`} footer={<LoginLink />}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {invitedBy ? `${invitedBy} запрошує вас` : 'Вас запрошено'} вести спільні фінанси.
          Створіть обліковий запис — і одразу побачите дані домогосподарства.
        </p>
        <RegisterForm inviteToken={token} onRegistered={onJoined} />
      </div>
    </AuthLayout>
  );
}
