import {
  UserSchema,
  PublicUserSchema,
  type User as UserDto,
  type PublicUser as PublicUserDto,
} from "@wattguard/shared";
import type { HydratedUser } from "../models/User";

export const toUserDto = (user: HydratedUser): UserDto => {
  const obj = user.toObject();
  return UserSchema.parse({
    ...obj,
    self: `/api/v1/users/${String(obj._id)}`,
  });
};

export const toPublicUserDto = (user: HydratedUser): PublicUserDto => {
  const obj = user.toObject();
  return PublicUserSchema.parse({
    ...obj,
    self: `/api/v1/users/${String(obj._id)}`,
  });
};
