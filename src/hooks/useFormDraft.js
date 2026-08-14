import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook to persist form drafts in sessionStorage.
 * Prevents loss of user input on tab changes, accidental modal closes, or page reloads.
 * 
 * @param {string} draftKey - Unique key for the draft in sessionStorage.
 * @param {object|any} initialState - Default initial state for the form.
 * @param {boolean} enabled - Whether draft persistence is enabled (default: true). Set false for edit mode.
 * @returns {[any, Function, Function, boolean]} [formData, setFormData, clearDraft, isDirty]
 */
export function useFormDraft(draftKey, initialState, enabled = true) {
  const initialStateRef = useRef(initialState);

  const [formData, setFormData] = useState(() => {
    if (!enabled || !draftKey) return initialState;
    try {
      const saved = sessionStorage.getItem(`draft_${draftKey}`);
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn(`[useFormDraft] Failed to parse draft for key: ${draftKey}`, e);
    }
    return initialState;
  });

  // Sync to sessionStorage when formData changes
  useEffect(() => {
    if (!enabled || !draftKey) return;
    try {
      if (formData !== undefined && formData !== null) {
        sessionStorage.setItem(`draft_${draftKey}`, JSON.stringify(formData));
      }
    } catch (e) {
      console.warn(`[useFormDraft] Failed to save draft for key: ${draftKey}`, e);
    }
  }, [draftKey, formData, enabled]);

  // Clears the draft from sessionStorage and resets to initial state
  const clearDraft = useCallback(() => {
    if (draftKey) {
      try {
        sessionStorage.removeItem(`draft_${draftKey}`);
      } catch (e) {
        console.warn(`[useFormDraft] Failed to remove draft for key: ${draftKey}`, e);
      }
    }
    setFormData(initialStateRef.current);
  }, [draftKey]);

  // Check if form has unsaved changes compared to initial state
  const isDirty = enabled && JSON.stringify(formData) !== JSON.stringify(initialStateRef.current);

  return [formData, setFormData, clearDraft, isDirty];
}
