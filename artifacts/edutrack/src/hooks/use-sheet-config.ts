import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

export type DriveFile = {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
};

export function useSheetConfig() {
  const [sheetId, setSheetIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [manualSheetId, setManualSheetId] = useState<string>("");

  const setSheetId = useCallback((id: string | null) => {
    setSheetIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
      localStorage.setItem("edutrack_sheet_linked", "true");
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("edutrack_sheet_linked");
    }
  }, []);

  const clearSheetId = useCallback(() => {
    setSheetIdState(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("edutrack_sheet_linked");
  }, []);

  const fetchDriveFiles = useCallback(async () => {
    setLoadingFiles(true);
    setFilesError(null);
    try {
      const res = await fetch(apiUrl("/sheets/drive-files"));
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      const data = JSON.parse(text);
      setDriveFiles(data.files ?? []);
    } catch (err: any) {
      setFilesError(err.message ?? "Failed to load spreadsheets");
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const createNewSheet = useCallback(async (): Promise<string | null> => {
    setCreating(true);
    try {
      const res = await fetch(apiUrl("/sheets/setup"), { method: "POST" });
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      const data = JSON.parse(text);
      return data.spreadsheetId as string;
    } catch (err: any) {
      throw err;
    } finally {
      setCreating(false);
    }
  }, []);

  const [seeding, setSeeding] = useState(false);

  const seedSheet = useCallback(async (id: string): Promise<void> => {
    setSeeding(true);
    try {
      const res = await fetch(apiUrl("/sheets/seed"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId: id }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text);
    } catch (err: any) {
      throw err;
    } finally {
      setSeeding(false);
    }
  }, []);

  useEffect(() => {
    fetchDriveFiles();
  }, [fetchDriveFiles]);

  return {
    sheetId,
    setSheetId,
    clearSheetId,
    manualSheetId,
    setManualSheetId,
    driveFiles,
    loadingFiles,
    filesError,
    creating,
    createNewSheet,
    seeding,
    seedSheet,
    refreshFiles: fetchDriveFiles,
  };
}
