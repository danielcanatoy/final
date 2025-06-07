import { currentUser } from "@clerk/nextjs/server";
import { db } from "./prisma";

import { v4 as uuidv4 } from "uuid"; // or use cuid()

export const checkUser = async () => {
  const user = await currentUser();
  if (!user) return null;

  try {
    // 1. Look for existing user using raw SQL
    const existingUser = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      user.id
    );

    if (existingUser.length > 0) {
      return existingUser[0];
    }

    // 2. Create new user
    const name = `${user.firstName} ${user.lastName}`;
    const email = user.emailAddresses[0].emailAddress;
    const id = uuidv4(); // or use cuid()

    await db.$executeRawUnsafe(
      `INSERT INTO User (id, clerkUserId, name, imageUrl, email, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      id,
      user.id,
      name,
      user.imageUrl,
      email
    );

    // 3. Return the newly inserted user
    const newUser = await db.$queryRawUnsafe(
      `SELECT * FROM User WHERE clerkUserId = ? LIMIT 1`,
      user.id
    );

    return newUser[0];
  } catch (error) {
    console.error("Error checking user:", error.message);
    return null;
  }
};
