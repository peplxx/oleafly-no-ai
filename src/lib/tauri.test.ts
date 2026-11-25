import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setFocus: vi.fn() }),
}));

import {
  copyFile,
  createFile,
  deleteFile,
  importPathsIntoProject,
  isMissingCompiledPdf,
  onProjectWriteFailure,
  readFileContent,
  renameFile,
  saveFileBase64,
  writeFileContent,
  writeProjectBytes,
} from "./tauri";

beforeEach(() => {
  mocks.invoke.mockReset();
});

describe("compiled PDF bridge", () => {
  it("tells a project that has no PDF yet apart from a PDF that failed to load", () => {
    expect(isMissingCompiledPdf("no compiled PDF: this project has not been compiled")).toBe(true);
    expect(isMissingCompiledPdf("no compiled PDF: No such file or directory (os error 2)")).toBe(true);
    expect(isMissingCompiledPdf(new Error("no compiled PDF: this project has not been compiled"))).toBe(true);
    expect(isMissingCompiledPdf(new Error("InvalidPDFException: Invalid PDF structure."))).toBe(false);
    expect(isMissingCompiledPdf("project is busy")).toBe(false);
    expect(isMissingCompiledPdf(undefined)).toBe(false);
  });
});

describe("file deletion bridge", () => {
  it("sends delete_file the caller's choice between the trash and a permanent delete", async () => {
    mocks.invoke.mockResolvedValue({ generation: 1 });
    await deleteFile("lib-1", "a.md");
    await deleteFile("lib-1", "a.md", undefined, false);
    await deleteFile("lib-1", "a.md", 4, true);
    expect(mocks.invoke.mock.calls).toEqual([
      ["delete_file", { projectId: "lib-1", path: "a.md", expectedGeneration: undefined }],
      ["delete_file", { projectId: "lib-1", path: "a.md", expectedGeneration: undefined, permanent: false }],
      ["delete_file", { projectId: "lib-1", path: "a.md", expectedGeneration: 4, permanent: true }],
    ]);
  });
});

describe("project write failures", () => {
  it("tells listeners which project refused a write and still rejects with the same error", async () => {
    const heard = vi.fn();
    const stop = onProjectWriteFailure(heard);
    const denied = "failed to write main.tex: Permission denied (os error 13)";
    try {
      mocks.invoke.mockRejectedValueOnce(denied);
      await expect(writeFileContent("linked-a", "main.tex", "x")).rejects.toBe(denied);
      mocks.invoke.mockRejectedValueOnce(denied);
      await expect(createFile("linked-a", "notes.tex", false)).rejects.toBe(denied);
      expect(heard).toHaveBeenCalledTimes(2);
      expect(heard).toHaveBeenCalledWith("linked-a");
    } finally {
      stop();
    }
  });

  it.each([
    ["writeProjectBytes", () => writeProjectBytes("linked-a", "figures/a.png", "AA==")],
    ["writeFileContent", () => writeFileContent("linked-a", "main.tex", "x")],
    ["createFile", () => createFile("linked-a", "notes.tex", false)],
    ["deleteFile", () => deleteFile("linked-a", "notes.tex")],
    ["renameFile", () => renameFile("linked-a", "notes.tex", "draft.tex")],
    ["copyFile", () => copyFile("linked-a", "notes.tex", "copy.tex")],
    ["importPathsIntoProject", () => importPathsIntoProject("linked-a", "figures", ["/tmp/a.png"])],
    ["saveFileBase64", () => saveFileBase64("linked-a", "out.pdf", "AA==")],
  ] as const)("reports a refused %s to listeners", async (_name, write) => {
    const heard = vi.fn();
    const stop = onProjectWriteFailure(heard);
    try {
      mocks.invoke.mockRejectedValueOnce("denied");
      await expect(write()).rejects.toBe("denied");
      expect(heard).toHaveBeenCalledExactlyOnceWith("linked-a");
    } finally {
      stop();
    }
  });

  it("stays quiet for successful writes, reads and removed listeners", async () => {
    const heard = vi.fn();
    const stop = onProjectWriteFailure(heard);
    mocks.invoke.mockResolvedValueOnce({ generation: 3 });
    await expect(writeProjectBytes("linked-a", "figures/a.png", "AA==")).resolves.toEqual({ generation: 3 });
    mocks.invoke.mockRejectedValueOnce("missing");
    await expect(readFileContent("linked-a", "main.tex")).rejects.toBe("missing");
    stop();
    mocks.invoke.mockRejectedValueOnce("denied");
    await expect(writeFileContent("linked-a", "main.tex", "x")).rejects.toBe("denied");
    expect(heard).not.toHaveBeenCalled();
  });
});
