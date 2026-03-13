/**
 * 格式排版预设 API — 自定义预设的 CRUD
 */
import { api } from "./client";

export interface FormatPresetDTO {
  id: string;
  name: string;
  category: string;
  description: string;
  instruction: string;
  system_prompt: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export async function apiListFormatPresets(): Promise<FormatPresetDTO[]> {
  const res = await api.get<FormatPresetDTO[]>("/format-presets");
  return res.data;
}

export async function apiCreateFormatPreset(body: {
  name: string;
  category?: string;
  description?: string;
  instruction?: string;
  system_prompt?: string;
}): Promise<FormatPresetDTO> {
  const res = await api.post<FormatPresetDTO>("/format-presets", body);
  return res.data;
}

export async function apiUpdateFormatPreset(
  id: string,
  body: {
    name?: string;
    category?: string;
    description?: string;
    instruction?: string;
    system_prompt?: string;
  },
): Promise<FormatPresetDTO> {
  const res = await api.put<FormatPresetDTO>(`/format-presets/${id}`, body);
  return res.data;
}

export async function apiDeleteFormatPreset(id: string): Promise<void> {
  await api.delete(`/format-presets/${id}`);
}
