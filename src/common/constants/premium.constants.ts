export const PREMIUM_LIMITS = {
  FREE: {
    MAX_MEMBERSHIPS: 1,
    MAX_GROUP_MEMBERS: 5,
    CAN_ADD_CUSTOM_MOOD: false,
    MAX_CUSTOM_MOODS: 0,
  },
  PREMIUM: {
    MAX_MEMBERSHIPS: 7,
    MAX_GROUP_MEMBERS: 20,
    CAN_ADD_CUSTOM_MOOD: true,
    MAX_CUSTOM_MOODS: 10,
  },
};

export const NOTIFICATION_RULES = {
  STATUS_UPDATE_DEBOUNCE_MS: 15000, // 15 seconds
};

export const ERROR_MESSAGES = {
  PREMIUM: {
    MAX_GROUPS_REACHED: (current: number, max: number) =>
      `Maksimum grup limitine ulaştınız. (Mevcut: ${current}, Limit: ${max}). Daha fazla grup için Premium'a geçin.`,
    MAX_MEMBERS_REACHED: (max: number) =>
      `Bu grup maksimum üye kapasitesine ulaştı (${max} kişi). Kapasiteyi artırmak için Grup Yöneticisi Premium'a geçmelidir.`,
    REQUESTER_MAX_GROUPS: (max: number) =>
      `Bu kullanıcı grup limitine ulaşmış (${max}). Onaylanabilmesi için önce bir gruptan ayrılması ya da Premium'a geçmesi gerekir.`,
    CUSTOM_MOOD_RESTRICTED: 'Özel mood eklemek Premium özelliğidir.',
    OPTIONS_RESTRICTED: 'Grubun durum ve ruh hali listesini düzenlemek Premium özelliğidir.',
    MAX_OPTIONS: (max: number) => `Bir listede en fazla ${max} seçenek olabilir.`,
    GROUP_PAUSED: 'Bu grup duraklatıldı. Grup liderinin aboneliğini yenilemesi bekleniyor.',
    MAX_CUSTOM_MOODS_REACHED: (max: number) =>
      `Bu grup için maksimum özel mood limitine (${max}) ulaşıldı.`,
  },
  GROUP: {
    NOT_FOUND: 'Grup bulunamadı.',
    ALREADY_MEMBER: 'Zaten bu grubun üyesisiniz.',
    NOT_ADMIN: 'Bu işlem için Grup Yöneticisi olmalısınız.',
  },
};

/** Varsayılan (client'ta tanımlı) ruh hallerinin push metni için Türkçe etiketleri. */
export const DEFAULT_MOOD_LABELS: Record<string, string> = {
  happy: 'Mutlu',
  relaxed: 'Rahat',
  energetic: 'Enerjik',
  excited: 'Heyecanlı',
  tired: 'Yorgun',
  stressed: 'Stresli',
  sad: 'Üzgün',
  bored: 'Sıkkın',
  busy: 'Meşgul',
};

export const GROUP_NAME_RULES = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 30,
};
