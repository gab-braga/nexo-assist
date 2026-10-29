import { z } from "zod";

export const SubjectSchema = z
  .string()
  .trim()
  .min(3, "Descreva o assunto com pelo menos 3 caracteres.")
  .max(160, "O assunto deve ter no máximo 160 caracteres.");

export const MessageTextSchema = z
  .string()
  .trim()
  .min(1, "Escreva uma mensagem.")
  .max(8000, "A mensagem deve ter no máximo 8.000 caracteres.");

export const SearchSchema = z
  .string()
  .trim()
  .max(100, "A pesquisa deve ter no máximo 100 caracteres.");

export const StatusSchema = z.enum([
  "all",
  "waiting",
  "active",
  "closed",
  "mine",
]);

export const CreateFormSchema = z.object({ subject: SubjectSchema });
export const MessageFormSchema = z.object({ text: MessageTextSchema });
export const FilterFormSchema = z.object({
  search: SearchSchema,
  status: StatusSchema,
});

export type CreateFormValues = z.infer<typeof CreateFormSchema>;
export type MessageFormValues = z.infer<typeof MessageFormSchema>;
export type FilterFormValues = z.infer<typeof FilterFormSchema>;
