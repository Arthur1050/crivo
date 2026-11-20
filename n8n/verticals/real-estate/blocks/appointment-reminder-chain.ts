const markSentWired = registerReminderMessage.to(markReminderSent);

// Case 0 ("skip") propositalmente NÃO recebe `.onCase(...)` — mesmo padrão
// de "sem wiring de saída = execução termina aqui" usado em `isStillLatest`
// (só `.onTrue(...)`, sem `.onFalse(...)`) no principal.ts. É o que garante
// LGPD-03 AC2: lead com opt-out não recebe NENHUM envio proativo.
const reminderRouteSwitchRouted = reminderRouteSwitch
  .onCase(1, sendReminderText.to(markSentWired))
  .onCase(2, sendReminderTemplate.to(markSentWired));

const lembretesChain = getDueReminders.to(
  lookupTenantForReminder.to(
    mergeReminderContext.to(
      lookupConversaForReminder.to(
        postLeadForReminder.to(decideReminderChannel.to(reminderRouteSwitchRouted))
      )
    )
  )
);

