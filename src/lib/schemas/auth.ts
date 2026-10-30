import { z } from "zod";

export const EmailSchema = z
  .string()
  .min(1, "Informe seu e-mail corporativo.")
  .max(254, "O e-mail deve ter no máximo 254 caracteres.")
  .pipe(z.email("Informe um e-mail válido."));

export const LoginFormSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Informe sua senha."),
  remember: z.boolean(),
});

export type LoginFormValues = z.infer<typeof LoginFormSchema>;

export const PasswordResetSchema = z.object({ email: EmailSchema });

export type PasswordResetValues = z.infer<typeof PasswordResetSchema>;
