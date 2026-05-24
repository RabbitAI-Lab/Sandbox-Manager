import { Router, type Request } from "express";
import { DomainService } from "../services/domainService.js";
import type { AppLocals } from "../server.js";

export const domainsRouter = Router();

function getAppLocals(req: Request) {
  return req.app.locals as AppLocals;
}

// GET /api/domains
domainsRouter.get("/", (req, res) => {
  const { logger } = getAppLocals(req);
  const domainService = new DomainService(logger);
  const domains = domainService.listDomains();
  res.json({ success: true, data: domains });
});

// POST /api/domains
domainsRouter.post("/", (req, res) => {
  const { logger } = getAppLocals(req);
  const domainService = new DomainService(logger);

  const { domain } = req.body;
  if (!domain || typeof domain !== "string") {
    res.status(400).json({ success: false, error: { code: "MISSING_FIELD", message: "domain is required" } });
    return;
  }

  try {
    const domains = domainService.addDomain(domain);
    res.status(201).json({ success: true, data: domains });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: { code: "INVALID_DOMAIN", message } });
  }
});

// DELETE /api/domains/:domain
domainsRouter.delete("/:domain", (req, res) => {
  const { logger } = getAppLocals(req);
  const domainService = new DomainService(logger);

  const { domain } = req.params;
  if (!domain) {
    res.status(400).json({ success: false, error: { code: "MISSING_FIELD", message: "domain is required" } });
    return;
  }

  try {
    const domains = domainService.removeDomain(decodeURIComponent(domain));
    res.json({ success: true, data: domains });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message } });
  }
});

// PUT /api/domains — bulk update (reorder/replace all)
domainsRouter.put("/", (req, res) => {
  const { logger } = getAppLocals(req);
  const domainService = new DomainService(logger);

  const { domains } = req.body;
  if (!Array.isArray(domains)) {
    res.status(400).json({ success: false, error: { code: "INVALID_BODY", message: "domains must be an array" } });
    return;
  }

  try {
    const result = domainService.updateDomains(domains);
    res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: { code: "INVALID_DOMAIN", message } });
  }
});
