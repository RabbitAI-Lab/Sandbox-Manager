import { request } from "./client";
import type {
  ServerProfile,
  CreateProfileBody,
  UpdateProfileBody,
  ProfilesListResponse,
  TestConnectionResult,
} from "./types";

export function listProfiles(): Promise<ProfilesListResponse> {
  return request("GET", "/profiles");
}

export function createProfile(body: CreateProfileBody): Promise<ServerProfile> {
  return request("POST", "/profiles", body);
}

export function updateProfile(id: string, body: UpdateProfileBody): Promise<ServerProfile> {
  return request("PUT", `/profiles/${id}`, body);
}

export function deleteProfile(id: string): Promise<void> {
  return request("DELETE", `/profiles/${id}`);
}

export function switchProfile(id: string): Promise<{ configured: boolean }> {
  return request("POST", `/profiles/${id}/switch`);
}

export function testProfile(id: string): Promise<TestConnectionResult> {
  return request("POST", `/profiles/${id}/test`);
}
