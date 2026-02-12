import { Hono } from "hono";
import { findDbUserFromToken } from "../auth";
import { prisma } from "../db";

const feedbackRoutes = new Hono();

// Submit feedback
feedbackRoutes.post("/", async (c) => {
  const authHeader = c.req.header("Authorization");
  let user = null;

  // Auth is optional for feedback
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    user = await findDbUserFromToken(token);
  }

  const body = await c.req.json();
  const { message, page } = body;

  if (!message || typeof message !== "string" || message.trim().length < 1) {
    return c.json({ error: "Feedback message is required" }, 400);
  }

  if (message.length > 5000) {
    return c.json({ error: "Feedback message is too long (max 5000 characters)" }, 400);
  }

  const feedback = await prisma.feedback.create({
    data: {
      userId: user?.id,
      message: message.trim(),
      page: page || null,
      userAgent: c.req.header("User-Agent") || null,
    },
  });

  return c.json({ success: true, id: feedback.id }, 201);
});

export { feedbackRoutes };
