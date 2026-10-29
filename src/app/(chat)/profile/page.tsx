import { protectPage } from "@/auth/guards";
import { LockKeyhole } from "lucide-react";
import { ProfileDetails } from "./components/profile-details";

export default async function ProfilePage() {
  const user = await protectPage("chat");
  return (
    <main
      data-visual="profile-page"
      className="w-150 max-w-[calc(100%-48px)] my-11.25 mx-auto [&>h1]:text-[24px] [&>h1]:font-bold [&>h1]:tracking-[-0.6px] [&>h1]:mb-0.5 [&>p]:text-muted-foreground [&>p]:mb-7.5 max-[800.001px]:mt-7.5 max-[540.001px]:max-w-[calc(100%-26px)] max-[540.001px]:mt-6.5 max-[540.001px]:[&>h1]:text-[22px] max-[540.001px]:[&>p]:text-[12px]"
    >
      <h1>Meu perfil</h1>
      <p>Seus dados de acesso ao service desk de TI.</p>

      <section
        data-visual="card profile-details"
        className="[&>div]:flex [&>div]:items-center [&>div]:py-4.5 [&>div]:px-6 [&>div]:gap-3 [&>div]:min-h-14.25 [&>div+div]:border-t [&_span]:w-41 [&_span]:shrink-0 [&_span]:text-[13px] [&_span]:text-muted-foreground [&_strong]:text-[14px] [&_strong]:font-normal [&_small]:flex [&_small]:items-center [&_small]:gap-1 [&_small]:ml-auto [&_small]:whitespace-nowrap max-[1250.001px]:[&>div]:flex-wrap max-[1250.001px]:[&_small]:ml-44 max-[800.001px]:[&>div]:p-4 max-[800.001px]:[&_span]:w-full max-[800.001px]:[&_small]:m-0 max-[540.001px]:[&_strong]:text-[12px] max-[540.001px]:[&_strong]:break-all overflow-hidden rounded-[17px] border border-border bg-card shadow-[0_1px_2px_#18233408,0_5px_14px_#18233403]"
      >
        <div>
          <span>Nome</span>
          <strong>{user.name}</strong>
        </div>
        <div>
          <span>E-mail corporativo</span>
          <strong>{user.email}</strong>
          <small className="text-[12px] text-muted-foreground">
            <LockKeyhole size={13} /> Gerenciado pela TI
          </small>
        </div>
      </section>

      <ProfileDetails user={user} />
    </main>
  );
}
