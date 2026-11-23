import messages from "./messages.json" with { type: "json" };

type Medication = { name: string; dose: string; timezone: string };
export function reminderContent(
  language: string,
  medication?: Medication | null,
  scheduledAt?: string,
) {
  const locale = (
    Object.hasOwn(messages, language) ? language : "pt"
  ) as keyof typeof messages;
  const copy = messages[locale];
  const generic = { title: copy.title, body: copy.body };
  if (!medication?.name?.trim() || !scheduledAt) return generic;
  try {
    const time = new Intl.DateTimeFormat(locale, {
      timeZone: medication.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(scheduledAt));
    return {
      title: copy.medication_title.replace(
        "{{name}}",
        medication.name.trim().slice(0, 180),
      ),
      body: copy.medication_body
        .replace("{{time}}", time)
        .replace("{{dose}}", medication.dose.slice(0, 100)),
    };
  } catch {
    return generic;
  }
}
