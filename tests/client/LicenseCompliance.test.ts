import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("standalone fork license compliance", () => {
  it("keeps OpenFront's AGPL additional terms intact", () => {
    const license = read("LICENSE");
    expect(license).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
    expect(license).toContain("© OpenFront and Contributors");
    expect(license).toContain("Prohibition of Misrepresentation");
  });

  it("offers corresponding source and the appropriate legal notices", () => {
    const notice = read("NOTICE.md");
    const page = read("src/client/components/LegalNoticePage.ts");
    const drawer = read("src/client/components/MobileNavBar.ts");

    for (const source of [notice, page, drawer]) {
      expect(source).toContain("© OpenFront and Contributors");
    }
    expect(page).toContain("provided without");
    expect(page).toContain("https://github.com/StinkyDubeau/OpenFrontIO");
    expect(drawer).toContain('data-page="page-legal"');
  });

  it("does not ship or load the restricted proprietary asset directory", () => {
    expect(fs.existsSync(path.join(root, "proprietary"))).toBe(false);

    const runtimeFiles = [
      "Dockerfile",
      "index.html",
      "vite.config.ts",
      "src/client/Main.ts",
      "src/client/sound/SoundManager.ts",
      "src/server/RenderHtml.ts",
    ];
    for (const file of runtimeFiles) {
      expect(read(file)).not.toMatch(
        /COPY proprietary|getProprietaryDir|OpenFront\.ttf|sounds\/music\/(?:of4|openfront|war)\.mp3/,
      );
    }
  });
});
