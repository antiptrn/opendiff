import { Hono } from "hono";
import { prisma } from "../db";
import { getAuthUser, requireAuth } from "../middleware/auth";

const skillsRoutes = new Hono();

skillsRoutes.use(requireAuth());

// List user's skills
skillsRoutes.get("/skills", async (c) => {
  const user = getAuthUser(c);

  const search = c.req.query("search")?.trim() || "";
  const page = Math.max(1, Number.parseInt(c.req.query("page") || "1"));
  const limit = Math.min(50, Math.max(1, Number.parseInt(c.req.query("limit") || "20")));

  const where = {
    userId: user.id,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [skills, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        resources: {
          select: { id: true, path: true, createdAt: true },
        },
      },
    }),
    prisma.skill.count({ where }),
  ]);

  return c.json({
    skills,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get skill detail
skillsRoutes.get("/skills/:id", async (c) => {
  const user = getAuthUser(c);

  const { id } = c.req.param();

  const skill = await prisma.skill.findUnique({
    where: { id },
    include: { resources: true },
  });

  if (!skill || skill.userId !== user.id) {
    return c.json({ error: "Skill not found" }, 404);
  }

  return c.json({ skill });
});

// Create skill
skillsRoutes.post("/skills", async (c) => {
  const user = getAuthUser(c);

  const body = await c.req.json<{
    name: string;
    description: string;
    content: string;
  }>();

  if (!body.name?.trim()) {
    return c.json({ error: "Name is required" }, 400);
  }
  if (!body.description?.trim()) {
    return c.json({ error: "Description is required" }, 400);
  }
  if (!body.content?.trim()) {
    return c.json({ error: "Content is required" }, 400);
  }

  // Validate name format (alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(body.name.trim())) {
    return c.json(
      { error: "Name must only contain letters, numbers, hyphens, and underscores" },
      400
    );
  }

  if (body.name.trim().length > 100) {
    return c.json({ error: "Name must be 100 characters or less" }, 400);
  }

  // Check for duplicate name
  const existing = await prisma.skill.findUnique({
    where: { userId_name: { userId: user.id, name: body.name.trim() } },
  });
  if (existing) {
    return c.json({ error: "A skill with this name already exists" }, 409);
  }

  const skill = await prisma.skill.create({
    data: {
      userId: user.id,
      name: body.name.trim(),
      description: body.description.trim(),
      content: body.content.trim(),
    },
  });

  return c.json({ skill }, 201);
});

// Update skill
skillsRoutes.put("/skills/:id", async (c) => {
  const user = getAuthUser(c);

  const { id } = c.req.param();

  const existing = await prisma.skill.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return c.json({ error: "Skill not found" }, 404);
  }

  const body = await c.req.json<{
    name?: string;
    description?: string;
    content?: string;
  }>();

  const data: Record<string, string> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return c.json({ error: "Name is required" }, 400);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return c.json(
        { error: "Name must only contain letters, numbers, hyphens, and underscores" },
        400
      );
    }
    if (name.length > 100) {
      return c.json({ error: "Name must be 100 characters or less" }, 400);
    }
    // Check for duplicate name if changing
    if (name !== existing.name) {
      const dup = await prisma.skill.findUnique({
        where: { userId_name: { userId: user.id, name } },
      });
      if (dup) {
        return c.json({ error: "A skill with this name already exists" }, 409);
      }
    }
    data.name = name;
  }

  if (body.description !== undefined) {
    if (!body.description.trim()) {
      return c.json({ error: "Description is required" }, 400);
    }
    data.description = body.description.trim();
  }

  if (body.content !== undefined) {
    if (!body.content.trim()) {
      return c.json({ error: "Content is required" }, 400);
    }
    data.content = body.content.trim();
  }

  const skill = await prisma.skill.update({
    where: { id },
    data,
  });

  return c.json({ skill });
});

// Delete skill
skillsRoutes.delete("/skills/:id", async (c) => {
  const user = getAuthUser(c);

  const { id } = c.req.param();

  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill || skill.userId !== user.id) {
    return c.json({ error: "Skill not found" }, 404);
  }

  await prisma.skill.delete({ where: { id } });

  return c.json({ success: true });
});

// Upload resource file to a skill
skillsRoutes.post("/skills/:id/resources", async (c) => {
  const user = getAuthUser(c);

  const { id } = c.req.param();

  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill || skill.userId !== user.id) {
    return c.json({ error: "Skill not found" }, 404);
  }

  const body = await c.req.json<{ path: string; content: string }>();

  if (!body.path?.trim()) {
    return c.json({ error: "Path is required" }, 400);
  }
  if (body.content === undefined || body.content === null) {
    return c.json({ error: "Content is required" }, 400);
  }

  // Validate path (no directory traversal)
  const normalizedPath = body.path.trim();
  if (normalizedPath.includes("..") || normalizedPath.startsWith("/")) {
    return c.json({ error: "Invalid resource path" }, 400);
  }

  const resource = await prisma.skillResource.create({
    data: {
      skillId: id,
      path: normalizedPath,
      content: body.content,
    },
  });

  return c.json({ resource }, 201);
});

// Remove resource from a skill
skillsRoutes.delete("/skills/:id/resources/:resourceId", async (c) => {
  const user = getAuthUser(c);

  const { id, resourceId } = c.req.param();

  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill || skill.userId !== user.id) {
    return c.json({ error: "Skill not found" }, 404);
  }

  const resource = await prisma.skillResource.findUnique({
    where: { id: resourceId },
  });
  if (!resource || resource.skillId !== id) {
    return c.json({ error: "Resource not found" }, 404);
  }

  await prisma.skillResource.delete({ where: { id: resourceId } });

  return c.json({ success: true });
});

export { skillsRoutes };
