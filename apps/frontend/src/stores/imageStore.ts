import { create } from "zustand";
import * as imageApi from "@/api/images";
import type { ImageInfo } from "@/api/types";

interface ImageState {
  images: ImageInfo[];
  loading: boolean;
  pulling: boolean;
  error: string | null;

  fetchImages: () => Promise<void>;
  pullImage: (image: string) => Promise<ImageInfo>;
  deleteImage: (name: string) => Promise<void>;
  refreshImageStatus: (name: string) => Promise<void>;
}

export const useImageStore = create<ImageState>((set, get) => ({
  images: [],
  loading: false,
  pulling: false,
  error: null,

  fetchImages: async () => {
    set({ loading: true, error: null });
    try {
      const images = await imageApi.listImages();
      set({ images, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  pullImage: async (image: string) => {
    set({ pulling: true, error: null });
    try {
      const result = await imageApi.pullImage(image);
      await get().fetchImages();
      set({ pulling: false });
      return result;
    } catch (err) {
      set({ error: (err as Error).message, pulling: false });
      throw err;
    }
  },

  deleteImage: async (name: string) => {
    await imageApi.deleteImage(name);
    set((s) => ({ images: s.images.filter((img) => img.daemonSetName !== name) }));
  },

  refreshImageStatus: async (name: string) => {
    const updated = await imageApi.getImageStatus(name);
    set((s) => ({
      images: s.images.map((img) =>
        img.daemonSetName === name ? updated : img,
      ),
    }));
  },
}));
