import {
  UserSchema,
  PublicUserSchema,
  type User as UserDto,
  type PublicUser as PublicUserDto,
} from "@wattguard/shared";
import type { HydratedUser } from "../models/User";

export const toUserDto = (user: HydratedUser): UserDto => {
  return UserSchema.parse(user.toObject());
};

export const toPublicUserDto = (user: HydratedUser): PublicUserDto => {
  return PublicUserSchema.parse(user.toObject());
};
