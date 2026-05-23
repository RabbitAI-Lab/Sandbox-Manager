import { useState, useEffect } from "react";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { listImages } from "@/api/images";
import type { ImageInfo } from "@/api/types";

interface CreateSandboxProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (opts: {
    image: string;
    name: string;
    timeoutSeconds: number;
    env?: Record<string, string>;
  }) => Promise<void>;
}

export function CreateSandbox({ open, onClose, onSubmit }: CreateSandboxProps) {
  const [name, setName] = useState(`sandbox-${Date.now()}`);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [image, setImage] = useState<string>("");
  const [timeout, setTimeout_] = useState(60);
  const [envText, setEnvText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listImages()
      .then((list) => {
        const ready = list.filter((img) => img.status === "ready");
        setImages(ready);
        if (ready.length > 0 && !image) {
          setImage(ready[0].image);
        }
      })
      .catch(() => {});
  }, [open]);

  const handleSubmit = async () => {
    if (!image.trim()) {
      setError("Image is required");
      return;
    }

    const env: Record<string, string> = {};
    if (envText.trim()) {
      for (const line of envText.split("\n")) {
        const eq = line.indexOf("=");
        if (eq > 0) {
          env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        image: image.trim(),
        name: name.trim(),
        timeoutSeconds: timeout * 60,
        env: Object.keys(env).length > 0 ? env : undefined,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Sandbox"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Create
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="sandbox-name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
          {images.length > 0 ? (
            <>
              <select
                value={images.some((img) => img.image === image) ? image : "__custom__"}
                onChange={(e) => {
                  if (e.target.value !== "__custom__") {
                    setImage(e.target.value);
                  }
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
              >
                {images.map((img) => (
                  <option key={img.daemonSetName} value={img.image}>
                    {img.image}
                  </option>
                ))}
                {!images.some((img) => img.image === image) && image && (
                  <option value="__custom__">{image}</option>
                )}
              </select>
              <input
                type="text"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none mt-2"
                placeholder="Or enter a custom image"
              />
            </>
          ) : (
            <input
              type="text"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              placeholder="Enter image (e.g. nginx:latest)"
            />
          )}
          <p className="text-xs text-gray-400 mt-1">
            Pulled images are listed above. You can also enter any custom image.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Timeout (minutes)
          </label>
          <input
            type="number"
            value={timeout}
            onChange={(e) => setTimeout_(Number(e.target.value))}
            min={5}
            max={1440}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Environment Variables
          </label>
          <textarea
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="KEY=value&#10;ANOTHER=value"
          />
          <p className="text-xs text-gray-400 mt-1">One per line, KEY=value format</p>
        </div>
      </div>
    </Modal>
  );
}
