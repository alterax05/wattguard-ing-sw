/**
 * User route schemas
 * 
 * Routes: /api/v1/users (GET, PATCH, DELETE)
 */
import { z } from "zod";
import { UserSchema } from "./common";

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
  id: z.string().min(1, "User ID is required").describe("User identifier"),
});

export type GetUserParams = z.infer<typeof GetUserParamsSchema>;

/**
 * GET /api/v1/users/:id - Get user by ID response
 */
export const GetUserResponseSchema = z.object({
  success: z.literal(true),
  data: UserSchema,
}).meta({ id: "GetUserResponse" });

export type GetUserResponse = z.infer<typeof GetUserResponseSchema>;

/**
 * PATCH /api/v1/users/:id - Update user path parameter
 */
export const UpdateUserParamsSchema = z.object({
  id: z.string().min(1, "User ID is required").describe("User identifier"),
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
 * PATCH /api/v1/users/:id - Update user response
 */
export const UpdateUserResponseSchema = z.object({
  success: z.literal(true),
  data: UserSchema,
}).meta({ id: "UpdateUserResponse" });

export type UpdateUserResponse = z.infer<typeof UpdateUserResponseSchema>;

/**
 * DELETE /api/v1/users/:id - Delete user path parameter
 */
export const DeleteUserParamsSchema = z.object({
  id: z.string().min(1, "User ID is required").describe("User identifier"),
});

/**
 * DELETE /api/v1/users/:id - Delete user response
 */
export const DeleteUserResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().describe("Deleted user identifier"),
  }),
}).meta({ id: "DeleteUserResponse" });

export type DeleteUserResponse = z.infer<typeof DeleteUserResponseSchema>;
