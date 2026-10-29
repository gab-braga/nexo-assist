import { protectPage } from "@/auth/guards";
import { PasswordReset } from "@/components/password-reset";

export default async function ProfilePage() {
  const user = await protectPage("chat");

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 md:p-10">
      <h1 className="text-2xl font-semibold">Meu perfil</h1>
      <section className="space-y-4 rounded-xl border bg-card p-6">
        <p>
          <span className="text-muted-foreground">Nome</span>
          <br />
          {user.name}
        </p>
        <p className="break-all">
          <span className="text-muted-foreground">E-mail</span>
          <br />
          {user.email}
        </p>
        <p className="text-sm text-muted-foreground">
          Dados gerenciados pela TI.
        </p>
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="text-lg">Senha</h2>
        <PasswordReset email={user.email} />
      </section>
    </main>
  );
}
