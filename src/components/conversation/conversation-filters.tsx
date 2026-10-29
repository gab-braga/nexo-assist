"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { FieldError } from "@/components/ui/field";
import {
  FilterFormSchema,
  StatusSchema,
  type FilterFormValues,
} from "@/lib/schemas/conversation-forms";

export function ConversationFilters({
  role,
  search,
  status,
  compact = false,
}: {
  role: "chat" | "agent";
  search: string;
  status: string;
  compact?: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FilterFormValues>({
    resolver: zodResolver(FilterFormSchema),
    values: { search, status: StatusSchema.catch("all").parse(status) },
  });

  return (
    <>
      <form
        action={role === "agent" ? "/agent" : "/chat"}
        noValidate
        data-visual={compact ? "search-box" : undefined}
        className={
          compact
            ? "mx-1.75 mb-3 flex items-center gap-2.5 py-2 px-3.25 bg-muted rounded-[30px] text-muted-foreground text-[12px] [&>input]:w-full [&>input]:min-w-0 [&>input]:bg-transparent"
            : "flex flex-wrap gap-2 items-center"
        }
        onSubmit={(event) => {
          const form = event.currentTarget;
          void handleSubmit(() => form.submit())(event);
        }}
      >
        {compact && <Search size={15} />}
        <Input
          unstyled
          {...register("search")}
          aria-label="Pesquisar atendimentos"
          aria-invalid={!!errors.search}
          aria-describedby={
            errors.search
              ? compact
                ? "compact-search-error"
                : "search-error"
              : undefined
          }
          maxLength={100}
          placeholder={
            compact
              ? "Pesquisar conversa ou atendimento"
              : "Pesquisar atendimentos"
          }
          className={
            compact
              ? "[-webkit-tap-highlight-color:transparent] outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              : "min-w-0 flex-1 bg-transparent outline-none text-[12px]"
          }
        />
        {compact ? (
          <input type="hidden" {...register("status")} />
        ) : (
          <NativeSelect
            unstyled
            {...register("status")}
            aria-label="Filtrar atendimentos"
            className="min-w-0 bg-transparent text-[12px]"
          >
            <NativeSelectOption value="all">Todos</NativeSelectOption>
            <NativeSelectOption value="waiting">Aguardando</NativeSelectOption>
            <NativeSelectOption value="active">
              Em atendimento
            </NativeSelectOption>
            <NativeSelectOption value="closed">Encerrados</NativeSelectOption>
            {role === "agent" && (
              <NativeSelectOption value="ai">
                Com Nexo Assist
              </NativeSelectOption>
            )}
            {role === "agent" && (
              <NativeSelectOption value="mine">
                Meus atendimentos
              </NativeSelectOption>
            )}
          </NativeSelect>
        )}
        <button
          aria-label="Aplicar filtros"
          type="submit"
          className={compact ? "sr-only" : undefined}
        >
          {compact ? "Pesquisar" : <Search size={15} />}
        </button>
      </form>
      <FieldError
        id={compact ? "compact-search-error" : "search-error"}
        className="text-red-700"
        errors={[errors.search, errors.status]}
      />
    </>
  );
}
