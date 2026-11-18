import { FinanceNotificationSource, HealthNotificationSource } from "./sources";

// New modules add a Source component here. The common panel only consumes the
// documented feed contract; hooks remain inside each Source's component.
export const notificationSources = [
  {
    id: "minhasfinancas",
    labelKey: "nav.minhasfinancas",
    Source: FinanceNotificationSource,
  },
  { id: "health", labelKey: "nav.health", Source: HealthNotificationSource },
];
