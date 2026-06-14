import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface TmpDir {
  dir: string;       // base dir (PROJECT_MEMORY_DIR — parent of .project-memory/)
  pmDir: string;     // dir/.project-memory/
  cleanup: () => void;
}

export function createTmpDir(): TmpDir {
  const dir = mkdtempSync(join(tmpdir(), "pm-test-"));
  const pmDir = join(dir, ".project-memory");
  mkdirSync(pmDir, { recursive: true });
  return {
    dir,
    pmDir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
