"use client";

import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError } from "@/components/ui/field";
import {
  LoginFormSchema,
  PasswordResetSchema,
  type LoginFormValues,
  type PasswordResetValues,
} from "@/lib/schemas/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { getClientAuth } from "@/server/lib/firebase/firebase-client";
import { login } from "@/server/actions/auth";

export function LoginForm() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: "", password: "", remember: true },
  });
  const recovery = useForm<PasswordResetValues>({
    resolver: zodResolver(PasswordResetSchema),
    defaultValues: { email: "" },
  });
  const resetting = recovery.formState.isSubmitting;
  const pending = isSubmitting || resetting;

  function changeResetOpen(open: boolean) {
    if (resetting) return;
    recovery.reset();
    setMessage("");
    setResetOpen(open);
  }

  async function submit({ email, password, remember }: LoginFormValues) {
    if (busy.current) return;
    busy.current = true;
    setMessage("");
    try {
      const auth = await getClientAuth();
      try {
        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
        const response = await login({
          idToken: await credential.user.getIdToken(true),
          remember,
        });
        if (!response.ok) {
          setError("root", { message: response.error });
          return;
        }
        router.replace(response.data.destination);
        router.refresh();
      } finally {
        await signOut(auth);
      }
    } catch {
      setError("root", {
        message:
          "Não foi possível entrar. Verifique seus dados ou entre em contato com a TI.",
      });
    } finally {
      busy.current = false;
    }
  }

  async function reset({ email }: PasswordResetValues) {
    if (busy.current) return;
    busy.current = true;
    setMessage("");
    try {
      await sendPasswordResetEmail(await getClientAuth(), email);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      if (code !== "auth/user-not-found") {
        toast.error(
          code === "auth/network-request-failed"
            ? "Não foi possível conectar. Verifique sua conexão e tente novamente."
            : code === "auth/too-many-requests"
              ? "Muitas solicitações. Aguarde um pouco e tente novamente."
              : "Não foi possível solicitar a recuperação. Tente novamente mais tarde.",
        );
        return;
      }
    } finally {
      busy.current = false;
    }
    recovery.reset();
    setMessage(
      "Se houver uma conta com esse e-mail, você receberá as instruções de redefinição. Confira também sua caixa de spam.",
    );
  }

  return (
    <>
      <form
        data-visual="login-form"
        className="w-95 -mt-8.75 [&>h2]:font-serif [&>h2]:text-[36px] [&>h2]:leading-[1.2] [&>h2]:mb-3.2 [&>h2]:font-normal [&>p]:text-muted-foreground [&>p]:text-[15px] [&>p]:mb-6.5 [&>p]:whitespace-nowrap [&_label]:text-[13px] [&_label]:block [&_label]:mb-1.5 max-[1250.001px]:w-full max-[1250.001px]:[&>p]:whitespace-normal max-[800.001px]:max-w-105 max-[800.001px]:mt-0"
        noValidate
        aria-busy={pending}
        onSubmit={(event) => void handleSubmit(submit)(event)}
      >
        <h2>Entrar</h2>
        <p>Use seu e-mail corporativo e a senha da rede Nexo.</p>
        {errors.root?.message && (
          <FieldError className="mb-4 text-red-700">
            {errors.root.message}
          </FieldError>
        )}
        <Field className="block" data-invalid={!!errors.email}>
          <Label htmlFor="email">E-mail corporativo</Label>
          <div
            data-visual="input-icon"
            className="flex items-center border border-[#dfe2e7] rounded-[9px] h-11.5 px-3.25 gap-2.5 shadow-[0_1px_2px_#00000005] [&_svg]:size-4 [&_svg]:text-muted-foreground [&>input]:min-w-0 [&>input]:w-full [&>input]:text-[14px] [&>input]:bg-transparent [&>input]:focus-visible:outline-none focus-within:border-[#0785ff] focus-within:shadow-[0_0_0_1px_#0785ff]"
          >
            <Mail />
            <Input
              unstyled
              className="[-webkit-tap-highlight-color:transparent] outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              id="email"
              type="email"
              required
              placeholder="exemplo@nexo.com.br"
              {...register("email")}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              autoComplete="username"
              maxLength={254}
            />
          </div>
          <FieldError
            id="email-error"
            className="mt-1.5 text-red-700"
            errors={[errors.email]}
          />
        </Field>
        <Field className="block" data-invalid={!!errors.password}>
          <div
            data-visual="password-label"
            className="flex justify-between mt-4 text-[13px] [&>button]:text-primary [&>button]:mb-1.5"
          >
            <Label htmlFor="password">Senha</Label>
            <button
              className="cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default"
              type="button"
              disabled={pending}
              onClick={() => changeResetOpen(true)}
            >
              Esqueci minha senha?
            </button>
          </div>
          <div
            data-visual="input-icon password-input"
            className="flex items-center border rounded-[9px] h-11.5 px-3.25 gap-2.5 [&_svg]:size-4 [&_svg]:text-muted-foreground [&>input]:min-w-0 [&>input]:w-full [&>input]:text-[14px] [&>input]:bg-transparent [&>input]:focus-visible:outline-none focus-within:border-[#0785ff] focus-within:shadow-[0_0_0_1px_#0785ff] border-[#0785ff] shadow-[0_0_0_1px_#0785ff] [&>svg]:text-[#0785ff] [&>input]:tracking-[4px]"
          >
            <LockKeyhole />
            <Input
              unstyled
              className="[-webkit-tap-highlight-color:transparent] outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              id="password"
              type={show ? "text" : "password"}
              required
              {...register("password")}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              placeholder="·······"
              autoComplete="current-password"
            />
            <button
              className="cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-default"
              type="button"
              aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff /> : <Eye />}
            </button>
          </div>
          <FieldError
            id="password-error"
            className="mt-1.5 text-red-700"
            errors={[errors.password]}
          />
        </Field>
        <Label
          htmlFor="remember"
          data-visual="remember"
          className="[&&]:flex [&&]:items-center [&&]:gap-2.25 [&&]:mt-4.75 [&&]:mb-6.75 [&&]:text-[#435066] [&>input]:accent-primary [&>input]:size-4.5"
        >
          <Controller
            control={control}
            name="remember"
            render={({ field }) => (
              <Checkbox
                id="remember"
                name={field.name}
                ref={field.ref}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                onBlur={field.onBlur}
                className="size-4.5 rounded-[3px] shadow-none border-[#767676] data-[state=checked]:border-primary"
              />
            )}
          />
          Manter conectado neste computador
        </Label>
        <Button
          data-visual="login-submit"
          size="lg"
          className="w-full shadow-[0_7px_14px_#0063c920] text-[15px]"
          type="submit"
          disabled={pending}
        >
          {isSubmitting ? "Entrando..." : "Entrar"} <ArrowRight />
        </Button>
        <div
          data-visual="login-rule"
          className="border-t border-border mt-6.75"
        />
      </form>
      <Dialog
        open={resetOpen}
        onOpenChange={changeResetOpen}
        title="Recuperar Senha"
        description="Informe seu e-mail para receber um link de redefinição de senha."
      >
        <form
          noValidate
          onSubmit={(event) => void recovery.handleSubmit(reset)(event)}
          aria-busy={resetting}
          className="space-y-5"
        >
          {message && (
            <p role="status" className="rounded-lg bg-primary/5 p-3 text-sm">
              {message}
            </p>
          )}
          <Field data-invalid={!!recovery.formState.errors.email}>
            <Label htmlFor="recovery-email">E-mail</Label>
            <Input
              id="recovery-email"
              type="email"
              autoComplete="email"
              placeholder="exemplo@nexo.com.br"
              maxLength={254}
              disabled={resetting}
              aria-invalid={!!recovery.formState.errors.email}
              aria-describedby={
                recovery.formState.errors.email
                  ? "recovery-email-error"
                  : undefined
              }
              {...recovery.register("email")}
            />
            <FieldError
              id="recovery-email-error"
              errors={[recovery.formState.errors.email]}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={resetting}
              onClick={() => changeResetOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={resetting}>
              {resetting && (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              )}
              {resetting ? "Enviando..." : "Enviar link de recuperação"}
            </Button>
          </div>
        </form>
      </Dialog>
      <Toaster richColors position="top-right" />
    </>
  );
}
