import z from "zod";

export const LoginSchema = z.object({
  idToken: z.string().min(100).max(16000),
  remember: z.boolean(),
});
