// Stable keys; labels live in the application's translation resources.
export const MEDICAL_SPECIALTIES = [
  'general', 'family', 'cardiology', 'dermatology', 'endocrinology',
  'gastroenterology', 'geriatrics', 'gynecology', 'hematology', 'infectious',
  'nephrology', 'neurology', 'nutrition', 'oncology', 'ophthalmology',
  'orthopedics', 'otolaryngology', 'pediatrics', 'pulmonology', 'psychiatry',
  'rheumatology', 'urology', 'allergy', 'general_surgery', 'vascular',
];

export function appointmentFollowUp(record) {
  return {
    name: record.name,
    professional: record.professional,
    specialty: record.specialty,
    location: record.location,
    address: record.address,
    condition_id: record.condition_id,
    reminder_minutes: [...(record.reminder_minutes || [1440, 120])],
    follow_up_of: record.id,
    status: 'scheduled',
    starts_at: '',
    notes: '',
  };
}

export function appointmentMapUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
