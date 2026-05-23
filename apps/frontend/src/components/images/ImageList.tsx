import { ImageCard } from "./ImageCard";
import { useImageStore } from "@/stores/imageStore";

export function ImageList() {
  const { images, loading, deleteImage, refreshImageStatus } = useImageStore();

  if (loading && images.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
            <div className="h-4 bg-gray-100 rounded w-1/2 mb-4" />
            <div className="flex gap-2">
              <div className="h-8 bg-gray-100 rounded w-20" />
              <div className="h-8 bg-gray-100 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-gray-400 mb-3">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-gray-500 text-lg">No pre-pulled images</p>
        <p className="text-gray-400 text-sm mt-1">Pull an image to cache it on all cluster nodes</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {images.map((img) => (
        <ImageCard
          key={img.daemonSetName}
          image={img}
          onDelete={deleteImage}
          onRefresh={refreshImageStatus}
        />
      ))}
    </div>
  );
}
