import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ImageList } from "@/components/images/ImageList";
import { PullImageModal } from "@/components/images/PullImageModal";
import { Button } from "@/components/common/Button";
import { useImageStore } from "@/stores/imageStore";

export function ImagesPage() {
  const [showPull, setShowPull] = useState(false);
  const navigate = useNavigate();
  const { fetchImages, pullImage } = useImageStore();

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handlePull = async (image: string) => {
    await pullImage(image);
  };

  return (
    <AppShell
      title="Image Management"
      onBack={() => navigate("/dashboard")}
      actions={
        <Button onClick={() => setShowPull(true)}>
          + Pull Image
        </Button>
      }
    >
      <div className="p-6 max-w-7xl mx-auto">
        <ImageList />
      </div>
      <PullImageModal
        open={showPull}
        onClose={() => setShowPull(false)}
        onSubmit={handlePull}
      />
    </AppShell>
  );
}
