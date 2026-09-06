import {
  InviteSchema,
  CreateInviteSchema,
  type Invite as InviteDto,
  type CreateInvite as CreateInviteDto,
  type ErrorCode,
  type ValidateInviteData,
} from "@wattguard/shared";
import { Invite, type HydratedInvite } from "../models/Invite";
import { hashTokenSha256 } from "../utils/crypto";

export const toInviteDto = (invite: HydratedInvite): InviteDto => {
  const obj = invite.toObject();
  return InviteSchema.parse({
    ...obj,
    self: `/api/v1/invites/${String(obj._id)}`,
  });
};

export const toCreateInviteDto = (invite: HydratedInvite): CreateInviteDto => {
  const obj = invite.toObject();
  return CreateInviteSchema.parse({
    ...obj,
    self: `/api/v1/invites/${String(obj._id)}`,
  });
};

export type ValidateInviteResult =
  | {
      ok: true;
      data: ValidateInviteData;
    }
  | {
      ok: false;
      status: 422 | 404;
      error: string;
      code: ErrorCode;
    };

/**
 * Validate an invitation token without any coupling to Hono context.
 */
export async function validateInviteToken(
  token: string,
): Promise<ValidateInviteResult> {
  const tokenHash = hashTokenSha256(token);
  const invite = await Invite.findOne({ tokenHash });

  if (!invite) {
    return {
      ok: false,
      error: "Invalid invite token",
      code: "invite_invalid_token",
      status: 404,
    };
  }

  if (invite.status !== "pending") {
    return {
      ok: false,
      error: `Invite is ${invite.status}`,
      code: "invite_invalid_status",
      status: 422,
    };
  }

  if (invite.expiresAt < new Date()) {
    return {
      ok: false,
      error: "Invite has expired",
      code: "invite_expired",
      status: 422,
    };
  }

  return {
    ok: true,
    data: {
      valid: true as const,
      _id: invite._id.toString(),
      self: `/api/v1/invites/${invite._id.toString()}`,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    },
  };
}
