/**
 * GELIOM API TYPE DEFINITIONS
 * Bu dosya mobil/frontend entegrasyonu için referans amaçlıdır.
 */

// ==========================================
// 1. DATABASE MODELS (Tables)
// ==========================================
export namespace Tables {
  export interface User {
    id: string; // Firebase UID
    email: string;
    customId: string;
    displayName: string | null;
    photoUrl: string | null;
    isPremium: boolean;
    subscriptionStatus: string | null;
    createdAt: string; // ISO Date
    updatedAt: string; // ISO Date
  }

  export interface Group {
    id: string; // UUID
    name: string;
    description: string | null;
    inviteCode: string;
    ownerId: string;
    maxMembers: number;
    createdAt: string;
  }

  export interface GroupMember {
    userId: string;
    groupId: string;
    role: 'ADMIN' | 'MEMBER';
    joinedAt: string;
  }

  export interface UserStatus {
    userId: string;
    groupId: string;
    text: string;
    emoji: string | null;
    mood: string | null;
    updatedAt: string;
  }

  export interface JoinRequest {
    id: string;
    userId: string;
    groupId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: string;
  }

  export interface GroupMood {
    id: string;
    groupId: string;
    text: string;
    emoji: string | null;
    mood: string; // e.g. "happy"
  }

  export interface NotificationSetting {
    userId: string;
    groupId: string;
    isMuted: boolean;
  }
}

// ==========================================
// 2. API RESPONSES (Endpoints)
// ==========================================
export namespace API {
  // Auth & Users
  // ----------------------------------------

  /** GET /users/me */
  export type GetProfileResponse = Tables.User;

  /** GET /users/me/groups */
  export type GetMyGroupsResponse = (Tables.GroupMember & {
    group: Tables.Group;
  })[];

  /** GET /users/by-custom-id/:customId */
  export type FindUserResponse =
    | { found: false }
    | {
        found: true;
        user: Pick<Tables.User, 'customId' | 'displayName' | 'photoUrl'>;
      };

  // Groups
  // ----------------------------------------

  /** POST /groups */
  export type CreateGroupResponse = Tables.Group;

  /** POST /groups/join */
  export type JoinGroupResponse = Tables.GroupMember;

  /** GET /groups/:id/requests (Admin Only) */
  export type GetGroupRequestsResponse = (Tables.JoinRequest & {
    user: Tables.User;
  })[];

  /** POST /groups/:id/join-request */
  export type CreateJoinRequestResponse = Tables.JoinRequest;

  /** PATCH /groups/:id */
  export type UpdateGroupResponse = Tables.Group;

  /** POST /groups/:id/mute */
  export type MuteGroupResponse = Tables.NotificationSetting;

  // Status
  // ----------------------------------------

  /** POST /status */
  export type UpdateStatusResponse = Tables.UserStatus;

  // Moods
  // ----------------------------------------

  /** POST /groups/:id/moods */
  export type AddGroupMoodResponse = Tables.GroupMood;
}
