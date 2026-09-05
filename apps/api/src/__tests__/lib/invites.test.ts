import { describe, test, expect } from "bun:test";
import mongoose from "mongoose";
import { setupIntegrationTests } from "../helpers/db";
import { Invite } from "../../models/Invite";
import { User } from "../../models/User";
import { hashTokenSha256 } from "../../utils/crypto";
import {
  toInviteDto,
  toCreateInviteDto,
  validateInviteToken,
} from "../../lib/invites";

setupIntegrationTests();

describe("lib/invites", () => {
  describe("toInviteDto", () => {
    test("converts invite with unpopulated createdBy to Invite DTO", async () => {
      const creatorId = new mongoose.Types.ObjectId();
      const invite = await Invite.create({
        email: "invited@example.com",
        role: "operator",
        tokenHash: "secret-hash-123",
        status: "pending",
        expiresAt: new Date(Date.now() + 86400000),
        createdBy: creatorId,
      });

      const dto = toInviteDto(invite);

      expect(dto.self).toBe(`/api/v1/invites/${invite._id.toString()}`);
      expect(dto._id).toBe(invite._id.toString());
      expect(dto.email).toBe("invited@example.com");
      expect(dto.role).toBe("operator");
      expect(dto.status).toBe("pending");
      expect(dto.expiresAt).toBe(invite.expiresAt.toISOString());
      expect(dto.createdBy).toBe(creatorId.toString());
      // Ensure tokenHash is not leaked in DTO
      expect("tokenHash" in dto).toBe(false);
    });

    test("converts invite with populated createdBy to Invite DTO", async () => {
      const user = await User.create({
        email: "admin-creator@example.com",
        role: "admin",
        passwordHash: "hash123",
      });

      const invite = await Invite.create({
        email: "operator@example.com",
        role: "operator",
        tokenHash: "secret-hash-456",
        status: "pending",
        expiresAt: new Date(Date.now() + 86400000),
        createdBy: user._id,
      });

      const populatedInvite = await Invite.findById(invite._id).populate("createdBy", "email");
      expect(populatedInvite).not.toBeNull();

      const dto = toInviteDto(populatedInvite!);

      expect(dto.self).toBe(`/api/v1/invites/${invite._id.toString()}`);
      expect(dto._id).toBe(invite._id.toString());
      expect(dto.email).toBe("operator@example.com");
      expect(dto.createdBy).toEqual({ email: "admin-creator@example.com" });
    });
  });

  describe("toCreateInviteDto", () => {
    test("projects only required fields for created invite response", async () => {
      const creatorId = new mongoose.Types.ObjectId();
      const invite = await Invite.create({
        email: "newlycreated@example.com",
        role: "operator",
        tokenHash: "secret-hash-789",
        status: "pending",
        expiresAt: new Date(Date.now() + 86400000),
        createdBy: creatorId,
      });

      const dto = toCreateInviteDto(invite);

      expect(dto).toEqual({
        self: `/api/v1/invites/${invite._id.toString()}`,
        _id: invite._id.toString(),
        email: "newlycreated@example.com",
        role: "operator",
        status: "pending",
        expiresAt: invite.expiresAt.toISOString(),
      });
      expect("tokenHash" in dto).toBe(false);
      expect("createdBy" in dto).toBe(false);
    });
  });

  describe("validateInviteToken", () => {
    test("validates valid pending invite token", async () => {
      const rawToken = "my-secret-invitation-token-123";
      const tokenHash = hashTokenSha256(rawToken);
      const creatorId = new mongoose.Types.ObjectId();

      await Invite.create({
        email: "valid@example.com",
        role: "operator",
        tokenHash,
        status: "pending",
        expiresAt: new Date(Date.now() + 86400000),
        createdBy: creatorId,
      });

      const result = await validateInviteToken(rawToken);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.valid).toBe(true);
        expect(result.data.email).toBe("valid@example.com");
        expect(result.data.role).toBe("operator");
      }
    });

    test("returns 404 for invalid invite token", async () => {
      const result = await validateInviteToken("non-existent-token");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(404);
        expect(result.code).toBe("invite_invalid_token");
      }
    });

    test("returns 400 for revoked or accepted invite", async () => {
      const rawToken = "already-revoked-token";
      const tokenHash = hashTokenSha256(rawToken);
      const creatorId = new mongoose.Types.ObjectId();

      await Invite.create({
        email: "revoked@example.com",
        role: "operator",
        tokenHash,
        status: "revoked",
        expiresAt: new Date(Date.now() + 86400000),
        createdBy: creatorId,
      });

      const result = await validateInviteToken(rawToken);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.code).toBe("invite_invalid_status");
      }
    });

    test("returns 400 for expired invite", async () => {
      const rawToken = "expired-token-123";
      const tokenHash = hashTokenSha256(rawToken);
      const creatorId = new mongoose.Types.ObjectId();

      await Invite.create({
        email: "expired@example.com",
        role: "operator",
        tokenHash,
        status: "pending",
        expiresAt: new Date(Date.now() - 10000), // past
        createdBy: creatorId,
      });

      const result = await validateInviteToken(rawToken);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.code).toBe("invite_expired");
      }
    });
  });
});
