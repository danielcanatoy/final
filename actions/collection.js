"use server";

import aj from "@/lib/arcjet";
import { db } from "@/lib/prisma";
import { request } from "@arcjet/next";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export async function getCollections() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const users = await db.$queryRawUnsafe(
    `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
    userId
  );

  if (users.length === 0) throw new Error("User not found");

  const user = users[0];

  const collections = await db.$queryRawUnsafe(
    `SELECT * FROM Collection WHERE userId = ? ORDER BY createdAt DESC`,
    user.id
  );

  return collections;
}

export async function createCollection(data) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const req = await request();

    const decision = await aj.protect(req, {
      userId,
      requested: 1,
    });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        const { remaining, reset } = decision.reason;
        console.error({
          code: "RATE_LIMIT_EXCEEDED",
          details: { remaining, resetInSeconds: reset },
        });
        throw new Error("Too many requests. Please try again later.");
      }
      throw new Error("Request blocked");
    }

    const users = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      userId
    );

    if (users.length === 0) throw new Error("User not found");

    const user = users[0];

    const newId = crypto.randomUUID(); // or use `cuid` if preferred

    await db.$executeRawUnsafe(
      `INSERT INTO Collection (id, name, description, userId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      newId,
      data.name,
      data.description,
      user.id
    );

    const newCollection = await db.$queryRawUnsafe(
      `SELECT * FROM Collection WHERE id = ?`,
      newId
    );

    revalidatePath("/dashboard");
    return newCollection[0];
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function deleteCollection(id) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const users = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      userId
    );

    if (users.length === 0) throw new Error("User not found");

    const user = users[0];

    const collections = await db.$queryRawUnsafe(
      `SELECT * FROM Collection WHERE id = ? AND userId = ? LIMIT 1`,
      id,
      user.id
    );

    if (collections.length === 0) throw new Error("Collection not found");

    await db.$executeRawUnsafe(`DELETE FROM Collection WHERE id = ?`, id);

    return true;
  } catch (error) {
    throw new Error(error.message);
  }
}
