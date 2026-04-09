import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "edutrack_sheet_id";

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

  const setSheetId = useCallback((id: string | null) => {
    setSheetIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const fetchDriveFiles = useCallback(async () => {
    setLoadingFiles(true);
    setFilesError(null);
    try {
      const res = await fetch("/api/sheets/drive-files");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
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
      const res = await fetch("/api/sheets/setup", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.spreadsheetId as string;
    } catch (err: any) {
      throw err;
    } finally {
      setCreating(false);
    }
  }, []);

  useEffect(() => {
    fetchDriveFiles();
  }, [fetchDriveFiles]);

  return {
    sheetId,
    setSheetId,
    driveFiles,
    loadingFiles,
    filesError,
    creating,
    createNewSheet,
    refreshFiles: fetchDriveFiles,
  };
}
