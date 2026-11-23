import { reminderContent } from "./content.ts";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
Deno.test(
  "copy is localized; unknown languages and invalid details safely fall back",
  () => {
    const medication = {
      name: "Synthetic",
      dose: "1 tablet",
      timezone: "America/Fortaleza",
    };
    const at = "2026-11-23T18:00:00Z";
    equal(
      reminderContent("pt", medication, at).title,
      "Hora de tomar Synthetic",
    );
    equal(
      reminderContent("en", medication, at).title,
      "Time to take Synthetic",
    );
    equal(
      reminderContent("es", medication, at).title,
      "Hora de tomar Synthetic",
    );
    equal(reminderContent("fr").title, "Guia médico");
    equal(reminderContent("constructor").title, "Guia médico");
    equal(
      reminderContent("pt", medication, at).body,
      "15:00 · 1 tablet. Abra para registrar a dose.",
    );
    equal(
      reminderContent("pt", { ...medication, timezone: "invalid" }, at),
      reminderContent("pt"),
    );
    equal(
      reminderContent("pt", { ...medication, name: "  " }, at),
      reminderContent("pt"),
    );
    equal(reminderContent("pt", medication), reminderContent("pt"));
    equal(reminderContent("pt", medication, "bad"), reminderContent("pt"));
    const large = reminderContent(
      "pt",
      { ...medication, name: "a".repeat(2000), dose: "b".repeat(2000) },
      at,
    );
    equal(large.title.length < 220, true);
    equal(large.body.length < 180, true);
  },
);
