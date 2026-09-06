/**
 * User route schemas
 * 
 * Routes: /api/v1/users (GET, PATCH, DELETE)
 */
import { z } from "zod";
import { UserSchema } from "./common";
import { ObjectIdSchema } from "./common"

/**
 * GET /api/v1/users - List all users response
 */
export const ListUsersResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(UserSchema).describe("List of users"),
}).meta({ id: "ListUsersResponse" });

export type ListUsersResponse = z.infer<typeof ListUsersResponseSchema>;

/**
 * GET /api/v1/users/:id - Get user by ID parameter
 */
export const GetUserParamsSchema = z.object({
  id: ObjectIdSchema
});

export type GetUserParams = z.infer<typeof GetUserParamsSchema>;

/**
 * GET /api/v1/users/:id - Get user by ID response
 * PATCH /api/v1/users/:id - Update user response
 */
export const UserResponseSchema = z.object({
  success: z.literal(true),
  data: UserSchema,
}).meta({ id: "UserResponse" });

export type UserResponse = z.infer<typeof UserResponseSchema>;

/**
 * PATCH /api/v1/users/:id - Update user path parameter
 */
export const UpdateUserParamsSchema = z.object({
  id: ObjectIdSchema
});

/**
 * PATCH /api/v1/users/:id - Update user request body (partial update)
 */
export const UpdateUserRequestSchema = UserSchema.pick({ role: true, isDisabled: true })
  .partial()
  .refine((data) => data.role !== undefined || data.isDisabled !== undefined, {
    message: "At least one field (role or isDisabled) must be provided",
  }).meta({ id: "UpdateUserRequest" });

export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

/**
 * DELETE /api/v1/users/:id - Delete user path parameter
 */
export const DeleteUserParamsSchema = z.object({
  id: ObjectIdSchema
});
