import { Router } from "express";
import type { Request } from "express";
import type { AppServices } from "../server.js";
import type { ImageService } from "../services/imageService.js";
import type { ApiResponse, PullImageBody } from "../types/index.js";

export const imagesRouter = Router();

function getImageService(req: Request): ImageService {
  const { services } = req.app.locals as { services: AppServices };
  return services.imageService;
}

// List cached images on cluster nodes (must be before /:name to avoid route collision)
imagesRouter.get("/cached", async (_req, res, next) => {
  try {
    const svc = getImageService(_req);
    const data = await svc.listCachedImages();
    res.json({ success: true, data } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// List all pre-pulled images
imagesRouter.get("/", async (req, res, next) => {
  try {
    const svc = getImageService(req);
    const data = await svc.listImages();
    res.json({ success: true, data } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Pull a new image to the cluster
imagesRouter.post("/", async (req, res, next) => {
  try {
    const body = req.body as PullImageBody;
    if (!body.image?.trim()) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_ARGUMENT", message: "image field is required" },
      });
      return;
    }
    const svc = getImageService(req);
    const data = await svc.pullImage(body.image.trim());
    res.status(202).json({ success: true, data } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Get image pull status
imagesRouter.get("/:name/status", async (req, res, next) => {
  try {
    const svc = getImageService(req);
    const name = (req.params as Record<string, string>).name;
    const data = await svc.getImageStatus(name);
    res.json({ success: true, data } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Delete a pre-pulled image
imagesRouter.delete("/:name", async (req, res, next) => {
  try {
    const svc = getImageService(req);
    const name = (req.params as Record<string, string>).name;
    await svc.deleteImage(name);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
