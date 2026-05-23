import { useState } from "react";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";

interface PullImageModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (image: string) => Promise<void>;
}

const PRESET_IMAGES = [
  "ghcr.io/rabbitai-lab/agent-browser:latest",
  "ghcr.io/rabbitai-lab/claude-code:latest",
  "ubuntu:22.04",
  "nginx:latest",
  "node:20",
  "python:3.12",
] as const;

export function PullImageModal({ open, onClose, onSubmit }: PullImageModalProps) {
  const [image, setImage] = useState<string>("ubuntu:22.04");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!image.trim()) {
      setError("Image is required");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(image.trim());
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
      title="Pull Image"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Pull
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
          <select
            value={PRESET_IMAGES.includes(image as (typeof PRESET_IMAGES)[number]) ? image : "__custom__"}
            onChange={(e) => {
              if (e.target.value !== "__custom__") {
                setImage(e.target.value);
              }
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
          >
            {PRESET_IMAGES.map((img) => (
              <option key={img} value={img}>
                {img}
              </option>
            ))}
            {!PRESET_IMAGES.includes(image as (typeof PRESET_IMAGES)[number]) && (
              <option value="__custom__">{image}</option>
            )}
          </select>
          <input
            type="text"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none mt-2"
            placeholder="Or enter a custom image (e.g. nginx:latest)"
          />
          <p className="text-xs text-gray-400 mt-1">
            The image will be pulled to all cluster nodes via a DaemonSet.
          </p>
        </div>
      </div>
    </Modal>
  );
}
