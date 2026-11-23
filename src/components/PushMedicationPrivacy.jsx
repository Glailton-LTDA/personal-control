import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  readMedicationPushPrivacy,
  saveMedicationPushPrivacy,
} from "../lib/pushPrivacy";

export default function PushMedicationPrivacy({ userId }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const key = ["push-privacy", userId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => readMedicationPushPrivacy(userId),
    enabled: Boolean(userId),
    gcTime: 0,
    retry: 1,
  });
  const save = useMutation({
    mutationFn: (enabled) => saveMedicationPushPrivacy(userId, enabled),
    onSuccess: (value) => client.setQueryData(key, value),
  });
  return (
    <section
      className="app-push-privacy"
      aria-label={t("push.medication_details")}
    >
      <label className="app-push-privacy-label">
        <input
          type="checkbox"
          checked={query.data === true}
          disabled={
            !userId || query.isPending || query.isError || save.isPending
          }
          onChange={(event) => save.mutate(event.target.checked)}
        />
        <span>{t("push.medication_details")}</span>
      </label>
      <p>{t("push.medication_details_hint")}</p>
      <p role="status">
        {t(
          query.isPending
            ? "push.state_loading"
            : save.isPending
              ? "push.saving"
              : query.data === true
                ? "push.medication_details_visible"
                : "push.medication_details_hidden",
        )}
      </p>
      {(query.isError || save.isError) && <p role="alert">{t("push.error")}</p>}
      {query.isError && (
        <button className="btn-secondary" onClick={() => query.refetch()}>
          {t("push.retry")}
        </button>
      )}
    </section>
  );
}
